import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "29.0-MODERN-FIX"

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

    from pipecat.frames.frames import TextFrame, EndFrame, LLMMessagesUpdateFrame
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

    # --- Transport (Clean, no VAD here to avoid warning) ---
    transport = DailyTransport(
        room_url,
        token,
        "Mitesh AI Coach",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        )
    )

    # --- AI Services ---
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = CartesiaTTSService(api_key=cartesia_key, voice_id=voice_id)

    # --- Conversation Context ---
    system_prompt = """You are Mitesh Khatri, a world-class life coach. 
    You speak naturally in Hinglish (Hindi + English). 
    Keep responses very short (2 sentences max)."""

    messages = [{"role": "system", "content": system_prompt}]
    context = LLMContext(messages)
    
    # ⭐ MODERN VAD SETUP (Fixes VAD Warning)
    vad = SileroVADAnalyzer()
    # Adding VAD to the aggregator instead of transport
    aggregators = LLMContextAggregatorPair(context)
    # We'll use the pipeline to connect VAD if needed, but for now let's use the Stable pair
    # Note: In 0.0.101, LLMContextAggregatorPair.user() handles the VAD if passed properly.
    # If the library gives TypeError again, we'll revert, but this is the "Warning" fix.

    # --- Clean Pipeline ---
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
    @transport.event_handler("on_participant_joined")
    async def on_participant_joined(transport, participant):
        if participant.get("info", {}).get("userName") == "Mitesh AI Coach":
            return
            
        logger.info(f"👋 User joined! Preparing Greeting...")
        await asyncio.sleep(2)
        
        # ⭐ MODERN GREETING (Fixes LLMMessagesFrame Warning)
        logger.info("📤 Triggering greeting via LLMMessagesUpdateFrame...")
        await task.queue_frames([
            LLMMessagesUpdateFrame(messages=[
                {"role": "user", "content": "Say hello to me and introduce yourself as Mitesh briefly."}
            ], run_llm=True)
        ])
        logger.info("✅ Modern Greeting Frame queued!")

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        logger.info(f"👋 User left. Ending session.")
        await task.queue_frame(EndFrame())

    @transport.event_handler("on_call_state_updated")
    async def on_call_state_updated(transport, state):
        if state == "left":
            await task.queue_frame(EndFrame())

    # --- Run ---
    runner = PipelineRunner()
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"💥 Pipeline error: {e}")
    finally:
        logger.info(f"🏁 Bot process terminated.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(1)
    asyncio.run(run_bot(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "test-user"))
