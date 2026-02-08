import os
import sys
import time
import asyncio
import threading
import random
import string
import aiohttp
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

app = Flask(__name__)

# CORS Configuration
CORS(app, resources={
    r"/*": {
        "origins": "*",  # TODO: Replace with your frontend domain in production
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "expose_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "max_age": 3600
    }
})

# Daily.co Configuration
DAILY_API_KEY = os.getenv("DAILY_API_KEY", "").strip()
DAILY_API_URL = "https://api.daily.co/v1"

if not DAILY_API_KEY:
    print("❌ ERROR: DAILY_API_KEY missing in .env")

# Track active sessions for cleanup
active_sessions = {}
MAX_CONCURRENT_CALLS = 50  # Safety limit


def create_daily_room():
    """Create a temporary Daily.co room via REST API"""
    timestamp = int(time.time())
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    room_name = f"voice-{timestamp}-{random_suffix}"

    response = requests.post(
        f"{DAILY_API_URL}/rooms",
        headers={
            "Authorization": f"Bearer {DAILY_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "name": room_name,
            "privacy": "private",
            "properties": {
                "exp": time.time() + 3600,  # Room expires in 1 hour
                "max_participants": 2,       # User + Bot only
                "enable_chat": False,
                "enable_knocking": False,
                "eject_at_room_exp": True,   # Auto-kick when room expires
            }
        }
    )

    if response.status_code != 200:
        raise Exception(f"Daily room creation failed: {response.text}")

    return response.json()


def create_daily_token(room_name, participant_name, is_owner=False):
    """Create a meeting token for a participant"""
    response = requests.post(
        f"{DAILY_API_URL}/meeting-tokens",
        headers={
            "Authorization": f"Bearer {DAILY_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "properties": {
                "room_name": room_name,
                "user_name": participant_name,
                "is_owner": is_owner,
                "exp": time.time() + 3600,  # Token expires in 1 hour
                "enable_screenshare": False,
                "start_video_off": True,
                "start_audio_off": False,
            }
        }
    )

    if response.status_code != 200:
        print(f"❌ Daily token creation failed for {participant_name}: {response.text}")
        raise Exception(f"Daily token creation failed: {response.text}")

    token = response.json()["token"]
    print(f"✅ Token created for {participant_name}: {token[:10]}...")
    return token


def run_bot_in_background(room_url, bot_token, user_id):
    """Run the voice worker bot in a background thread with its own event loop"""
    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # Import here to avoid loading heavy ML models at startup
            from voice_worker import run_bot
            loop.run_until_complete(run_bot(room_url, bot_token, user_id))
        except Exception as e:
            print(f"❌ Bot error for {user_id}: {e}", flush=True)
            import traceback
            traceback.print_exc()
        finally:
            loop.close()
            # Cleanup session tracking
            if user_id in active_sessions:
                del active_sessions[user_id]
                print(f"🧹 Session cleaned up for {user_id}", flush=True)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return thread


@app.route('/start-session', methods=['POST'])
def start_session():
    """Create Daily.co room and spawn voice bot"""
    try:
        data = request.json
        user_id = data.get('user_id', 'anonymous-' + ''.join(random.choices(string.ascii_lowercase, k=4)))

        print(f"📞 Creating voice session for user: {user_id}")

        # Safety check: concurrent call limit
        if len(active_sessions) >= MAX_CONCURRENT_CALLS:
            return jsonify({
                "success": False,
                "error": "Server busy. Please try again later."
            }), 503

        # Check if user already has an active session
        if user_id in active_sessions:
            return jsonify({
                "success": False,
                "error": "You already have an active call. Please end it first."
            }), 409

        # 1. Create Daily.co room
        room_data = create_daily_room()
        room_url = room_data["url"]
        room_name = room_data["name"]
        print(f"✅ Room created: {room_name} → {room_url}")

        # 2. Create token for USER
        user_token = create_daily_token(room_name, f"user-{user_id[:8]}")
        print(f"✅ User token created")

        # 3. Create token for BOT
        bot_token = create_daily_token(room_name, "Mitesh AI Coach", is_owner=True)
        print(f"✅ Bot token created")

        # 4. Spawn bot in background thread (NOT subprocess!)
        bot_thread = run_bot_in_background(room_url, bot_token, user_id)

        # Track session
        active_sessions[user_id] = {
            "room_name": room_name,
            "room_url": room_url,
            "thread": bot_thread,
            "started_at": time.time()
        }

        print(f"✅ Bot spawned for room: {room_name}", flush=True)

        return jsonify({
            "success": True,
            "room_url": room_url,
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


@app.route('/end-session', methods=['POST'])
def end_session():
    """Cleanup a voice session"""
    try:
        data = request.json
        user_id = data.get('user_id', '')

        if user_id in active_sessions:
            session = active_sessions[user_id]
            room_name = session["room_name"]

            # Delete the Daily room (forces disconnection)
            try:
                requests.delete(
                    f"{DAILY_API_URL}/rooms/{room_name}",
                    headers={"Authorization": f"Bearer {DAILY_API_KEY}"}
                )
                print(f"🗑️ Room deleted: {room_name}")
            except Exception as e:
                print(f"⚠️ Room deletion failed: {e}")

            del active_sessions[user_id]

        return jsonify({"success": True})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "voice-backend",
        "active_calls": len(active_sessions),
        "max_calls": MAX_CONCURRENT_CALLS,
        "timestamp": int(time.time())
    })


if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Mitesh AI Voice Backend (Daily.co) Starting...")
    print("=" * 60)
    print(f"🔑 Daily API Key: {'✅ Found' if DAILY_API_KEY else '❌ Missing'}")
    print(f"📊 Max Concurrent Calls: {MAX_CONCURRENT_CALLS}")
    print("=" * 60)

    port = int(os.getenv("PORT", 5000))
    print(f"🚀 Starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
