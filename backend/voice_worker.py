import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "10.0-TRANSPORT-MASTER"

# Ensure logs are flushed immediately
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

from pipecat.frames.frames import (
    EndFrame, StartFrame, TextFrame, TranscriptionFrame, Frame, LLMContextFrame, AudioRawFrame
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.openai.tts import OpenAITTSService
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.transports.livekit.transport import LiveKitTransport, LiveKitParams
from pipecat.processors.frame_processor import FrameProcessor

# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
logger.remove(0)
logger.add(sys.stderr, level="INFO")

# --- CUSTOM PROCESSORS ---

class ConnectionGate(FrameProcessor):
    """Holds EVERYTHING until transport is connected. The master switch."""
    def __init__(self):
        super().__init__()
        self._connected = False

    def set_connected(self):
        logger.info("🔓 [GATE] Signal Received: Transport Connected.")
        self._connected = True

    async def process_frame(self, frame: Frame, direction):
        # We hold system frames too, especially StartFrame
        if not self._connected:
             if isinstance(frame, StartFrame):
                logger.info("⏳ [GATE] StartFrame detected. Waiting for connection...")
                while not self._connected:
                    await asyncio.sleep(0.5)
                logger.info("🚀 [GATE] Handshake confirmed. Releasing StartFrame.")
        
        await super().process_frame(frame, direction)

class GreetingTrigger(FrameProcessor):
    """Fires the greeting ONLY after the pipeline has officially started."""
    def __init__(self, text: str):
        super().__init__()
        self._text = text
        self._sent = False

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)
        
        # We trigger on StartFrame AFTER it has been passed forward
        # This ensures downstream (TTS) has received StartFrame and is ready.
        if isinstance(frame, StartFrame) and not self._sent:
            self._sent = True
            logger.info(f"📤 [TRIGGER] Pipeline started. Injecting greeting: '{self._text}'")
            # Push forward to LLM -> TTS
            await self.push_frame(TextFrame(self._text))

class FrameLogger(FrameProcessor):
    def __init__(self, label: str):
        super().__init__()
        self.label = label
        self.count = 0
    
    async def process_frame(self, frame: Frame, direction):
        self.count += 1
        if isinstance(frame, (TextFrame, TranscriptionFrame, StartFrame)):
             logger.info(f"🚩 [{self.label}] #{self.count} {type(frame).__name__}")
        elif isinstance(frame, AudioRawFrame) and self.count % 100 == 1:
             logger.info(f"🔊 [{self.label}] #{self.count} Audio Packet Flowing")
             
        await super().process_frame(frame, direction)

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 60)
    logger.info(f"🛡️ {VERSION} 🛡️")
    logger.info("=" * 60)

    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        logger.error("❌ Missing OpenAI API Key")
        return

    # Transport
    transport = LiveKitTransport(
        room_url, token, "Mitesh AI Coach",
        LiveKitParams(
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer()
        )
    )

    # Services (Ultra-stable OpenAI stack)
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = OpenAITTSService(api_key=openai_key, voice="alloy")

    # Context
    base_prompt = "You are Mitesh Khatri, a world-class life coach. Keep your answers brief (max 2 sentences). You are now connected."
    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # Handshake Components
    gate = ConnectionGate()
    greeting = GreetingTrigger("Hello! I am Mitesh. I am finally connected and ready to support you. How are you feeling today?")

    # Pipeline: linear and clean
    pipeline = Pipeline([
        transport.input(),
        gate,      # Hold everything for connection
        greeting,  # Trigger greeting on StartFrame
        stt,
        aggregators.user(),
        llm,
        tts,
        FrameLogger("EXIT"), # Final trace before transport
        transport.output(),
        aggregators.assistant(),
    ])

    # Zero timeout (Infinite)
    task = PipelineTask(pipeline, params=PipelineParams(idle_timeout=0))
    runner = PipelineRunner()
    
    # --- EVENT HANDLERS ---

    @transport.event_handler("on_connected")
    async def on_connected(transport):
        logger.info(f"🎉 [{VERSION}] Handshake Successful.")
        gate.set_connected()

    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        logger.info(f"👋 [{VERSION}] USER SEEN: {getattr(participant, 'identity', 'unknown')}")

    logger.info("🏃 RUNNING TRANSPORT-MASTER PIPELINE...")
    await runner.run(task)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))
