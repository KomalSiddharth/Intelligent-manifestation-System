import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "4.0-FINAL-ISOLATION"

# Ensure logs are flushed immediately
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

from pipecat.frames.frames import (
    EndFrame, StartFrame, TextFrame, TranscriptionFrame, Frame, LLMContextFrame, AudioRawFrame
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.parallel_pipeline import ParallelPipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.transports.livekit.transport import LiveKitTransport, LiveKitParams
from pipecat.processors.frame_processor import FrameProcessor

# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
logger.remove(0)
logger.add(sys.stderr, level="INFO")

# --- CUSTOM PROCESSORS ---

class GreetingTrigger(FrameProcessor):
    """Triggers an initial greeting from the LLM on pipeline startup"""
    def __init__(self, context):
        super().__init__()
        self.context = context
        self.triggered = False

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)
        
        if isinstance(frame, StartFrame) and not self.triggered:
            self.triggered = True
            logger.info(f"✨ [{VERSION}] Pipeline Started: Injecting AI greeting...")
            
            self.context.add_message({
                "role": "system", 
                "content": "SAY IMMEDIATELY: 'Hello! I am Mitesh Khatri. I am connected and ready to help you. How are you feeling today?'"
            })
            # Pushing LLMContextFrame triggers the LLM immediately
            await self.push_frame(LLMContextFrame(self.context))

class FrameLogger(FrameProcessor):
    """Logs frame flow for debugging at high-resilience"""
    def __init__(self, label: str):
        super().__init__()
        self.label = label
        self.count = 0
        self._audio_logged = False
    
    async def process_frame(self, frame: Frame, direction):
        self.count += 1
        frame_name = type(frame).__name__
        
        if isinstance(frame, (TextFrame, TranscriptionFrame, LLMContextFrame)):
            logger.info(f"📝 [{self.label}] #{self.count} {frame_name}")
        elif isinstance(frame, StartFrame):
             logger.info(f"🚩 [{self.label}] #{self.count} StartFrame")
        elif isinstance(frame, AudioRawFrame) and not self._audio_logged:
             logger.info(f"🔊 [{self.label}] #{self.count} Audio Flow Detected")
             self._audio_logged = True
             
        await super().process_frame(frame, direction)

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 60)
    logger.info(f"🚀 {VERSION} 🚀")
    logger.info(f"📍 Room: {room_url}")
    logger.info("=" * 60)

    # API Keys & Trace
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")
    
    logger.info(f"🧪 [DEBUG] Cartesia Key present: {'✅' if cartesia_key else '❌'}")
    logger.info(f"🧪 [DEBUG] OpenAI Key present: {'✅' if openai_key else '❌'}")
    logger.info(f"🧪 [DEBUG] Cartesia Voice ID: {voice_id[:10]}..." if voice_id else "🧪 [DEBUG] Voice ID: ❌")

    if not all([cartesia_key, openai_key, voice_id]):
        logger.error("❌ ABORTING: Missing API keys")
        return

    # Transport: LiveKit
    transport = LiveKitTransport(
        room_url, token, "Mitesh AI Coach",
        LiveKitParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer()
        )
    )

    # Services
    logger.info("🎤 Initializing AI Services...")
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o")
    tts = CartesiaTTSService(api_key=cartesia_key, voice_id=voice_id)
    logger.info("✅ Services (STT/LLM/TTS) Ready")

    # Context & Aggregators
    base_prompt = "You are Mitesh Khatri, a world-class coach. Keep answers short (1-2 sentences)."
    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # Monitors
    greeting_trigger = GreetingTrigger(context)
    trace_input = FrameLogger("1-Input")
    trace_post_agg = FrameLogger("2-PostAgg")
    trace_post_llm = FrameLogger("3-PostLLM")
    trace_post_tts = FrameLogger("4-PostTTS")

    # Pipeline: THE FINAL ISOLATION
    pipeline = Pipeline([
        transport.input(),
        trace_input,
        stt,
        aggregators.user(),
        trace_post_agg,
        greeting_trigger, # Trigger fires AFTER user aggregator to bypass VAD stalls
        llm,
        trace_post_llm,
        tts,
        trace_post_tts,
        transport.output(),
        aggregators.assistant(),
    ])

    task = PipelineTask(
        pipeline, 
        params=PipelineParams(
            allow_interruptions=True,
            idle_timeout=0 
        )
    )
    runner = PipelineRunner()
    
    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        p_id = getattr(participant, "identity", str(participant))
        logger.info(f"👋 [{VERSION}] USER JOINED: {p_id}")

    @transport.event_handler("on_connected")
    async def on_connected(transport):
        logger.info(f"🎉 [{VERSION}] Bot connected to room")

    logger.info("🏃 STARTING PIPELINE RUNNER...")
    await runner.run(task)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))
