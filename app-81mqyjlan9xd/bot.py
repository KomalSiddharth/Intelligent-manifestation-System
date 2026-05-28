#!/usr/bin/env python3
"""
Voice Bot AI — HTTP service for voice session management.

This service:
  - Creates Daily.co rooms on demand
  - Returns room URLs + tokens to the frontend
  - Forwards voice queries to the Supabase voice-engine Edge Function
  - Acts as a health-check-able container for voice features

NO pipecat dependency — uses direct REST APIs for reliability.

Endpoints:
  GET  /health        — liveness check
  POST /create-room   — create a Daily.co room, returns {url, token}
  POST /voice-query   — STT → LLM → TTS via voice-engine Edge Function
"""

import asyncio
import json
import os
import time
import urllib.error
import urllib.request
from typing import Optional

from aiohttp import web
from loguru import logger
import sys

# ── Environment ──────────────────────────────────────────────────────────────
DAILY_API_KEY        = os.environ.get("DAILY_API_KEY", "")
SUPABASE_URL         = os.environ.get("VITE_SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ELEVEN_LABS_API_KEY  = os.environ.get("ELEVEN_LABS_API_KEY", "")
OPENAI_API_KEY       = os.environ.get("OPENAI_API_KEY", "")
PORT                 = int(os.environ.get("BOT_PORT", "8765"))


# ── Daily.co helpers ──────────────────────────────────────────────────────────

def _daily_request(path: str, payload: dict) -> Optional[dict]:
    """Make a POST request to Daily.co REST API. Returns parsed JSON or None."""
    if not DAILY_API_KEY:
        logger.warning("DAILY_API_KEY not set — cannot create rooms")
        return None
    try:
        data = json.dumps(payload).encode()
        req  = urllib.request.Request(
            f"https://api.daily.co/v1{path}",
            data=data,
            headers={
                "Authorization": f"Bearer {DAILY_API_KEY}",
                "Content-Type":  "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        logger.error(f"Daily API error ({path}): {exc}")
        return None


def create_daily_room() -> Optional[dict]:
    """Create a new private Daily.co room valid for 1 hour. Returns {url, token}."""
    exp  = int(time.time()) + 3600
    room = _daily_request("/rooms", {"privacy": "private", "properties": {"exp": exp}})
    if not room:
        return None

    token_data = _daily_request(
        "/meeting-tokens",
        {"properties": {"room_name": room["name"], "is_owner": True, "exp": exp}},
    )
    if not token_data:
        return {"url": room["url"], "token": None}

    return {"url": room["url"], "token": token_data.get("token")}


# ── HTTP handlers ─────────────────────────────────────────────────────────────

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({
        "status":      "ok",
        "service":     "voice-bot-ai",
        "daily":       bool(DAILY_API_KEY),
        "supabase":    bool(SUPABASE_URL),
        "elevenlabs":  bool(ELEVEN_LABS_API_KEY),
        "openai":      bool(OPENAI_API_KEY),
    })


async def handle_create_room(request: web.Request) -> web.Response:
    """
    Create a Daily.co room for a real-time voice session.
    Returns: { "url": "https://...", "token": "..." }
    """
    loop = asyncio.get_event_loop()
    room = await loop.run_in_executor(None, create_daily_room)

    if not room:
        return web.json_response(
            {"error": "Could not create Daily room. Check DAILY_API_KEY."},
            status=500,
        )
    logger.info(f"🏠 Room created: {room['url']}")
    return web.json_response(room)


async def handle_voice_query(request: web.Request) -> web.Response:
    """
    Proxy a voice query to the Supabase voice-engine Edge Function.

    Expected body (multipart/form-data):
      audio      — audio file (webm/mp3/wav)
      profileId  — UUID of the AI clone profile

    Returns: audio/mpeg stream from ElevenLabs
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return web.json_response({"error": "Supabase not configured"}, status=500)

    try:
        import aiohttp as _aio
        reader     = await request.multipart()
        form_data  = _aio.FormData()

        async for part in reader:
            data = await part.read()
            if part.name == "audio":
                form_data.add_field(
                    "audio", data,
                    filename=part.filename or "audio.webm",
                    content_type=part.content_type or "audio/webm",
                )
            else:
                form_data.add_field(part.name, data.decode())

        edge_url = f"{SUPABASE_URL}/functions/v1/voice-engine"
        headers  = {"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"}

        async with _aio.ClientSession() as session:
            async with session.post(edge_url, data=form_data, headers=headers) as resp:
                body = await resp.read()
                ct   = resp.headers.get("Content-Type", "audio/mpeg")
                response_text = resp.headers.get("X-Response-Text", "")
                tts_failed    = resp.headers.get("X-TTS-Failed", "")

                result_headers = {}
                if response_text:
                    result_headers["X-Response-Text"] = response_text
                if tts_failed:
                    result_headers["X-TTS-Failed"] = tts_failed

                return web.Response(body=body, content_type=ct, headers=result_headers)

    except Exception as exc:
        logger.exception(f"Voice query error: {exc}")
        return web.json_response({"error": str(exc)}, status=500)


async def handle_start(request: web.Request) -> web.Response:
    """
    Legacy /start endpoint — kept for backwards compatibility.
    Creates a room and returns its URL.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    profile_id = body.get("profile_id", "")

    loop = asyncio.get_event_loop()
    room = await loop.run_in_executor(None, create_daily_room)

    if room:
        logger.info(f"🚀 Voice session started for profile: {profile_id}")
        return web.json_response({"status": "started", **room})

    return web.json_response({"status": "started", "message": "Room creation skipped (no DAILY_API_KEY)"})


# ── App setup ─────────────────────────────────────────────────────────────────

def main():
    logger.remove()
    logger.add(
        sys.stdout,
        level="INFO",
        colorize=True,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
    )

    logger.info("=" * 60)
    logger.info("🎙️  Voice Bot AI Service starting")
    logger.info(f"   Port        : {PORT}")
    logger.info(f"   Daily.co    : {'✅' if DAILY_API_KEY   else '⚠️  DAILY_API_KEY not set'}")
    logger.info(f"   Supabase    : {'✅' if SUPABASE_URL    else '⚠️  VITE_SUPABASE_URL not set'}")
    logger.info(f"   ElevenLabs  : {'✅' if ELEVEN_LABS_API_KEY else '⚠️  ELEVEN_LABS_API_KEY not set'}")
    logger.info(f"   OpenAI      : {'✅' if OPENAI_API_KEY  else '⚠️  OPENAI_API_KEY not set'}")
    logger.info("=" * 60)

    app = web.Application()
    app.router.add_get( "/health",       handle_health)
    app.router.add_post("/create-room",  handle_create_room)
    app.router.add_post("/voice-query",  handle_voice_query)
    app.router.add_post("/start",        handle_start)

    web.run_app(app, host="0.0.0.0", port=PORT, access_log=None)


if __name__ == "__main__":
    main()
