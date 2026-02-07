import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "9.0-ULTRA-STABLE"

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

class GreetingIniter(FrameProcessor):
    """Triggers the first greeting as part of the pipeline flow to avoid race conditions"""
    def __init__(self, greeting_text: str):
        super().__init__()
        self._greeting_text = greeting_text
        self._greeting_sent = False

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)
        
        # After StartFrame passes through, we inject our greeting
        if isinstance(frame, StartFrame) and not self._greeting_sent:
            self._greeting_sent = True
            logger.info(f"📤 [GREETING-INITER] StartFrame seen. Injecting greeting: '{self._greeting_text}'")
            # We push a TextFrame forward to the LLM/TTS
            await self.push_frame(TextFrame(self._greeting_text))

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

    # Services (OpenAI focus for absolute stability)
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = OpenAITTSService(api_key=openai_key, voice="alloy")

    # Context & Aggregators
    base_prompt = "You are Mitesh Khatri, a world-class life coach. Keep your answers brief (max 2 sentences). You are now connected and ready to help."
    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # Handshake & Initer
    gate = ConnectionGate()
    greeting_text = "Hello! I am Mitesh. I am finally connected and ready to speak. How can I support you today?"
    initer = GreetingIniter(greeting_text)

    # Pipeline
    pipeline = Pipeline([
        transport.input(),
        stt,
        aggregators.user(),
        gate,
        initer, # Greeting happens RIGHT after gate releases the switch
        llm,
        FrameLogger("POST-LLM"),
        tts,
        FrameLogger("POST-TTS"),
        transport.output(),
        aggregators.assistant(),
    ])

    # Ultra high idle timeout to prevent premature stops
    task = PipelineTask(pipeline, params=PipelineParams(idle_timeout=999999))
    runner = PipelineRunner()
    
    # --- EVENT HANDLERS ---

    @transport.event_handler("on_connected")
    async def on_connected(transport):
        logger.info(f"🎉 [{VERSION}] Connected to room.")
        gate.set_connected()

    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        p_id = getattr(participant, "identity", str(participant))
        logger.info(f"👋 [{VERSION}] USER JOINED: {p_id}.")

    logger.info("🏃 STARTING ULTRA-STABLE PIPELINE...")
    await runner.run(task)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))
