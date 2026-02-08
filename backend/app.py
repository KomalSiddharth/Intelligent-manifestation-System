import os
import sys
import time
import multiprocessing
import random
import string
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
        "origins": "*",
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

# Track active sessions
active_sessions = {}
MAX_CONCURRENT_CALLS = 50


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
                "exp": time.time() + 3600,
                "max_participants": 2,
                "enable_chat": False,
                "enable_knocking": False,
                "eject_at_room_exp": True,
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
                "exp": time.time() + 3600,
                "enable_screenshare": False,
                "start_video_off": True,
                "start_audio_off": False,
            }
        }
    )

    if response.status_code != 200:
        raise Exception(f"Daily token creation failed: {response.text}")

    return response.json()["token"]


def _bot_process_target(room_url, bot_token, user_id):
    """Target function for multiprocessing.Process — runs in its own main thread"""
    import asyncio
    # Import inside the process to avoid loading heavy modules in Flask
    from voice_worker import run_bot
    try:
        asyncio.run(run_bot(room_url, bot_token, user_id))
    except Exception as e:
        print(f"❌ Bot process error for {user_id}: {e}", flush=True)
        import traceback
        traceback.print_exc()


def run_bot_in_background(room_url, bot_token, user_id):
    """Spawn bot in a separate PROCESS (not thread) — Daily SDK needs main thread"""
    process = multiprocessing.Process(
        target=_bot_process_target,
        args=(room_url, bot_token, user_id),
        daemon=True
    )
    process.start()
    print(f"🤖 Bot process started (PID: {process.pid})", flush=True)
    return process


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

        # Check if user already has an active session — cleanup stale ones
        if user_id in active_sessions:
            old_session = active_sessions[user_id]
            old_process = old_session.get("process")
            if old_process and old_process.is_alive():
                return jsonify({
                    "success": False,
                    "error": "You already have an active call. Please end it first."
                }), 409
            else:
                # Stale session — clean it up
                del active_sessions[user_id]

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

        # 4. Spawn bot in separate PROCESS
        bot_process = run_bot_in_background(room_url, bot_token, user_id)

        # Track session
        active_sessions[user_id] = {
            "room_name": room_name,
            "room_url": room_url,
            "process": bot_process,
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
            process = session.get("process")

            # Terminate the bot process
            if process and process.is_alive():
                process.terminate()
                process.join(timeout=5)
                print(f"🛑 Bot process terminated for {user_id}")

            # Delete the Daily room
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
    # Clean up dead processes
    dead_sessions = []
    for uid, session in active_sessions.items():
        process = session.get("process")
        if process and not process.is_alive():
            dead_sessions.append(uid)
    for uid in dead_sessions:
        del active_sessions[uid]

    return jsonify({
        "status": "healthy",
        "service": "voice-backend-daily",
        "active_calls": len(active_sessions),
        "max_calls": MAX_CONCURRENT_CALLS,
        "timestamp": int(time.time())
    })


if __name__ == '__main__':
    # Required for multiprocessing on some platforms
    multiprocessing.set_start_method('spawn', force=True)

    print("=" * 60)
    print("🚀 Mitesh AI Voice Backend (Daily.co) Starting...")
    print("=" * 60)
    print(f"🔑 Daily API Key: {'✅ Found' if DAILY_API_KEY else '❌ Missing'}")
    print(f"📊 Max Concurrent Calls: {MAX_CONCURRENT_CALLS}")
    print("=" * 60)

    port = int(os.getenv("PORT", 5000))
    print(f"🚀 Starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
