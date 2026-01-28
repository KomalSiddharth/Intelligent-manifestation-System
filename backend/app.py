from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import requests
import os
import sys
import time
import random
import string
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi

load_dotenv()

app = Flask(__name__)
CORS(app)

DAILY_API_KEY = os.getenv("DAILY_API_KEY")

def generate_room_name(user_id):
    """Generate unique room name"""
    timestamp = int(time.time())
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"voice-{user_id[:8]}-{timestamp}-{random_suffix}"

@app.route('/start-session', methods=['POST'])
def start_session():
    """Create Daily.co room and spawn voice worker"""
    
    try:
        data = request.json
        user_id = data.get('user_id', 'anonymous-user')
        
        print(f"📞 Creating voice session for user: {user_id}")
        
        # Generate unique room name
        room_name = generate_room_name(user_id)
        
        # Create Daily.co room
        response = requests.post(
            "https://api.daily.co/v1/rooms",
            headers={
                "Authorization": f"Bearer {DAILY_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "name": room_name,
                "privacy": "private",
                "properties": {
                    "max_participants": 2,
                    "enable_chat": False,
                    "enable_screenshare": False,
                    "start_video_off": True,
                    "start_audio_off": False,
                    "exp": int(time.time()) + 3600
                }
            }
        )
        
        if response.status_code != 200:
            raise Exception(f"Daily.co API error: {response.text}")
        
        room_data = response.json()
        room_url = room_data["url"]
        room_name = room_data["name"]
        
        print(f"✅ Room created: {room_url}")
        
        # Create meeting token
        token_response = requests.post(
            "https://api.daily.co/v1/meeting-tokens",
            headers={
                "Authorization": f"Bearer {DAILY_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "properties": {
                    "room_name": room_name,
                    "is_owner": True
                }
            }
        )
        
        if token_response.status_code != 200:
            raise Exception(f"Token creation error: {token_response.text}")
        
        token = token_response.json()["token"]
        
        # ✅ Start voice worker using same Python as current process
        print(f"🚀 Spawning voice worker with venv Python...")
        subprocess.Popen(
            [
                sys.executable,  # ✅ CRITICAL: Uses venv Python!
                "voice_worker.py",
                room_url,
                token,
                user_id
            ],
            cwd=os.path.dirname(os.path.abspath(__file__))
        )
        
        print(f"✅ Voice worker spawned for room: {room_url}")
        
        return jsonify({
            "success": True,
            "room_url": room_url,
            "token": token,
            "expires_at": room_data["config"]["exp"]
        })
        
    except Exception as e:
        print(f"❌ Error in start_session: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "voice-backend",
        "timestamp": int(time.time())
    })

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 Mitesh AI Voice Backend Starting...")
    print("=" * 60)
    print(f"📍 Port: 5000")
    print(f"🐍 Python: {sys.executable}")
    print(f"🔑 Daily.co API Key: {'✅ Found' if DAILY_API_KEY else '❌ Missing'}")
    print("=" * 60)
    
    if not DAILY_API_KEY:
        print("⚠️ WARNING: DAILY_API_KEY not found in .env file!")
        exit(1)
    
    app.run(host="0.0.0.0", port=5000, debug=False)