
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
from livekit import api

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

app = Flask(__name__)

# ✅ CORS Configuration - CRITICAL FOR PRODUCTION!
CORS(app, resources={
    r"/*": {
        "origins": "*",  # Allow all for robustness in production, though you can restrict to frontend URL later
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "expose_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "max_age": 3600
    }
})


LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.getenv("LIVEKIT_URL")

if not all([LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL]):
    print("❌ ERROR: LiveKit credentials missing in .env")
    # Not exiting here to allow other parts of the app to run/debug if needed, 
    # but actual sessions will fail.

def generate_room_name(user_id):
    """Generate a unique room name"""
    timestamp = int(time.time())
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"voice-{user_id[:8]}-{timestamp}-{random_suffix}"

@app.route('/start-session', methods=['POST'])
def start_session():
    """Generate LiveKit token and spawn voice worker"""
    
    try:
        data = request.json
        user_id = data.get('user_id', 'anonymous-' + ''.join(random.choices(string.ascii_lowercase, k=4)))
        
        print(f"📞 Creating voice session for user: {user_id}")
        
        # Generate unique room name
        room_name = generate_room_name(user_id)
        
        # Create LiveKit Access Token for the USER
        user_token_manager = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        user_token_manager.with_identity(user_id)
        user_token_manager.with_name("User")
        user_token_manager.with_grants(api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True
        ))
        user_token = user_token_manager.to_jwt()

        # Create LiveKit Access Token for the BOT
        bot_token_manager = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        bot_token_manager.with_identity(f"bot-{user_id[:8]}")
        bot_token_manager.with_name("Mitesh AI Coach")
        bot_token_manager.with_grants(api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True
        ))
        bot_token = bot_token_manager.to_jwt()
        
        print(f"✅ Tokens generated for room: {room_name}")
        
        # ✅ Spawn voice worker subprocess with EXPLICIT LOG PIPING
        print("🚀 Spawning voice worker...", flush=True)
        worker_process = subprocess.Popen(
            [
                sys.executable,
                "voice_worker.py",
                LIVEKIT_URL,
                bot_token,
                user_id
            ],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, # Merge stderr into stdout
            bufsize=1,
            universal_newlines=True
        )

        # Thread to read and print worker logs so they appear in Railway
        import threading
        def pipe_logs(process):
            for line in iter(process.stdout.readline, ""):
                print(f"[WORKER] {line}", end="", flush=True)
        
        threading.Thread(target=pipe_logs, args=(worker_process,), daemon=True).start()
        
        print(f"✅ Voice worker spawned successfully (PID: {worker_process.pid})", flush=True)
        
        return jsonify({
            "success": True,
            "room_url": LIVEKIT_URL,
            "room_name": room_name,
            "token": user_token
        })

    except Exception as e:
        print(f"❌ Error creating session: {e}", flush=True)
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
    print(f"🔑 LiveKit API Key: {'✅ Found' if LIVEKIT_API_KEY else '❌ Missing'}")
    print("=" * 60)
    
    port = int(os.getenv("PORT", 5000))
    print(f"🚀 Starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
