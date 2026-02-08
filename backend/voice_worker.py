import asyncio
import os
import sys
import time
from loguru import logger
from dotenv import load_dotenv

from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import (
    TextFrame, EndFrame, AudioRawFrame, TranscriptionFrame, LLMMessagesUpdateFrame, UserStartedSpeakingFrame, UserStoppedSpeakingFrame
)

# Deep Trace Logger
class DeepFrameLogger(FrameProcessor):
    def __init__(self, label: str):
        super().__init__()
        self.label = label
        self.audio_count = 0
    
    async def process_frame(self, frame, direction):
        if isinstance(frame, TextFrame):
            logger.info(f"📝 [{self.label}] Text: {frame.text[:50]}...")
        elif isinstance(frame, TranscriptionFrame):
            logger.info(f"🎤 [{self.label}] Transcription: {frame.text}")
        elif isinstance(frame, LLMMessagesUpdateFrame):
            logger.info(f"🔄 [{self.label}] Context Update")
        elif isinstance(frame, (UserStartedSpeakingFrame, UserStoppedSpeakingFrame)):
            logger.info(f"🗣️ [{self.label}] {type(frame).__name__}")
        elif isinstance(frame, AudioRawFrame):
            self.audio_count += 1
            if self.audio_count % 500 == 0:
                logger.info(f"🔊 [{self.label}] {self.audio_count} audio chunks")
        
        await super().process_frame(frame, direction)

VERSION = "28.0-DAILY-PRODUCTION"

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
    from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.transports.daily.transport import DailyTransport, DailyParams

    # --- Validate API Keys ---
    openai_key = os.getenv("OPENAI_API_KEY")
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")

    if not all([openai_key, cartesia_key, voice_id]):
        logger.error("❌ Missing AI API keys!")
        return

    # VAD Analyzer
    vad = SileroVADAnalyzer()

    # --- Transport ---
    # Reverting to transport-level VAD which is proven to work in 0.0.101
    transport = DailyTransport(
        room_url,
        token,
        "Mitesh AI Coach",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_enabled=True,
            vad_analyzer=vad,
            vad_audio_passthrough=True,
        )
    )

    # --- AI Services ---
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = CartesiaTTSService(api_key=cartesia_key, voice_id=voice_id)

    # --- System Prompt ---
    system_prompt = """You are Mitesh Khatri, a world-class life coach. 
    You speak naturally in Hinglish (Hindi + English). 
    Keep all your responses under 2 sentences.
    
    When you start, greet the user with: "Namaste! Main hoon Mitesh, aapka AI life coach. Aaj main aapki kaise madad kar sakta hoon?" """
    
    context = LLMContext([{"role": "system", "content": system_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # --- Pipeline ---
    pipeline = Pipeline([
        transport.input(),       # In
        DeepFrameLogger("1-Mic"),
        stt,                     # Mic -> Text
        DeepFrameLogger("2-STT"),
        aggregators.user(),      # Text -> Context
        DeepFrameLogger("3-Aggregator"),
        llm,                     # Context -> Response
        DeepFrameLogger("4-LLM"),
        tts,                     # Response -> Audio
        DeepFrameLogger("5-TTS"),
        transport.output(),      # Out
        aggregators.assistant(), # Store Response in Context
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
        logger.info(f"👋 User joined! Triggering greeting...")
        # Direct trigger: Send a prompt to the LLM to introduce itself
        await task.queue_frames([LLMMessagesUpdateFrame(messages=[{"role": "user", "content": "Please introduce yourself."}])])

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
