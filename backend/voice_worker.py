import asyncio
import os
import sys
import time
from loguru import logger
from dotenv import load_dotenv

from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import (
    TextFrame, EndFrame, AudioRawFrame, TranscriptionFrame, LLMMessagesUpdateFrame
)

# Deep Trace Logger to find the "Black Hole"
class DeepTraceLogger(FrameProcessor):
    def __init__(self, label: str):
        super().__init__()
        self.label = label
    
    async def process_frame(self, frame, direction):
        # Log almost everything to see what's flowing
        frame_type = type(frame).__name__
        
        if isinstance(frame, AudioRawFrame):
            # Only log audio chunks occasionally to avoid spam
            if getattr(self, "audio_count", 0) % 500 == 0:
                logger.info(f"🔊 [{self.label}] Audio frame flowing...")
            self.audio_count = getattr(self, "audio_count", 0) + 1
        else:
            if isinstance(frame, TextFrame):
                logger.info(f"📝 [{self.label}] {frame_type}: {frame.text[:50]}")
            elif isinstance(frame, TranscriptionFrame):
                logger.info(f"🎤 [{self.label}] {frame_type}: {frame.text}")
            else:
                logger.info(f"🔍 [{self.label}] Frame: {frame_type}")
        
        await super().process_frame(frame, direction)

VERSION = "29.0-DAILY-PRODUCTION"

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Clean logging
logger.remove()
logger.add(sys.stderr, level="INFO", format="{time:HH:mm:ss} | {level} | {message}")


async def run_bot(room_url: str, token: str, user_id: str = "anonymous"):
    """Main bot function — called from app.py's background thread"""

    logger.info("=" * 60)
    logger.info(f"🎯 {VERSION}")
    logger.info(f"🏠 Room: {room_url}")
    logger.info(f"👤 User: {user_id}")
    logger.info("=" * 60)

    # --- Import heavy modules ---
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.pipeline.task import PipelineTask, PipelineParams
    from pipecat.services.openai.stt import OpenAISTTService
    from pipecat.services.openai.llm import OpenAILLMService
    from pipecat.services.cartesia.tts import CartesiaTTSService
    from pipecat.processors.aggregators.llm_context import (
        LLMContext, 
        LLMUserAggregator, 
        LLMAssistantAggregator
    )
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.transports.daily.transport import DailyTransport, DailyParams

    # --- Validate API Keys ---
    openai_key = os.getenv("OPENAI_API_KEY")
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")

    if not all([openai_key, cartesia_key, voice_id]):
        logger.error("❌ Missing AI API keys! Check .env")
        return

    # VAD Analyzer
    vad = SileroVADAnalyzer()

    # --- Transport ---
    # following depolarization warning: vad_enabled removed, vad_analyzer NOT here
    transport = DailyTransport(
        room_url,
        token,
        "Mitesh AI Coach",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=False, # We don't want Daily to manage audio out, we use transport.output()
            camera_out_enabled=False,
        )
    )
    # Manual fix for transport output
    transport.set_params(DailyParams(audio_out_enabled=True))

    # --- AI Services ---
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = CartesiaTTSService(api_key=cartesia_key, voice_id=voice_id)

    # --- System Prompt ---
    system_prompt = """You are Mitesh Khatri, a world-class life coach. 
    Speak naturally in Hinglish. Keep responses under 2 sentences.
    Greeting: "Namaste! Main hoon Mitesh, aapka AI life coach. Aaj main aapki kaise madad kar sakta hoon?" """
    
    context = LLMContext([{"role": "system", "content": system_prompt}])
    
    # Using the exact names suggested by the warning
    user_aggregator = LLMUserAggregator(context, vad_analyzer=vad)
    assistant_aggregator = LLMAssistantAggregator(context)

    # --- Pipeline ---
    pipeline = Pipeline([
        transport.input(),       # 1. In
        DeepTraceLogger("IN"),
        stt,                     # 2. STT
        DeepTraceLogger("STT"),
        user_aggregator,         # 3. Aggregator (with VAD)
        DeepTraceLogger("AGG"),
        llm,                     # 4. LLM
        DeepTraceLogger("LLM"),
        tts,                     # 5. TTS
        DeepTraceLogger("TTS"),
        transport.output(),      # 6. Out
        assistant_aggregator,    # 7. Store bot's context
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=False,
        )
    )

    # --- Event Handlers ---
    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(transport, participant):
        logger.info(f"👋 User joined! Preparing greeting...")
        # Direct Text greeting to jumpstart the pipeline
        await task.queue_frames([TextFrame("Hi Mitesh, please introduce yourself and greet the user.")])

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        logger.info(f"👋 User left. Ending bot...")
        await task.queue_frame(EndFrame())

    @transport.event_handler("on_call_state_updated")
    async def on_call_state_updated(transport, state):
        logger.info(f"📞 Call state: {state}")
        if state == "left":
            await task.queue_frame(EndFrame())

    # --- Run ---
    runner = PipelineRunner(handle_sigint=False)

    logger.info("🏃 Starting pipeline...")
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"💥 Pipeline error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        logger.info(f"🏁 Bot session ended")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python voice_worker.py <room_url> <token>")
        sys.exit(1)
    asyncio.run(run_bot(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "test"))
