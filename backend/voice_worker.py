import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

VERSION = "12.0-FRONTEND-SYNC"

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

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info("=" * 70)
    logger.info(f"🎯 {VERSION} - WAIT FOR FRONTEND AUDIO")
    logger.info("=" * 70)

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

    # Services (Ultra-stable OpenAI)
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = OpenAITTSService(api_key=openai_key, voice="alloy")

    # Context
    base_prompt = "You are Mitesh Khatri, a world-class life coach. Keep your answers brief (max 2 sentences)."
    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # Simple Linear Pipeline
    pipeline = Pipeline([
        transport.input(),
        stt,
        aggregators.user(),
        llm,
        tts,
        transport.output(),
        aggregators.assistant(),
    ])

    # No idle timeout
    task = PipelineTask(pipeline, params=PipelineParams(idle_timeout=0))
    runner = PipelineRunner()
    
    # State flags
    greeted = False
    
    # --- EVENT HANDLERS ---

    @transport.event_handler("on_connected")
    async def on_connected(transport):
        logger.info("🎉 [SYNC] BOT CONNECTED TO ROOM.")

    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        logger.info(f"👋 [SYNC] USER JOINED: {getattr(participant, 'identity', 'unknown')}. Waiting for audio track...")

    @transport.event_handler("on_track_subscribed")
    async def on_track_subscribed(transport, track, publication, participant):
        nonlocal greeted
        
        logger.info(f"🎵 [SYNC] TRACK SUBSCRIBED: {track.kind.name} from {getattr(participant, 'identity', 'unknown')}")
        
        # WE ONLY GREET WHEN THE BROWSER IS LISTENING TO AUDIO
        if track.kind.name == "AUDIO":
            if greeted:
                logger.info("⚠️ Already greeted, skipping secondary track.")
                return
            greeted = True
            
            logger.info("=" * 70)
            logger.info("✅ SUCCESS: FRONTEND IS NOW LISTENING!")
            logger.info("=" * 70)
            
            try:
                # Give 2 seconds for WebRTC audio buffer to clear
                logger.info("⏳ Stabilizing audio (2s)...")
                await asyncio.sleep(2.0)
                
                greeting = "Hello! I am Mitesh. I am finally connected and I can hear that you are listening. How can I support you today?"
                logger.info(f"📤 GREETING: '{greeting}'")
                
                # Context sync
                context.add_message({"role": "assistant", "content": greeting})
                
                # Direct Injection to ensure it goes out IMMEDIATELY
                await tts.process_frame(TextFrame(greeting), None)
                logger.info("✅ GREETING SENT TO TRANSPORT.")
                
            except Exception as e:
                logger.error(f"❌ GREETING TRIGGER FAILED: {e}")
                import traceback
                traceback.print_exc()

    logger.info("🏃 STARTING FRONTEND-SYNC PIPELINE...")
    await runner.run(task)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))
