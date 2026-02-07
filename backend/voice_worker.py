import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "20.0-PRODUCTION-FINAL"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

from pipecat.frames.frames import (
    TextFrame, TranscriptionFrame, Frame, LLMMessagesUpdateFrame
)
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
# Clear existing handlers and set up clean loguru
logger.remove(0)
logger.add(sys.stderr, level="INFO")

# Frame logger for debugging pipeline flow
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
            logger.info(f"🎤 [{self.label}] User said: '{frame.text}'")
        
        await super().process_frame(frame, direction)

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 70)
    logger.info(f"🎯 {VERSION} - THE EVENT-DRIVEN SYNC")
    logger.info("=" * 70)

    # API Keys
    openai_key = os.getenv("OPENAI_API_KEY")
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")
    
    if not all([openai_key, cartesia_key, voice_id]):
        logger.error("❌ Missing API keys!")
        return

    logger.info(f"🔊 Authenticated Voice: {voice_id[:30]}...")

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

    # Context with System Prompt Greeting Trigger
    base_prompt = """You are Mitesh Khatri, a world-class life coach.

When the conversation starts (you receive a 'start' message), immediately greet the user by saying:
"Hello! I am Mitesh, your AI coach. I am finally connected with my authentic voice. How can I help you today?"

Then, keep all your subsequent answers SHORT (1-2 sentences maximum)."""

    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # Pipeline
    logger.info("🔧 Building reactive pipeline...")
    pipeline = Pipeline([
        transport.input(),
        stt,
        FrameLogger("STT"),
        aggregators.user(),
        llm,
        aggregators.assistant(),
        FrameLogger("LLM"),
        tts,
        FrameLogger("TTS"),
        transport.output()
    ])

    # Allow interruptions but disable idle timeout to keep the pipeline alive during sync
    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True, idle_timeout=0))
    runner = PipelineRunner()
    
    # State flags
    connected = False
    audio_track_subscribed = False
    greeted = False
    
    @transport.event_handler("on_connected")
    async def on_connected(transport):
        nonlocal connected
        logger.info("🎉 [SIGNAL] CONNECTED TO ROOM")
        connected = True

    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        nonlocal greeted
        
        # Safe participant identity handling
        try:
            p_id = participant if isinstance(participant, str) else getattr(participant, 'identity', 'user')
        except:
            p_id = "user"
        
        logger.info("=" * 70)
        logger.info(f"👋 [SIGNAL] USER JOINED: {p_id}")
        logger.info("=" * 70)
        
        if greeted:
            return
        
        try:
            # Step 1: Connection Check
            logger.info("⏳ Step 1: Checking connection state...")
            for i in range(20):
                if connected:
                    break
                await asyncio.sleep(0.5)
            if not connected:
                logger.error("❌ Step 1 FAILED: Signal connection timeout.")
                return
            logger.info("✅ Step 1: Connected.")
            
            # Step 2: Reactive Audio Track Subscription Wait
            # ⭐ v20.0 FIX: Wait for ACTUAL event instead of timer
            logger.info("⏳ Step 2: Waiting for ACTUAL audio track subscription...")
            for i in range(60):  # Wait up to 60 seconds
                if audio_track_subscribed:
                    logger.info(f"✅ Step 2: Audio track subscribed after {i} seconds")
                    break
                await asyncio.sleep(1)
                if (i + 1) % 10 == 0:
                    logger.info(f"   Still waiting for frontend subscriber... {i + 1}/60 sec")
            
            if not audio_track_subscribed:
                logger.error("❌ Step 2 FAILED: Audio track subscription timeout!")
                return
            
            logger.info("✅ Step 2: Frontend confirmed ready to receive audio.")
            
            # Step 3: Final stabilization buffer
            logger.info("⏳ Step 3: Final stabilizing 2s buffer...")
            await asyncio.sleep(2)
            logger.info("✅ Step 3: Handshake verified.")
            
            # Step 4: Greeting Trigger
            if not greeted:
                greeted = True
                logger.info("=" * 70)
                logger.info("📤 Step 4: TRIGGERING GREETING")
                logger.info("=" * 70)
                
                # Trigger via user message context
                context.add_message({"role": "user", "content": "start"})
                
                # Use modern trigger frame
                update_frame = LLMMessagesUpdateFrame(
                    messages=context.get_messages(),
                    run_llm=True
                )
                
                # Queue to task
                await task.queue_frame(update_frame)
                
                logger.info("✅ Step 4: Greeting sequence initiated.")
                logger.info("=" * 70)
            
        except Exception as e:
            logger.error(f"❌ HANDLER ERROR: {e}")
            import traceback
            traceback.print_exc()

    # ⭐ NEW EVENT HANDLER WRAPPER: Monitor incoming track subscriptions
    # This captures the moment the browser actually starts receiving the bot's audio.
    original_on_track_subscribed = transport._async_on_track_subscribed
    
    async def wrapped_on_track_subscribed(track, publication, participant):
        nonlocal audio_track_subscribed
        
        # Call the original Pipecat internal handler
        await original_on_track_subscribed(track, publication, participant)
        
        # Log and set our flag
        logger.info(f"🎵 [EVENT] Audio track subscribed: {track.kind} from {participant.identity}")
        audio_track_subscribed = True
        logger.info("✅ [EVENT] AUDIO TRACK SUBSCRIPTION CONFIRMED!")
    
    # Monkey-patch the internal handler to react to the subscription event
    transport._async_on_track_subscribed = wrapped_on_track_subscribed

    logger.info("🏃 STARTING PIPELINE MASTER TASK...")
    
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"💥 RUNNER ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))
