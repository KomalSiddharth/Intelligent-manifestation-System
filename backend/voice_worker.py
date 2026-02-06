import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "7.0-RESILIENT-RESTORE"

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
    """Prevents pipeline frames from hitting the transport until connected"""
    def __init__(self):
        super().__init__()
        self._connected = False

    def set_connected(self):
        logger.info("🔓 [GATE] Signal Received: Transport Connected.")
        self._connected = True

    async def process_frame(self, frame: Frame, direction):
        if isinstance(frame, StartFrame):
            logger.info("⏳ [GATE] StartFrame detected. Waiting for connection handshake...")
            # Wait up to 10 seconds for connection
            for _ in range(20):
                if self._connected:
                    break
                await asyncio.sleep(0.5)
            
            if not self._connected:
                logger.warning("⚠️ [GATE] Connection timeout! Releasing frame anyway to avoid deadlock.")
            else:
                logger.info("🚀 [GATE] Releasing StartFrame to Pipeline.")
        
        await super().process_frame(frame, direction)

class FrameLogger(FrameProcessor):
    def __init__(self, label: str):
        super().__init__()
        self.label = label
        self.count = 0
    
    async def process_frame(self, frame: Frame, direction):
        self.count += 1
        if isinstance(frame, (TextFrame, TranscriptionFrame, LLMContextFrame, StartFrame)):
             logger.info(f"🚩 [{self.label}] #{self.count} {type(frame).__name__}")
        elif isinstance(frame, AudioRawFrame) and self.count % 100 == 1:
             logger.info(f"🔊 [{self.label}] #{self.count} Audio Packet Flowing")
             
        await super().process_frame(frame, direction)

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 60)
    logger.info(f"� {VERSION} �")
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

    # Services
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = OpenAITTSService(api_key=openai_key, voice="alloy")

    # Context & Aggregators
    base_prompt = "You are Mitesh Khatri, a world-class life coach. Keep your answers brief (max 2 sentences). You are now connected."
    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # Resilient Gate
    gate = ConnectionGate()

    # Pipeline
    pipeline = Pipeline([
        transport.input(),
        stt,
        aggregators.user(),
        gate,
        llm,
        FrameLogger("POST-LLM"),
        tts,
        FrameLogger("POST-TTS"),
        transport.output(),
        aggregators.assistant(),
    ])

    task = PipelineTask(pipeline, params=PipelineParams(idle_timeout=0))
    runner = PipelineRunner()
    
    # --- EVENT HANDLERS ---

    @transport.event_handler("on_connected")
    async def on_connected(transport):
        logger.info(f"🎉 [{VERSION}] Connected to room.")
        gate.set_connected()

    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        p_id = getattr(participant, "identity", str(participant))
        logger.info(f"👋 [{VERSION}] USER JOINED: {p_id}. Greeting in 2s...")
        await asyncio.sleep(2.0)
        
        greeting = "Hello! I am Mitesh. I am finally connected and ready to talk. Can you hear me?"
        logger.info(f"📤 INJECTING GREETING DIRECTLY: '{greeting}'")
        
        try:
            # OPTION C: Inject directly into assistant aggregator to bypass all blockers
            context.add_message({"role": "assistant", "content": greeting})
            await aggregators.assistant().process_frame(TextFrame(greeting), None)
            logger.info("✅ GREETING TRIGGERED SUCCESSFULLY.")
        except Exception as e:
            logger.error(f"❌ TRIGGER FAILED: {e}")

    logger.info("🏃 STARTING RESILIENT PIPELINE...")
    await runner.run(task)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))
