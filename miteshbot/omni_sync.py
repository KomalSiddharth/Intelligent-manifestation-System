from flask import Flask, request, jsonify
import os
import subprocess
import uuid
import requests
from openai import OpenAI
from supabase import create_client

app = Flask(__name__)

# Clients
openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
supabase_url = os.environ.get("VITE_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Service role is needed to bypass RLS for background workers
supabase = create_client(supabase_url, supabase_key)

OMNI_SYNC_SECRET = os.environ.get("OMNI_SYNC_SECRET")


@app.route('/process_media', methods=['POST'])
def process_media():
    # --- AUTH: shared-secret header required (this worker has no other gate) ---
    if not OMNI_SYNC_SECRET or request.headers.get("X-Sync-Secret") != OMNI_SYNC_SECRET:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.json
    url = data.get('url')
    source = data.get('source', 'unknown')
    profile_id = data.get('profileId')
    user_id = data.get('userId')

    if not url:
        return jsonify({'error': 'URL is required'}), 400
    if not profile_id or not user_id:
        return jsonify({'error': 'profileId and userId are required'}), 400

    print(f"📥 [OMNI-SYNC] Starting download for {source}: {url}")

    # --- DEDUP: skip if this URL was already processed ---
    existing = supabase.table("knowledge_sources").select("id").eq("source_url", url).execute()
    if existing.data:
        print(f"⏭️ [OMNI-SYNC] Already processed, skipping: {url}")
        return jsonify({'status': 'skipped', 'reason': 'already_processed', 'source': source})

    # Unique filename per request — avoids clobbering when requests overlap
    job_id = uuid.uuid4().hex
    audio_file = f"temp_audio_{job_id}.mp3"

    try:
        # 1. Download audio using yt-dlp (Extract audio to save Whisper API costs)
        output_template = f"temp_audio_{job_id}.%(ext)s"
        download_command = [
            "yt-dlp",
            "-x", "--audio-format", "mp3",
            "-o", output_template,
        ]

        # Add platform-specific cookies dynamically
        if source == "youtube":
            download_command.extend(["--extractor-args", "youtube:player_client=android"])
            if os.path.exists("youtube_cookies.txt"):
                print("🍪 [OMNI-SYNC] Using YouTube cookies...")
                download_command.extend(["--cookies", "youtube_cookies.txt"])
        elif source == "instagram":
            if os.path.exists("instagram_cookies.txt"):
                print("🍪 [OMNI-SYNC] Using Instagram cookies...")
                download_command.extend(["--cookies", "instagram_cookies.txt"])

        download_command.extend(["--", url])
        result = subprocess.run(download_command, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"yt-dlp failed: {result.stderr}")

        # 2. Transcribe with OpenAI Whisper
        print("🎙️ [OMNI-SYNC] Transcribing audio with Whisper...")
        with open(audio_file, "rb") as file:
            transcription = openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=file
            )
        text_content = transcription.text

        # Cleanup audio file
        os.remove(audio_file)

        # 3. Hand off to ingest-content's shared chunking + embedding pipeline —
        # this is the same code path Drive/file uploads use, so it writes
        # knowledge_sources + knowledge_chunks in the shape RAG search expects.
        print("💾 [OMNI-SYNC] Sending transcript to ingest-content for chunking + embedding...")
        ingest_resp = requests.post(
            f"{supabase_url}/functions/v1/ingest-content",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {supabase_key}"
            },
            json={
                "action": "ingest_text",
                "title": f"Auto-Sync: {source.capitalize()} Video",
                "content": text_content,
                "url": url,
                "type": source,
                "userId": user_id,
                "profileId": profile_id
            },
            timeout=120
        )

        if not ingest_resp.ok:
            raise Exception(f"ingest-content failed: {ingest_resp.status_code} {ingest_resp.text}")

        ingest_result = ingest_resp.json()
        print(f"✅ [OMNI-SYNC] Processing complete for {url}! Chunks: {ingest_result.get('chunks')}")
        return jsonify({'status': 'success', 'source': source, 'words': len(text_content.split()), 'chunks': ingest_result.get('chunks')})

    except Exception as e:
        print(f"❌ [OMNI-SYNC] Error: {str(e)}")
        if os.path.exists(audio_file):
            os.remove(audio_file)
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
