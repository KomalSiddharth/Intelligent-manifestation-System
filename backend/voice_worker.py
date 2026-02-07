import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "14.0-CARTESIA-FULL"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

from pipecat.frames.frames import TextFrame, TranscriptionFrame, Frame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.transports.livekit.transport import LiveKitTransport, LiveKitParams
from pipecat.processors.frame_processor import FrameProcessor

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
logger.remove(0)
logger.add(sys.stderr, level="INFO")

# Frame logger for debugging
class FrameLogger(FrameProcessor):
    def __init__(self, label: str):
        super().__init__()
        self.label = label
        self.count = 0
    
    async def process_frame(self, frame: Frame, direction):
        self.count += 1
        if isinstance(frame, TextFrame):
            logger.info(f"📝 [{self.label}] TextFrame: '{frame.text[:40]}'...")
        elif isinstance(frame, TranscriptionFrame):
            logger.info(f"🎤 [{self.label}] Transcription: '{frame.text}'")
        
        await super().process_frame(frame, direction)

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 70)
    logger.info(f"🎯 {VERSION} - MITESH'S VOICE + FULL CONVERSATION")
    logger.info("=" * 70)

    # API Keys
    openai_key = os.getenv("OPENAI_API_KEY")
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")
    
    if not all([openai_key, cartesia_key, voice_id]):
        logger.error("❌ Missing API keys!")
        logger.error(f"   OpenAI: {'✅' if openai_key else '❌'}")
        logger.error(f"   Cartesia: {'✅' if cartesia_key else '❌'}")
        logger.error(f"   Voice ID: {'✅' if voice_id else '❌'}")
        return

    # Transport
    logger.info("🔌 Transport...")
    transport = LiveKitTransport(
        room_url, token, "Mitesh AI Coach",
        LiveKitParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer()
        )
    )

    # Services
    logger.info("🎤 STT: OpenAI Whisper")
    stt = OpenAISTTService(api_key=openai_key)
    
    logger.info("🧠 LLM: GPT-4o-mini")
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    
    logger.info(f"🔊 TTS: Cartesia (Mitesh's Voice)")
    logger.info(f"   Voice ID: {voice_id[:30]}...")
    tts = CartesiaTTSService(
        api_key=cartesia_key,
        voice_id=voice_id
    )

    # Context
    base_prompt = "You are Mitesh Khatri, a world-class life coach. Keep answers SHORT (1-2 sentences max)."
    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # Pipeline
    logger.info("🔧 Building pipeline...")
    pipeline = Pipeline([
        transport.input(),
        stt,
        FrameLogger("AfterSTT"),
        aggregators.user(),
        llm,
        FrameLogger("AfterLLM"),
        tts,
        FrameLogger("AfterTTS"),
        transport.output(),
        aggregators.assistant()
    ])
    logger.info("✅ Pipeline built")

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
    runner = PipelineRunner()
    
    connected = False
    greeted = False
    
    @transport.event_handler("on_connected")
    async def on_connected(transport):
        nonlocal connected
        logger.info("🎉 BOT CONNECTED")
        connected = True

    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        nonlocal greeted
        
        logger.info("=" * 70)
        logger.info(f"👋 USER JOINED: {participant.identity}")
        logger.info("=" * 70)
        
        if greeted:
            logger.info("⚠️ Already greeted")
            return
        
        greeted = True
        
        try:
            # Wait for connection
            logger.info("⏳ Step 1: Waiting for connection...")
            for i in range(20):
                if connected:
                    break
                await asyncio.sleep(0.5)
            
            if not connected:
                logger.error("❌ Connection timeout!")
                return
            
            logger.info("✅ Step 1: Connected")
            
            # Wait for frontend audio subscription (based on logs: ~20 seconds)
            logger.info("⏳ Step 2: Waiting for frontend audio (20 sec)...")
            for i in range(20):
                await asyncio.sleep(1)
                if (i + 1) % 5 == 0:
                    logger.info(f"   Progress: {i + 1}/20 seconds")
            
            logger.info("✅ Step 2: Frontend should be subscribed")
            
            # Safety buffer
            logger.info("⏳ Step 3: Safety buffer (2 sec)...")
            await asyncio.sleep(2)
            logger.info("✅ Step 3: Ready")
            
            # Send greeting
            greeting = "Hello! I am Mitesh, your AI coach. How can I help you today?"
            
            logger.info("=" * 70)
            logger.info("📤 SENDING GREETING (Cartesia Voice)")
            logger.info(f"   Text: '{greeting}'")
            logger.info("=" * 70)
            
            context.add_message({"role": "assistant", "content": greeting})
            logger.info("   ✅ Context updated")
            
            await tts.process_frame(TextFrame(greeting), None)
            logger.info("   ✅ Sent to Cartesia TTS")
            
            logger.info("=" * 70)
            logger.info("✅ GREETING COMPLETE - LISTENING FOR YOUR QUESTIONS!")
            logger.info("=" * 70)
            
        except Exception as e:
            logger.error(f"❌ ERROR: {e}")
            import traceback
            traceback.print_exc()

    logger.info("🏃 STARTING...")
    logger.info("=" * 70)
    
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"💥 ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))
