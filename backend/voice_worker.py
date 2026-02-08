import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

# ⭐ VERSION 30: REVERT TO STABLE LOGIC
VERSION = "30.0-REVERT-STABLE"

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Clean logging
logger.remove()
logger.add(sys.stderr, level="INFO", format="{time:HH:mm:ss} | {level} | {message}")


async def run_bot(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 60)
    logger.info(f"🎯 {VERSION}")
    logger.info(f"🏠 Room: {room_url}")
    logger.info("=" * 60)

    from pipecat.frames.frames import TextFrame, EndFrame, LLMMessagesFrame
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

    # --- Transport (VAD wapas transport mein) ---
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
    system_prompt = """You are Mitesh Khatri, a world-class life coach. 
    You speak mostly in Hindi mixed with English (Hinglish). 
    Keep responses very short and encouraging."""

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
    @transport.event_handler("on_participant_joined")
    async def on_participant_joined(transport, participant):
        # Hamara bot hi join hota hai pehle, use ignore karein
        if participant.get("info", {}).get("userName") == "Mitesh AI Coach":
            return
            
        logger.info(f"👋 User joined ({participant['id']}). Waiting for audio...")
        
        # Room stability ke liye 3-4 second ka wait
        await asyncio.sleep(4)
        
        # Trigger greeting (Wapas purana reliable Frame)
        logger.info("📤 Triggering greeting message...")
        await task.queue_frames([
            LLMMessagesFrame(messages=[
                {"role": "user", "content": "Hello Mitesh, I am here. Please introduce yourself and start the coaching session."}
            ])
        ])
        logger.info("✅ Greeting triggered!")

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        logger.info("👋 User left. Session ending.")
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
        logger.error(f"💥 Pipeline failure: {e}")
    finally:
        logger.info(f"🏁 Bot session closed.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(1)
    asyncio.run(run_bot(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "test-user"))
