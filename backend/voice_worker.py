import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

# Ensure logs are flushed immediately
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

from pipecat.frames.frames import (
    EndFrame, StartFrame, TextFrame, TranscriptionFrame, Frame, LLMContextFrame
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.parallel_pipeline import ParallelPipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.transports.livekit.transport import LiveKitTransport, LiveKitParams
from pipecat.processors.frame_processor import FrameProcessor

# Try to import KB dependencies
try:
    from supabase import create_client
    from openai import AsyncOpenAI
    KB_AVAILABLE = True
except ImportError:
    KB_AVAILABLE = False
    logger.warning("⚠️ Supabase/OpenAI not available - KB disabled")

# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
logger.remove(0)
logger.add(sys.stderr, level="INFO")

# --- CUSTOM PROCESSORS ---

class PipelineTracer(FrameProcessor):
    """Logs frame flow for debugging"""
    def __init__(self, tracer_name):
        super().__init__()
        self.tracer_name = tracer_name
        self._audio_logged = False

    async def process_frame(self, frame: Frame, direction):
        # 🧪 v2.2-ULTRA-DIAGNOSTIC
        frame_name = type(frame).__name__
        
        if isinstance(frame, (TextFrame, TranscriptionFrame, LLMContextFrame)):
            logger.info(f"⏳ [{self.tracer_name}] -> {frame_name}")
        elif isinstance(frame, StartFrame):
             logger.info(f"🚩 [{self.tracer_name}] -> StartFrame")
        elif "AudioRawFrame" in frame_name and not self._audio_logged:
             # Only log the first audio frame to avoid spam
             logger.info(f"🔊 [{self.tracer_name}] -> {frame_name} (Audio detected!)")
             self._audio_logged = True
             
        await super().process_frame(frame, direction)

# --- KNOWLEDGE BASE PROCESSOR ---

class KnowledgeBaseProcessor(FrameProcessor):
    def __init__(self, context, openai_client, user_id, base_prompt, supabase_client):
        super().__init__()
        self.context = context
        self.openai = openai_client
        self.user_id = user_id
        self.base_prompt = base_prompt
        self.supabase = supabase_client
        self.last_transcript = ""

    async def _search_kb(self, text):
        """Helper method for KB search - resilient to casting errors"""
        try:
            # ONLY pass profile_id if it's a valid UUID string (36 chars)
            # This avoids the 'bigint to uuid' casting error in Supabase
            profile_id = self.user_id if len(self.user_id) == 36 else None
            
            embedding_response = await self.openai.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            
            rpc_params = {
                'query_embedding': embedding_response.data[0].embedding,
                'match_threshold': 0.35,
                'match_count': 3
            }
            if profile_id:
                rpc_params['p_profile_id'] = profile_id

            result = await asyncio.to_thread(
                lambda: self.supabase.rpc('match_knowledge', rpc_params).execute()
            )
            return result
        except Exception as e:
            logger.warning(f"⚠️ KB search skipped due to error (likely schema mismatch): {e}")
            return None

    async def process_frame(self, frame: Frame, direction):
        """Modified to be non-blocking for the pipeline"""
        await super().process_frame(frame, direction)
        
        if isinstance(frame, TranscriptionFrame):
            text = frame.text.strip()
            if text and text != self.last_transcript and len(text) > 3:
                self.last_transcript = text
                logger.info(f"🎤 USER: '{text}'")
                
                # Expert Move: Run the KB search in a background task
                # This prevents the pipeline from stalling while waiting for Supabase
                if self.supabase and self.openai:
                    asyncio.create_task(self._update_context_from_kb(text))

    async def _update_context_from_kb(self, text):
        """Background task to update context without blocking pipeline"""
        try:
            res = await asyncio.wait_for(self._search_kb(text), timeout=5.0)
            if res and res.data:
                kb_text = "\n".join([f"- {it.get('content','')}" for it in res.data])
                for msg in self.context.messages:
                    if msg["role"] == "system":
                        msg["content"] = f"{self.base_prompt}\n\nContext:\n{kb_text}"
                        break
                logger.info("✅ KB Context updated (Async)")
        except Exception as e:
            logger.error(f"⚠️ KB background update failed: {e}")

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info(f"🚀 Initializing Voice Worker: {room_url}")

    # API Keys & Trace
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")
    
    logger.info(f"🧪 [DEBUG] Cartesia Key present: {'✅' if cartesia_key else '❌'}")
    logger.info(f"🧪 [DEBUG] OpenAI Key present: {'✅' if openai_key else '❌'}")
    logger.info(f"🧪 [DEBUG] Cartesia Voice ID: {voice_id[:10]}..." if voice_id else "🧪 [DEBUG] Voice ID: ❌")

    if not all([cartesia_key, openai_key, voice_id]):
        logger.error("❌ Missing required API keys or Voice ID. Stalling.")
        return

    # KB Setup
    supabase = None
    openai_client = None
    if KB_AVAILABLE:
        try:
            supabase = create_client(os.getenv("VITE_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
            openai_client = AsyncOpenAI(api_key=openai_key)
            logger.info("✅ KB Service connected")
        except Exception as e:
            logger.warning(f"⚠️ KB Init failed: {e}")

    # Transport: LiveKit
    transport = LiveKitTransport(
        room_url, token, "Mitesh AI Coach",
        LiveKitParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer()
        )
    )

    # Services
    logger.info("🎤 Initializing services...")
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o")
    tts = CartesiaTTSService(api_key=cartesia_key, voice_id=voice_id)
    logger.info("✅ Services (STT/LLM/TTS) initialized")

    # Context & Aggregators
    base_prompt = "You are Mitesh Khatri, the world's no. 1 coach. Keep answers short and impactful."
    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # Monitoring & Triggers
    trace_input = PipelineTracer("Input")
    trace_post_stt = PipelineTracer("Post-STT")
    trace_post_agg = PipelineTracer("Post-Agg")
    trace_post_llm = PipelineTracer("Post-LLM")
    trace_post_tts = PipelineTracer("Post-TTS")

    # Pipeline: v2.2-ULTRA-DIAGNOSTIC
    pipeline = Pipeline([
        transport.input(),
        trace_input,
        stt,
        trace_post_stt,
        aggregators.user(),
        trace_post_agg,
        llm,
        trace_post_llm,
        tts,
        trace_post_tts,
        transport.output(),
        aggregators.assistant(),
    ])

    # Disable idle timeout
    task = PipelineTask(
        pipeline, 
        params=PipelineParams(
            allow_interruptions=True,
            idle_timeout=0 
        )
    )
    runner = PipelineRunner()
    
    # --- LiveKit Event Handlers ---

    @transport.event_handler("on_first_participant_joined")
    async def on_first_joined(transport, participant):
        # The logs showed participant is a string (id), not an object with .identity
        participant_id = getattr(participant, "identity", str(participant))
        logger.info(f"👋 [v2.2] User joined: {participant_id}. Stabilizing...")
        await asyncio.sleep(3.0) 
        logger.info("📤 Triggering Context Greeting...")
        try:
            # Force context update and LLM trigger
            context.add_message({
                "role": "system", 
                "content": "SAY IMMEDIATELY: 'Hello! I am Mitesh. I am finally connected. How are you today?'"
            })
            await task.queue_frame(LLMContextFrame(context))
            logger.info("✅ Context Greeting Queued.")
        except Exception as e:
            logger.error(f"❌ Greeting error: {e}")

    await runner.run(task)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))

