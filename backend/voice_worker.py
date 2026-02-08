import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

# ⭐ VERSION 31: THE DIRECT AUDIO TEST
VERSION = "31.0-DIRECT-AUDIO-TEST"

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logger.remove()
logger.add(sys.stderr, level="INFO", format="{time:HH:mm:ss} | {level} | {message}")

async def run_bot(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info(f"🎯 Starting {VERSION}")

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
        logger.error("❌ API Keys missing!")
        return

    # --- Transport (Stable configuration) ---
    transport = DailyTransport(
        room_url,
        token,
        "Mitesh AI Coach",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer()
        )
    )

    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    # Cartesia service setup
    tts = CartesiaTTSService(api_key=cartesia_key, voice_id=voice_id)

    # Context setup
    system_prompt = "You are Mitesh Khatri. Respond in short Hinglish sentences."
    context = LLMContext([{"role": "system", "content": system_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    pipeline = Pipeline([
        transport.input(),
        stt,
        aggregators.user(),
        llm,
        tts,
        transport.output(),
        aggregators.assistant(),
    ])

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))

    @transport.event_handler("on_participant_joined")
    async def on_participant_joined(transport, participant):
        if participant.get("info", {}).get("userName") == "Mitesh AI Coach":
            return
            
        logger.info(f"👋 User {participant['id']} joined.")
        
        # Room connection ke liye wait
        await asyncio.sleep(5)
        
        # ⭐ TEST 1: Direct Audio Output (Bypasses LLM/Context)
        # Agar ye sunai diya, toh Cartesia/API Key bilkul sahi hai.
        logger.info("📤 Sending DIRECT TextFrame Greeting...")
        await task.queue_frames([TextFrame("Namaste! Main Mitesh Khatri hoon. Kya aap mujhe sun sakte hain?")])
        
        # TEST 2: Trigger LLM (Standard pattern)
        await asyncio.sleep(2)
        logger.info("📤 Triggering LLM Response...")
        await task.queue_frames([
            LLMMessagesUpdateFrame(messages=[
                {"role": "user", "content": "I am here. Please start."}
            ], run_llm=True)
        ])

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        await task.queue_frame(EndFrame())

    runner = PipelineRunner()
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"💥 Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(1)
    asyncio.run(run_bot(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "test-user"))
