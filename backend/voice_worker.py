import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "16.0-WORKING"

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

class FrameLogger(FrameProcessor):
    def __init__(self, label: str):
        super().__init__()
        self.label = label
        self.count = 0
    
    async def process_frame(self, frame: Frame, direction):
        self.count += 1
        if isinstance(frame, TextFrame):
            logger.info(f"📝 [{self.label}] Text: '{frame.text[:40]}'...")
        elif isinstance(frame, TranscriptionFrame):
            logger.info(f"🎤 [{self.label}] Transcription: '{frame.text}'")
        
        await super().process_frame(frame, direction)

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 70)
    logger.info(f"🎯 {VERSION} - MITESH AI VOICE")
    logger.info("=" * 70)

    openai_key = os.getenv("OPENAI_API_KEY")
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")
    
    if not all([openai_key, cartesia_key, voice_id]):
        logger.error("❌ Missing keys!")
        return

    logger.info(f"🔊 Voice: {voice_id[:30]}...")

    # Transport
    transport = LiveKitTransport(
        room_url, token, "Mitesh AI Coach",
        LiveKitParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer()
        )
    )

    # Services
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = CartesiaTTSService(api_key=cartesia_key, voice_id=voice_id)

    # Context
    base_prompt = "You are Mitesh Khatri, a world-class life coach. Keep answers SHORT (1-2 sentences max)."
    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # Pipeline
    logger.info("🔧 Pipeline...")
    pipeline = Pipeline([
        transport.input(),
        stt,
        FrameLogger("STT"),
        aggregators.user(),
        llm,
        FrameLogger("LLM"),
        tts,
        FrameLogger("TTS"),
        transport.output(),
        aggregators.assistant()
    ])

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True, idle_timeout=0))
    runner = PipelineRunner()
    
    connected = False
    greeted = False
    
    @transport.event_handler("on_connected")
    async def on_connected(transport):
        nonlocal connected
        logger.info("🎉 CONNECTED")
        connected = True

    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        nonlocal greeted
        
        try:
            pid = participant if isinstance(participant, str) else getattr(participant, 'identity', 'user')
        except:
            pid = "user"
        
        logger.info(f"👋 USER: {pid}")
        
        if greeted:
            return
        greeted = True
        
        try:
            logger.info("⏳ Connection check...")
            for i in range(20):
                if connected:
                    break
                await asyncio.sleep(0.5)
            if not connected:
                logger.error("❌ Timeout")
                return
            
            logger.info("✅ Connected")
            
            logger.info("⏳ Frontend sync (20 sec)...")
            for i in range(20):
                await asyncio.sleep(1)
                if (i + 1) % 5 == 0:
                    logger.info(f"   {i + 1}/20")
            
            logger.info("✅ Ready")
            await asyncio.sleep(2)
            
            greeting = "Hello! I am Mitesh. How can I help you today?"
            
            logger.info("=" * 70)
            logger.info(f"📤 GREETING: '{greeting}'")
            logger.info("=" * 70)
            
            # Sync context first
            context.add_message({"role": "assistant", "content": greeting})
            
            # ⭐ FIX: DIRECT INJECTION INTO GENERATIVE PATH
            logger.info("🎯 Injecting via LLM processor to bypass input bottlenecks...")
            
            # In Pipecat, calling push_frame on a processor sends it to the NEXT in line.
            # We push to llm, so it goes to TTS -> Transport.Output.
            await llm.push_frame(TextFrame(greeting))
            
            logger.info("✅ INJECTION COMPLETE")
            logger.info("=" * 70)
            
        except Exception as e:
            logger.error(f"❌ ERROR: {e}")
            import traceback
            traceback.print_exc()

    logger.info("🏃 STARTING...")
    
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"💥 ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))
