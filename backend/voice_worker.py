import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

# Ensure logs are flushed immediately
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

from pipecat.frames.frames import EndFrame, StartFrame, TextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.cartesia.stt import CartesiaSTTService
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.transports.services.daily import DailyTransport, DailyParams

# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
logger.remove(0)
logger.add(sys.stderr, level="INFO")

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info(f"🚀 Starting clean voice worker for room: {room_url}")

    # Initialize Dependencies
    cartesia_api_key = os.getenv("CARTESIA_API_KEY")
    openai_api_key = os.getenv("OPENAI_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")
    
    if not (cartesia_api_key and openai_api_key and voice_id):
        logger.error(f"❌ Missing keys - Cartesia: {'OK' if cartesia_api_key else 'MISSING'}, OpenAI: {'OK' if openai_api_key else 'MISSING'}, Voice: {'OK' if voice_id else 'MISSING'}")
        return

    # Transport
    transport = DailyTransport(
        room_url,
        token,
        "Mitesh AI Coach",
        DailyParams(
            audio_out_enabled=True,
            vad_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
            vad_audio_passthrough=True
        )
    )

    # Services
    stt = CartesiaSTTService(api_key=cartesia_api_key, model="sonic-english")
    llm = OpenAILLMService(api_key=openai_api_key, model="gpt-4o")
    tts = CartesiaTTSService(api_key=cartesia_api_key, voice_id=voice_id)

    # Context & Persona
    base_prompt = """You are Mitesh Khatri, the world's no. 1 coach and Law of Attraction Expert.
    Identity: Transformational Leadership Coach & NLP Expert.
    Speaking Style: High-energy, powerful, authoritative yet warm and deeply human.
    Rules: 
    1. Keep responses CONCISE and short for voice (2-3 sentences max).
    2. Be warm, energetic, and encouraging.
    3. Ask follow-up questions to keep conversation flowing.
    4. Stay in character as Mitesh Khatri at all times."""
    
    # Context
    messages = [{"role": "system", "content": base_prompt}]
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    # CLEAN PIPELINE - NO KB PROCESSOR!
    pipeline = Pipeline([
        transport.input(),
        stt,
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
        context_aggregator.assistant()
    ])
    
    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
    runner = PipelineRunner()
    
    # Event Handlers
    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(transport, participant):
        participant_id = participant.get('id')
        logger.info(f"👋 User joined: {participant_id}")
        
        # Start capturing transcription
        try:
            await transport.capture_participant_transcription(participant_id)
            logger.info(f"✅ Started transcription capture for {participant_id}")
        except Exception as e:
            logger.error(f"❌ Transcription capture failed: {e}")

        # Send initial greeting
        try:
            await asyncio.sleep(1)  # Connection stability delay
            greeting = TextFrame("Hello! I'm Mitesh, your AI coach. How are you feeling today?")
            await task.queue_frame(greeting)
            logger.info("👋 Queued greeting message")
        except Exception as e:
            logger.error(f"❌ Failed to queue greeting: {e}")

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        logger.info(f"👋 User left: {participant.get('id')}")
        await task.cancel()

    @transport.event_handler("on_app_message")
    async def on_app_message(transport, message, sender):
        logger.info(f"📨 App message from {sender}: {message}")

    # Heartbeat task to debug silent disconnections
    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(5)
                logger.info("💓 Worker is alive and processing...")
        except asyncio.CancelledError:
            pass

    heartbeat_task = asyncio.create_task(heartbeat())

    # Run pipeline
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"❌ Pipeline error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        heartbeat_task.cancel()


if __name__ == "__main__":
    try:
        if len(sys.argv) < 3:
            logger.error("Usage: python voice_worker.py <room_url> <token> [user_id]")
            sys.exit(1)
            
        room_url = sys.argv[1]
        token = sys.argv[2]
        user_id = sys.argv[3] if len(sys.argv) > 3 else "anonymous"
        
        asyncio.run(main(room_url, token, user_id))
    except Exception as e:
        logger.error(f"💥 WORKER CRASHED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
