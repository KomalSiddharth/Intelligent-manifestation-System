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
    EndFrame, StartFrame, TextFrame, TranscriptionFrame, Frame
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
        """Helper method for KB search"""
        try:
            embedding_response = await self.openai.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            
            result = await asyncio.to_thread(
                lambda: self.supabase.rpc('match_knowledge', {
                    'query_embedding': embedding_response.data[0].embedding,
                    'match_threshold': 0.35,
                    'match_count': 3,
                    'p_profile_id': None 
                }).execute()
            )
            return result
        except Exception as e:
            logger.error(f"❌ KB helper error: {e}")
            return None

    async def process_frame(self, frame: Frame, direction):
        """Standard Pipecat frame processing pattern"""
        # CRITICAL: Call parent FIRST to ensure StartFrame sets internal state
        await super().process_frame(frame, direction)
        
        if isinstance(frame, TranscriptionFrame):
            text = frame.text.strip()
            if text and text != self.last_transcript and len(text) > 3:
                self.last_transcript = text
                logger.info(f"🎤 USER: '{text}'")
                
                if self.supabase and self.openai:
                    try:
                        res = await asyncio.wait_for(self._search_kb(text), timeout=4.0)
                        if res and res.data:
                            kb_text = "\n".join([f"- {it.get('content','')}" for it in res.data])
                            for msg in self.context.messages:
                                if msg["role"] == "system":
                                    msg["content"] = f"{self.base_prompt}\n\nContext:\n{kb_text}"
                                    break
                            logger.info("✅ KB Context injected")
                    except Exception as e:
                        logger.error(f"⚠️ KB search skipped: {e}")

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info(f"🚀 Initializing Voice Worker: {room_url}")

    # API Keys
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")
    
    if not all([cartesia_key, openai_key, voice_id]):
        logger.error("❌ Missing required API keys or Voice ID")
        return

    # KB Setup
    supabase = None
    openai_client = None
    if KB_AVAILABLE:
        try:
            supabase = create_client(os.getenv("VITE_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
            openai_client = AsyncOpenAI(api_key=openai_key)
            logger.info("✅ KB Service connected")
        except: pass

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
    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o")
    tts = CartesiaTTSService(api_key=cartesia_key, voice_id=voice_id)

    # Context & Aggregators
    base_prompt = "You are Mitesh Khatri, the world's no. 1 coach. Keep answers short."
    context = LLMContext([{"role": "system", "content": base_prompt}])
    aggregators = LLMContextAggregatorPair(context)

    # KB Processor
    kb_processor = KnowledgeBaseProcessor(context, openai_client, user_id, base_prompt, supabase)

    # Pipeline: Parallel branches for Voice (TTS) and Memory (Aggregator)
    # The final transport.output() acts as a universal sink for all branches.
    pipeline = Pipeline([
        transport.input(),
        stt,
        kb_processor,
        aggregators.user(),
        llm,
        ParallelPipeline([
            tts,
            aggregators.assistant()
        ]),
        transport.output()
    ])

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
    runner = PipelineRunner()
    
    @transport.event_handler("on_participant_connected")
    async def on_connect(transport, participant):
        await asyncio.sleep(1.2)
        logger.info(f"👋 User connected ({participant.identity}). Sending greeting...")
        try:
            await task.queue_frame(TextFrame("Hello! I'm Mitesh. How can I help you today?"))
        except Exception as e:
            logger.error(f"❌ Greeting failed: {e}")

    await runner.run(task)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))

