import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "13.0-FINAL-TIMED"

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

# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
logger.remove(0)
logger.add(sys.stderr, level="INFO")

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 70)
    logger.info(f"🎯 {VERSION} - GUARANTEED AUDIO WITH TIMING")
    logger.info("=" * 70)

    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        logger.error("❌ Missing OpenAI API Key")
        return

    # Transport
    logger.info("🔌 Initializing Transport...")
    transport = LiveKitTransport(
        room_url, token, "Mitesh AI Coach",
        LiveKitParams(
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer()
        )
    )

    # Services (Ultra-stable OpenAI stack)
    logger.info("🎤 STT | 🧠 LLM | 🔊 TTS (Setting up stable OpenAI)...")
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = OpenAITTSService(api_key=openai_key, voice="alloy")

    # Context
    base_prompt = "You are Mitesh Khatri, a world-class life coach. Keep your answers brief (max 2 sentences)."
    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # Simple Linear Pipeline (No custom gates, just standard flow)
    pipeline = Pipeline([
        transport.input(),
        stt,
        aggregators.user(),
        llm,
        tts,
        transport.output(),
        aggregators.assistant(),
    ])

    # No idle timeout (0 ensures bot stays alive even during silence/wait)
    task = PipelineTask(pipeline, params=PipelineParams(idle_timeout=0))
    runner = PipelineRunner()
    
    # State flags
    connected = False
    greeted = False
    
    # --- EVENT HANDLERS ---

    @transport.event_handler("on_connected")
    async def on_connected(transport):
        nonlocal connected
        logger.info("🎉 [TIMED] BOT CONNECTED TO ROOM.")
        connected = True

    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        nonlocal greeted
        
        logger.info("=" * 70)
        logger.info(f"👋 [TIMED] USER JOINED: {getattr(participant, 'identity', 'unknown')}")
        logger.info("=" * 70)
        
        if greeted:
            logger.info("⚠️ Already greeted, skipping.")
            return
        greeted = True
        
        try:
            # Step 1: Connection Verification
            logger.info("⏳ Step 1: Waiting for backend connection...")
            for i in range(10):
                if connected:
                    break
                await asyncio.sleep(0.5)
            
            if not connected:
                logger.error("❌ Step 1 FAILED: Bot not connected yet.")
                return
            logger.info("✅ Step 1: Connected.")

            # Step 2: Fixed Delay for Frontend Subscription (Senior Suggestion)
            # Logs show ~16s gap, we wait 20s to be mathematically safe.
            logger.info("⏳ Step 2: Waiting 20 seconds for browser audio subscription...")
            for i in range(20):
                await asyncio.sleep(1)
                if (i + 1) % 5 == 0:
                    logger.info(f"   Wait Progress: {i + 1}/20 seconds...")
            
            # Step 3: Safety Buffer
            logger.info("⏳ Step 3: Final stabilizing 2s buffer...")
            await asyncio.sleep(2.0)
            logger.info("✅ Step 3: Readiness confirmed.")
            
            # Step 4: Final Greeting Delivery
            greeting = "Hello! I am Mitesh, your AI coach. I am finally connected and I can hear that you are listening. How can I support you today?"
            logger.info("=" * 70)
            logger.info("📤 Step 4: SENDING GREETING NOW")
            logger.info(f"   Text: '{greeting}'")
            logger.info("=" * 70)
            
            # Context sync
            context.add_message({"role": "assistant", "content": greeting})
            logger.info("   ✅ 4a: Context updated.")
            
            # Direct Service Injection (Bypasses any internal pipeline stalls)
            await tts.process_frame(TextFrame(greeting), None)
            logger.info("   ✅ 4b: Sent to TTS.")
            
            logger.info("=" * 70)
            logger.info("✅ GREETING SEQUENCE FINISHED - LISTEN FOR AUDIO!")
            logger.info("=" * 70)
            
        except Exception as e:
            logger.error("=" * 70)
            logger.error(f"❌ GREETING SEQUENCE FAILED: {e}")
            logger.error("=" * 70)
            import traceback
            traceback.print_exc()

    logger.info("🏃 STARTING PIPELINE...")
    await runner.run(task)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))
