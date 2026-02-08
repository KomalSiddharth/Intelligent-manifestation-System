import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "24.0-DAILY-FINAL-FIX"

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Clean logging
logger.remove()
logger.add(sys.stderr, level="INFO", format="{time:HH:mm:ss} | {level} | {message}")


async def run_bot(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 60)
    logger.info(f"🎯 {VERSION}")
    logger.info(f"🏠 Room: {room_url}")
    logger.info(f"👤 User: {user_id}")
    logger.info("=" * 60)

    from pipecat.frames.frames import TextFrame, EndFrame
    # LLMMessagesFrame is the correct way to trigger LLM in newer Pipecat
    # Fallback to LLMMessagesUpdateFrame for older versions
    try:
        from pipecat.frames.frames import LLMMessagesFrame
    except ImportError:
        logger.warning("LLMMessagesFrame not found, trying LLMMessagesUpdateFrame...")
        from pipecat.frames.frames import LLMMessagesUpdateFrame as LLMMessagesFrame
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.pipeline.task import PipelineTask, PipelineParams
    from pipecat.services.openai.stt import OpenAISTTService
    from pipecat.services.openai.llm import OpenAILLMService
    from pipecat.services.cartesia.tts import CartesiaTTSService
    from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.transports.daily.transport import DailyTransport, DailyParams

    openai_key = os.getenv("OPENAI_API_KEY")
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")

    if not all([openai_key, cartesia_key, voice_id]):
        logger.error("❌ Missing API keys!")
        return

    logger.info(f"🔑 Keys: OpenAI ✅ | Cartesia ✅ | Voice: {voice_id[:20]}...")

    # --- Transport ---
    transport = DailyTransport(
        room_url,
        token,
        "Mitesh AI Coach",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
        )
    )

    # --- AI Services ---
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = CartesiaTTSService(api_key=cartesia_key, voice_id=voice_id)

    # --- Conversation Context ---
    system_prompt = """You are Mitesh Khatri, a world-class life coach and motivational speaker.

Your personality:
- Warm, empathetic, and encouraging
- You speak in a mix of Hindi and English (Hinglish) naturally
- You give practical, actionable advice
- You keep responses SHORT (2-3 sentences max for voice conversation)
- You ask follow-up questions to understand the person better

IMPORTANT: Keep ALL responses under 3 sentences. This is a voice conversation, not text chat.
When you receive a greeting or "hello", introduce yourself warmly."""

    messages = [{"role": "system", "content": system_prompt}]
    context = LLMContext(messages)
    aggregators = LLMContextAggregatorPair(context)

    # --- Pipeline ---
    pipeline = Pipeline([
        transport.input(),
        stt,
        aggregators.user(),
        llm,
        tts,
        transport.output(),
        aggregators.assistant(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
        )
    )

    # --- Event Handlers ---
    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(transport, participant):
        pid = participant.get("id", "unknown") if isinstance(participant, dict) else getattr(participant, "id", "unknown")
        logger.info(f"👋 User joined! Participant ID: {pid}")

        # ⭐ CRITICAL: Tell transport to capture this participant's audio
        # Without this, the bot is DEAF — cannot hear the user at all
        await transport.capture_participant_transcription(pid)
        logger.info(f"🎤 Audio capture enabled for participant {pid}")

        # Small delay for audio pipeline to stabilize
        await asyncio.sleep(1)

        # ⭐ Trigger greeting via LLM (Modern Pipecat pattern)
        # Add a fake "hello" from user to trigger LLM response
        logger.info("📤 Triggering greeting via LLM...")
        context.add_message({"role": "user", "content": "Hello, please introduce yourself"})
        
        # Using LLMMessagesUpdateFrame fixes the deprecation warning
        try:
            from pipecat.frames.frames import LLMMessagesUpdateFrame
            await task.queue_frames([LLMMessagesUpdateFrame(messages=context.get_messages(), run_llm=True)])
        except ImportError:
            # Fallback for older versions if needed
            await task.queue_frames([LLMMessagesFrame(messages=context.get_messages())])
        
        logger.info("✅ Greeting frame queued!")

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        logger.info(f"👋 User left (reason: {reason}). Ending bot...")
        await task.queue_frame(EndFrame())

    @transport.event_handler("on_call_state_updated")
    async def on_call_state_updated(transport, state):
        logger.info(f"📞 Call state: {state}")
        if state == "left":
            await task.queue_frame(EndFrame())

    # --- Run ---
    runner = PipelineRunner()
    logger.info("🏃 Starting pipeline...")
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"💥 Pipeline error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        logger.info(f"🏁 Bot session ended for {user_id}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python voice_worker.py <room_url> <token> [user_id]")
        sys.exit(1)
    asyncio.run(run_bot(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "test-user"))
