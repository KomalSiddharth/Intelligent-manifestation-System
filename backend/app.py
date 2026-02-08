import os
import sys
import time
import asyncio
import threading
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
        "supports_credentials": True
    }
})

# Daily.co Configuration
DAILY_API_KEY = os.getenv("DAILY_API_KEY", "").strip()
DAILY_API_URL = "https://api.daily.co/v1"

# Track active sessions
active_sessions = {}
MAX_CONCURRENT_CALLS = 50

def create_daily_room():
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
                "eject_at_room_exp": True,
            }
        }
    )

    if response.status_code != 200:
        raise Exception(f"Daily room creation failed: {response.text}")

    return response.json()


def create_daily_token(room_name, participant_name, is_owner=False):
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
            }
        }
    )

    if response.status_code != 200:
        raise Exception(f"Daily token creation failed: {response.text}")

    return response.json()["token"]


def run_bot_in_background(room_url, bot_token, user_id):
    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            from voice_worker import run_bot
            loop.run_until_complete(run_bot(room_url, bot_token, user_id))
        except Exception as e:
            print(f"❌ Bot error for {user_id}: {e}", flush=True)
        finally:
            loop.close()
            if user_id in active_sessions:
                del active_sessions[user_id]
    
    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return thread


@app.route('/start-session', methods=['POST'])
def start_session():
    try:
        data = request.json
        user_id = data.get('user_id', 'anonymous')

        if len(active_sessions) >= MAX_CONCURRENT_CALLS:
            return jsonify({"success": False, "error": "Server busy"}), 503

        room_data = create_daily_room()
        room_url = room_data["url"]
        room_name = room_data["name"]

        user_token = create_daily_token(room_name, f"user-{user_id[:8]}")
        bot_token = create_daily_token(room_name, "Mitesh AI Coach", is_owner=True)

        bot_thread = run_bot_in_background(room_url, bot_token, user_id)

        active_sessions[user_id] = {
            "room_name": room_name,
            "thread": bot_thread
        }

        return jsonify({
            "success": True,
            "room_url": room_url,
            "room_name": room_name,
            "token": user_token
        })

    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/end-session', methods=['POST'])
def end_session():
    data = request.json
    user_id = data.get('user_id', '')

    if user_id in active_sessions:
        session = active_sessions[user_id]
        room_name = session["room_name"]
        requests.delete(
            f"{DAILY_API_URL}/rooms/{room_name}",
            headers={"Authorization": f"Bearer {DAILY_API_KEY}"}
        )
        del active_sessions[user_id]

    return jsonify({"success": True})


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "calls": len(active_sessions)})


if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
