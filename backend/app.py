from flask import Flask, request, jsonify
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi
from openai import OpenAI
from dotenv import load_dotenv
import os
import re
import tempfile

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

app = Flask(__name__)
CORS(app)

# Initialize OpenAI
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key) if api_key else None

def extract_video_id(url):
    regex = r"(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^\"&?\/\s]{11})"
    match = re.search(regex, url)
    if match:
        return match.group(1)
    return None

@app.route('/transcript', methods=['POST'])
def get_transcript():
    try:
        data = request.json
        url = data.get('url')
        
        if not url:
            return jsonify({'success': False, 'error': 'URL is required'}), 400
            
        video_id = extract_video_id(url)
        if not video_id:
            return jsonify({'success': False, 'error': 'Invalid YouTube URL'}), 400
            
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        full_text = " ".join([item['text'] for item in transcript_list])
        
        return jsonify({
            'success': True,
            'transcript': full_text
        })
        
    except Exception as e:
        print(f"YouTube Error: {str(e)}")
        error_msg = str(e)
        if "TranscriptsDisabled" in error_msg:
             error_msg = "Subtitles are disabled for this video"
        elif "NoTranscriptFound" in error_msg:
             error_msg = "No suitable transcript found"
        return jsonify({'success': False, 'error': error_msg}), 200

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    if not client:
        return jsonify({'success': False, 'error': 'OPENAI_API_KEY not found in .env'}), 500

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400

    try:
        # Save temp file for Whisper
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp:
            file.save(temp.name)
            temp_path = temp.name

        # Transcribe
        with open(temp_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1", 
                file=audio_file,
                response_format="text"
            )

        # Cleanup
        os.unlink(temp_path)

        return jsonify({
            'success': True,
            'transcript': transcription
        })

    except Exception as e:
        print(f"Whisper Error: {str(e)}")
        if 'os.unlink' not in str(e) and 'temp_path' in locals():
            try: os.unlink(temp_path)
            except: pass
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print("🚀 Python Backend running on http://localhost:5000")
    if not api_key:
        print("⚠️  WARNING: OPENAI_API_KEY not found. Video/Audio transcription will fail.")
    app.run(port=5000, debug=True)
