from flask import Flask, request, jsonify
import os
import subprocess
from openai import OpenAI
from supabase import create_client

app = Flask(__name__)

# Clients
openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
supabase_url = os.environ.get("VITE_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Service role is needed to bypass RLS for background workers
supabase = create_client(supabase_url, supabase_key)

@app.route('/process_media', methods=['POST'])
def process_media():
    data = request.json
    url = data.get('url')
    source = data.get('source', 'unknown')
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
        
    print(f"📥 [OMNI-SYNC] Starting download for {source}: {url}")
    
    try:
        # 1. Download audio using yt-dlp (Extract audio to save Whisper API costs)
        output_template = "temp_audio.%(ext)s"
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
        audio_file = "temp_audio.mp3"
        
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
        
        # 3. Create Embeddings for Supabase
        print("🧠 [OMNI-SYNC] Creating embeddings...")
        response = openai_client.embeddings.create(
            input=text_content,
            model="text-embedding-3-small"
        )
        embedding = response.data[0].embedding
        
        # 4. Save to Supabase knowledge_sources
        print("💾 [OMNI-SYNC] Saving to Knowledge Base...")
        item_data = {
            "title": f"Auto-Sync: {source.capitalize()} Video",
            "type": "text",
            "source_type": source,
            "source_url": url,
            "content": text_content,
            "embedding": embedding,
            "status": "processed",
            "word_count": len(text_content.split())
        }
        
        supabase.table("knowledge_sources").insert(item_data).execute()
        
        print(f"✅ [OMNI-SYNC] Processing complete for {url}!")
        return jsonify({'status': 'success', 'source': source, 'words': len(text_content.split())})

    except Exception as e:
        print(f"❌ [OMNI-SYNC] Error: {str(e)}")
        if os.path.exists("temp_audio.mp3"):
            os.remove("temp_audio.mp3")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
