#!/usr/bin/env python3
"""
Voice Bot AI — Real-time voice conversation using pipecat 1.2.1.

Architecture:
  ┌─────────────┐    HTTP /start     ┌──────────────────┐
  │  Frontend   │ ─────────────────▶ │  This HTTP Server │
  │ (Daily.co)  │                    │  (aiohttp :8765)  │
  └─────┬───────┘                    └────────┬──────────┘
        │  WebRTC                             │ asyncio task
        │  (audio)                   ┌────────▼──────────┐
        └──────────────────────────▶ │  pipecat Pipeline  │
                                     │  Daily transport   │
                                     │  → OpenAI GPT-4o   │
                                     │  → ElevenLabs TTS  │
                                     └───────────────────┘

Required environment variables (set in .env / docker-compose env_file):
  OPENAI_API_KEY
  ELEVEN_LABS_API_KEY
  ELEVEN_LABS_VOICE_ID   (optional, default: ErXwobaYiN019PkySvjV)
  DAILY_API_KEY          (used to create rooms programmatically)
  VITE_SUPABASE_URL      (to fetch profile/knowledge context)
  SUPABASE_SERVICE_ROLE_KEY
  BOT_PORT               (optional, default: 8765)
"""

import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Optional

from aiohttp import web
from loguru import logger

# ── pipecat 1.2.1 imports ────────────────────────────────────────────────────
# Note: We do NOT import SileroVADAnalyzer here — it requires PyTorch (~1.8 GB).
# Daily.co's transport has its own built-in VAD which we use instead.
from pipecat.frames.frames import EndFrame, LLMMessagesFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.services.openai import OpenAILLMService
from pipecat.services.elevenlabs import ElevenLabsTTSService
from pipecat.transports.services.daily import (
    DailyParams,
    DailyTranscriptionSettings,
    DailyTransport,
)

# ── Environment ──────────────────────────────────────────────────────────────
OPENAI_API_KEY       = os.environ.get("OPENAI_API_KEY", "")
ELEVEN_LABS_API_KEY  = os.environ.get("ELEVEN_LABS_API_KEY", "")
ELEVEN_LABS_VOICE_ID = os.environ.get("ELEVEN_LABS_VOICE_ID", "ErXwobaYiN019PkySvjV")
DAILY_API_KEY        = os.environ.get("DAILY_API_KEY", "")
SUPABASE_URL         = os.environ.get("VITE_SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PORT                 = int(os.environ.get("BOT_PORT", "8765"))

DEFAULT_SYSTEM_PROMPT = """You are an AI clone of Mitesh Khatri — a globally acclaimed Law of Attraction Coach.

Your Speaking Style: Warm, energetic, high-vibe, and very human.

Instructions:
- Keep every reply SHORT — this is a live voice call.
- Use casual, uplifting language: "Hey champion", "Absolutely", "Got it!".
- If the knowledge base has an answer, explain it simply in 1-2 sentences.
- If you don't know, say warmly: "I don't have that handy, but let's focus on what matters most to you!"
- NEVER sound like a robot. Speak with heart.
"""


# ── Supabase helpers ─────────────────────────────────────────────────────────

def _sb_headers() -> dict:
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey":        SUPABASE_SERVICE_KEY,
        "Content-Type":  "application/json",
    }


async def fetch_profile_prompt(profile_id: Optional[str]) -> str:
    """Fetch the AI clone's profile from Supabase and build a system prompt."""
    if not profile_id or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return DEFAULT_SYSTEM_PROMPT

    try:
        import aiohttp as _aio
        url = (
            f"{SUPABASE_URL}/rest/v1/mind_profile"
            f"?id=eq.{profile_id}&select=name,headline,description,speaking_style,eleven_labs_voice_id"
        )
        async with _aio.ClientSession() as sess:
            async with sess.get(url, headers=_sb_headers(), timeout=_aio.ClientTimeout(total=8)) as resp:
                if resp.status != 200:
                    return DEFAULT_SYSTEM_PROMPT
                rows = await resp.json()
                if not rows:
                    return DEFAULT_SYSTEM_PROMPT
                p = rows[0]

        name   = p.get("name")   or "Mitesh Khatri"
        style  = p.get("speaking_style") or "Warm, energetic, high-vibe, and very human."
        desc   = p.get("description")    or ""
        prompt = f"""You are an AI clone of {name}.
{('Biography: ' + desc) if desc else ''}
Speaking Style: {style}

Instructions:
- Keep every reply SHORT — this is a live voice call.
- Use casual, uplifting language: "Hey champion", "Absolutely", "Got it!".
- If you don't know, say warmly: "I don't have that handy, but let's focus on what matters most to you!"
- NEVER sound like a robot. Speak with heart.
"""
        return prompt.strip()

    except Exception as exc:
        logger.warning(f"Could not fetch profile ({exc}) — using default prompt")
        return DEFAULT_SYSTEM_PROMPT


# ── Daily.co room helper ──────────────────────────────────────────────────────

def create_daily_room() -> Optional[dict]:
    """Create a short-lived Daily.co room via REST API. Returns {url, token} or None."""
    if not DAILY_API_KEY:
        return None

    try:
        payload = json.dumps({
            "privacy": "private",
            "properties": {"exp": int(__import__("time").time()) + 3600},
        }).encode()
        req = urllib.request.Request(
            "https://api.daily.co/v1/rooms",
            data=payload,
            headers={
                "Authorization": f"Bearer {DAILY_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            room = json.loads(resp.read())

        # Create a meeting token for the bot
        token_payload = json.dumps({"properties": {"room_name": room["name"], "is_owner": True}}).encode()
        token_req = urllib.request.Request(
            "https://api.daily.co/v1/meeting-tokens",
            data=token_payload,
            headers={
                "Authorization": f"Bearer {DAILY_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(token_req, timeout=10) as resp:
            token_data = json.loads(resp.read())

        return {"url": room["url"], "token": token_data["token"]}

    except Exception as exc:
        logger.error(f"Could not create Daily room: {exc}")
        return None


# ── pipecat pipeline ──────────────────────────────────────────────────────────

async def run_bot(room_url: str, token: Optional[str], profile_id: Optional[str]):
    """Run one pipecat voice session connected to the given Daily.co room."""
    logger.info(f"🤖 Bot starting — room={room_url}  profile={profile_id}")

    system_prompt = await fetch_profile_prompt(profile_id)

    try:
        transport = DailyTransport(
            room_url,
            token,
            "AI Voice Bot",
            DailyParams(
                audio_out_enabled=True,
                transcription_enabled=True,
                vad_enabled=True,
                # vad_analyzer omitted → Daily uses its own built-in VAD (no PyTorch needed)
                transcription_settings=DailyTranscriptionSettings(
                    language="en",
                    tier="nova",
                    model="2-conversationalai",
                ),
            ),
        )

        llm = OpenAILLMService(
            api_key=OPENAI_API_KEY,
            model="gpt-4o",
        )

        tts = ElevenLabsTTSService(
            api_key=ELEVEN_LABS_API_KEY,
            voice_id=ELEVEN_LABS_VOICE_ID,
            model="eleven_multilingual_v2",
        )

        messages = [
            {"role": "system", "content": system_prompt},
            # Seed an opening so the bot speaks first
            {"role": "user",   "content": "Hello!"},
        ]
        context      = OpenAILLMContext(messages)
        context_aggr = llm.create_context_aggregator(context)

        pipeline = Pipeline([
            transport.input(),
            context_aggr.user(),
            llm,
            tts,
            transport.output(),
            context_aggr.assistant(),
        ])

        task = PipelineTask(
            pipeline,
            PipelineParams(allow_interruptions=True),
        )

        @transport.event_handler("on_first_participant_joined")
        async def on_first_participant_joined(transport, participant):
            pid = participant.get("id", "unknown")
            logger.info(f"👤 Participant joined: {pid}")
            await transport.capture_participant_transcription(pid)
            # Trigger the LLM to deliver the opening greeting
            await task.queue_frames([context_aggr.user().get_context_frame()])

        @transport.event_handler("on_participant_left")
        async def on_participant_left(transport, participant, reason):
            logger.info(f"👋 Participant left ({reason})")
            await task.queue_frame(EndFrame())

        @transport.event_handler("on_call_state_updated")
        async def on_call_state_updated(transport, state):
            if state == "left":
                await task.queue_frame(EndFrame())

        runner = PipelineRunner()
        await runner.run(task)
        logger.info("✅ Bot session ended cleanly")

    except Exception:
        logger.exception("❌ Bot session crashed")


# ── HTTP API ──────────────────────────────────────────────────────────────────

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({
        "status": "ok",
        "service": "voice-bot-ai",
        "openai":      bool(OPENAI_API_KEY),
        "elevenlabs":  bool(ELEVEN_LABS_API_KEY),
        "daily":       bool(DAILY_API_KEY),
    })


async def handle_create_room(request: web.Request) -> web.Response:
    """Create a new Daily.co room and return its URL + user token."""
    room = create_daily_room()
    if not room:
        return web.json_response(
            {"error": "Could not create Daily room. Check DAILY_API_KEY."},
            status=500,
        )
    return web.json_response(room)


async def handle_start(request: web.Request) -> web.Response:
    """
    Start a voice bot session.

    Expected JSON body:
      { "room_url": "https://...", "token": "...", "profile_id": "uuid" }
    """
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    room_url   = data.get("room_url")
    token      = data.get("token")
    profile_id = data.get("profile_id")

    if not room_url:
        return web.json_response({"error": "room_url is required"}, status=400)

    # Fire and forget — the pipecat session is an asyncio task
    asyncio.create_task(run_bot(room_url, token, profile_id))

    logger.info(f"🚀 Bot session dispatched for room: {room_url}")
    return web.json_response({"status": "started", "room_url": room_url})


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    logger.remove()
    logger.add(sys.stdout, level="INFO", colorize=True,
               format="<green>{time:HH:mm:ss}</green> | <level>{level}</level> | {message}")

    logger.info("=" * 60)
    logger.info("🎙️  Voice Bot AI  —  pipecat 1.2.1")
    logger.info(f"   Port       : {PORT}")
    logger.info(f"   OpenAI     : {'✅' if OPENAI_API_KEY else '❌  OPENAI_API_KEY not set'}")
    logger.info(f"   ElevenLabs : {'✅' if ELEVEN_LABS_API_KEY else '❌  ELEVEN_LABS_API_KEY not set'}")
    logger.info(f"   Daily      : {'✅' if DAILY_API_KEY else '⚠️   DAILY_API_KEY not set (bot-start only via external URL)'}")
    logger.info(f"   Supabase   : {'✅' if SUPABASE_URL else '⚠️   VITE_SUPABASE_URL not set'}")
    logger.info("=" * 60)

    app = web.Application()
    app.router.add_get( "/health",      handle_health)
    app.router.add_post("/create-room", handle_create_room)
    app.router.add_post("/start",       handle_start)

    web.run_app(app, host="0.0.0.0", port=PORT, access_log=None)


if __name__ == "__main__":
    main()
