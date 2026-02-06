import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "4.2-OPENAI-DIAGNOSTIC"

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
from pipecat.services.openai.tts import OpenAITTSService
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.transports.livekit.transport import LiveKitTransport, LiveKitParams
from pipecat.processors.frame_processor import FrameProcessor

# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
logger.remove(0)
logger.add(sys.stderr, level="INFO")

# --- CUSTOM PROCESSORS ---

class FrameLogger(FrameProcessor):
    def __init__(self, label: str):
        super().__init__()
        self.label = label
        self.count = 0
    
    async def process_frame(self, frame: Frame, direction):
        self.count += 1
        frame_name = type(frame).__name__
        
        if isinstance(frame, TextFrame):
            logger.info(f"📝 [{self.label}] #{self.count} Text: '{frame.text[:50]}'")
        elif isinstance(frame, AudioRawFrame):
            if self.count % 100 == 1:
                logger.info(f"🔊 [{self.label}] #{self.count} Audio Packet Flowing")
        elif isinstance(frame, (StartFrame, EndFrame)):
             logger.info(f"🚩 [{self.label}] #{self.count} {frame_name}")
        
        await super().process_frame(frame, direction)

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 60)
    logger.info(f"🧪 {VERSION} 🧪")
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

    # SWITCHING TO OPENAI TTS FOR STABILITY TEST
    logger.info("🔊 Initializing OpenAI TTS Fallback...")
    tts = OpenAITTSService(api_key=openai_key, voice="alloy")

    # Pipeline: NUCLEAR ISOLATION (TTS -> OUTPUT)
    pipeline = Pipeline([
        transport.input(),
        FrameLogger("1-Pre-TTS"),
        tts,
        FrameLogger("2-Post-TTS"),
        transport.output(),
    ])

    task = PipelineTask(pipeline, params=PipelineParams(idle_timeout=0))
    runner = PipelineRunner()
    
    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        p_id = getattr(participant, "identity", str(participant))
        logger.info(f"👋 [{VERSION}] USER JOINED: {p_id}. Testing audio in 3s...")
        await asyncio.sleep(3.0)
        
        greeting = "Testing OpenAI voice. If you hear this, then the LiveKit transport is working perfectly and we just need to fix Cartesia settings."
        logger.info(f"📤 QUEUEING GREETING: '{greeting}'")
        
        try:
            await task.queue_frame(TextFrame(greeting))
            logger.info("✅ GREETING QUEUED.")
        except Exception as e:
            logger.error(f"❌ QUEUE FAILED: {e}")

    @transport.event_handler("on_connected")
    async def on_connected(transport):
        logger.info(f"🎉 [{VERSION}] Connected to room")

    logger.info("🏃 RUNNING DIAGNOSTIC PIPELINE...")
    await runner.run(task)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))
