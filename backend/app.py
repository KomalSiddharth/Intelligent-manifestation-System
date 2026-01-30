
import os
import sys
import time
import requests
import subprocess
import random
import string
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

app = Flask(__name__)
CORS(app)

DAILY_API_KEY = os.getenv("DAILY_API_KEY")

if not DAILY_API_KEY:
    print("❌ ERROR: DAILY_API_KEY not found in .env")
    sys.exit(1)

def generate_room_name(user_id):
    """Generate a unique room name"""
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
                    "exp": int(time.time()) + 3600  # 1 hour expiry
                }
            }
        )
        
        if response.status_code != 200:
            print(f"❌ Daily API Error: {response.text}")
            return jsonify({"error": "Failed to create room", "details": response.text}), 500
            
        room_data = response.json()
        room_url = room_data['url']
        
        print(f"✅ Room created: {room_url}")
        
        # Create meeting token
        token_res = requests.post(
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
        
        if token_res.status_code != 200:
            print(f"❌ Token Error: {token_res.text}")
            return jsonify({"error": "Failed to create token", "details": token_res.text}), 500

        token = token_res.json().get('token')
        
        print(f"✅ Token created")
        
        # ✅ Spawn voice worker subprocess (CORRECT PATH!)
        print("🚀 Spawning voice worker...")
        subprocess.Popen(
            [
                sys.executable,       # Use same Python as current process
                "voice_worker.py",    # ✅ Just filename (we're in backend/)
                room_url,
                token,
                user_id
            ],
            cwd=os.path.dirname(os.path.abspath(__file__))  # ✅ Current directory (backend/)
        )
        
        print(f"✅ Voice worker spawned successfully")
        
        return jsonify({
            "success": True,
            "room_url": room_url,
            "token": token
        })

    except Exception as e:
        print(f"❌ Error creating session: {e}")
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

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Mitesh AI Voice Backend Starting...")
    print("=" * 60)
    print(f"📍 Port: 5000")
    print(f"🐍 Python: {sys.executable}")
    print(f"🔑 Daily.co API Key: {'✅ Found' if DAILY_API_KEY else '❌ Missing'}")
    print("=" * 60)
    
    port = int(os.getenv("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
