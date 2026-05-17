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
        import glob
        
        # 1. Download best available stream (audio preferred, fallback to video)
        output_template = "temp_media.%(ext)s"
        download_command = [
            "yt-dlp",
            "-f", "bestaudio/best",
            "--extractor-args", "youtube:player_client=android",
            "-o", output_template,
            "--",  # Forces yt-dlp to treat the next string as a URL
            url
        ]
        result = subprocess.run(download_command, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"yt-dlp failed: {result.stderr}")
            
        # Find the downloaded file
        downloaded_files = glob.glob("temp_media.*")
        if not downloaded_files:
            raise Exception("No file was downloaded!")
        media_file = downloaded_files[0]
        
        # 2. Transcribe with OpenAI Whisper
        print(f"🎙️ [OMNI-SYNC] Transcribing {media_file} with Whisper...")
        with open(media_file, "rb") as file:
            transcription = openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=file
            )
        text_content = transcription.text
        
        # Cleanup media file
        os.remove(media_file)
        
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
