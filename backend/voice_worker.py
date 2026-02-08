import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import (
    TextFrame, EndFrame, AudioRawFrame, TranscriptionFrame, LLMMessagesUpdateFrame
)

# Custom Logger to see frames
class FrameLogger(FrameProcessor):
    def __init__(self, label: str):
        super().__init__()
        self.label = label
    
    async def process_frame(self, frame, direction):
        if isinstance(frame, TextFrame):
            logger.info(f"📝 [{self.label}] Text: {frame.text[:50]}...")
        elif isinstance(frame, TranscriptionFrame):
            logger.info(f"🎤 [{self.label}] Transcription: {frame.text}")
        
        await super().process_frame(frame, direction)

VERSION = "23.0-DAILY-PRODUCTION"

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Clean logging
logger.remove()
logger.add(sys.stderr, level="INFO", format="{time:HH:mm:ss} | {level} | {message}")


async def run_bot(room_url: str, token: str, user_id: str = "anonymous"):
    """Main bot function — called from app.py's background thread"""

    logger.info("=" * 60)
    logger.info(f"🎯 {VERSION}")
    logger.info(f"🏠 Room: {room_url}")
    logger.info(f"👤 User: {user_id}")
    logger.info("=" * 60)

    # --- Import heavy modules here (not at top level) ---
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.pipeline.task import PipelineTask, PipelineParams
    from pipecat.services.openai.stt import OpenAISTTService
    from pipecat.services.openai.llm import OpenAILLMService
    from pipecat.services.cartesia.tts import CartesiaTTSService
    from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.transports.daily.transport import DailyTransport, DailyParams

    # --- Validate API Keys ---
    openai_key = os.getenv("OPENAI_API_KEY")
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")

    if not all([openai_key, cartesia_key, voice_id]):
        logger.error("❌ Missing API keys! Check OPENAI_API_KEY, CARTESIA_API_KEY, CARTESIA_VOICE_ID")
        return

    # --- Transport (Daily.co) ---
    transport = DailyTransport(
        room_url,
        token,
        "Mitesh AI Coach",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        )
    )

    # VAD Analyzer
    vad = SileroVADAnalyzer()

    # --- AI Services ---
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    tts = CartesiaTTSService(api_key=cartesia_key, voice_id=voice_id)

    # --- System Prompt ---
    system_prompt = """You are Mitesh Khatri, a world-class life coach and motivational speaker.

Your personality:
- Warm, empathetic, and encouraging
- You speak in a mix of Hindi and English (Hinglish) naturally
- You give practical, actionable advice
- You keep responses SHORT (2-3 sentences max for voice conversation)
- You ask follow-up questions to understand the person better

When greeting someone for the first time, say:
"Namaste! Main hoon Mitesh, aapka AI life coach. Aaj main aapki kaise madad kar sakta hoon?"

IMPORTANT: Keep ALL responses under 3 sentences. This is a voice conversation, not text chat."""

    # --- Context & Aggregators ---
    context = LLMContext([{"role": "system", "content": system_prompt}])
    aggregators = LLMContextAggregatorPair(context, vad_analyzer=vad)

    # --- Pipeline ---
    pipeline = Pipeline([
        transport.input(),       # Receive audio from user's mic
        stt,                     # Speech-to-Text
        FrameLogger("STT Out"),
        aggregators.user(),      # Handles VAD & Aggregation
        llm,                     # Generating response
        FrameLogger("LLM Out"),
        aggregators.assistant(), # Aggregates bot's text response
        tts,                     # Text-to-Speech
        FrameLogger("TTS Out"),
        transport.output(),      # Send audio back
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
        )
    )

    # --- Event Handlers ---
    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(transport, participant):
        """Trigger greeting when user joins the room"""
        logger.info(f"👋 User joined! Triggering greeting...")
        # Queueing a TextFrame to the LLM to trigger a context-aware response or just speech
        await task.queue_frames([TextFrame("Namaste! Main hoon Mitesh, aapka AI life coach. Aaj main aapki kaise madad kar sakta hoon?")])

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        """Cleanup when user leaves"""
        logger.info(f"👋 User left (reason: {reason}). Ending bot...")
        await task.queue_frame(EndFrame())

    @transport.event_handler("on_call_state_updated")
    async def on_call_state_updated(transport, state):
        """Monitor call state"""
        logger.info(f"📞 Call state: {state}")
        if state == "left":
            await task.queue_frame(EndFrame())

    # --- Run ---
    # handle_sigint=False is critical because we run this in a background thread.
    runner = PipelineRunner(handle_sigint=False)

    logger.info("🏃 Starting pipeline...")
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"💥 Pipeline error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        logger.info(f"🏁 Bot session ended for {user_id}")


# For standalone testing
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python voice_worker.py <room_url> <token> [user_id]")
        sys.exit(1)

    asyncio.run(run_bot(
        sys.argv[1],
        sys.argv[2],
        sys.argv[3] if len(sys.argv) > 3 else "test-user"
    ))
