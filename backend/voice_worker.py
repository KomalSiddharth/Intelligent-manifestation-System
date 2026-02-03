import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

# Ensure logs are flushed immediately
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

from pipecat.frames.frames import EndFrame, StartFrame, TextFrame, TranscriptionFrame, Frame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.cartesia.stt import CartesiaSTTService
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.transports.services.daily import DailyTransport, DailyParams
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
    def __init__(self, llm_context, openai_client, user_id, base_prompt, supabase_client):
        super().__init__()
        self.llm_context = llm_context
        self.openai_client = openai_client
        self.user_id = user_id
        self.base_prompt = base_prompt
        self.supabase = supabase_client
        self.last_transcript = ""

    async def _search_kb(self, text):
        """Helper method for KB search with proper async handling"""
        try:
            embedding_response = await self.openai_client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            
            result = await asyncio.to_thread(
                lambda: self.supabase.rpc('match_knowledge', {
                    'query_embedding': embedding_response.data[0].embedding,
                    'match_threshold': 0.35,
                    'match_count': 3,
                    'p_profile_id': None # CRITICAL: Fixed type mismatch
                }).execute()
            )
            return result
        except Exception as e:
            logger.error(f"❌ KB helper error: {e}")
            return None

    async def process_frame(self, frame: Frame, direction):
        """Standard Pipecat frame processing pattern"""
        
        # 1. Handle Transcriptions specifically
        if isinstance(frame, TranscriptionFrame):
            text = frame.text.strip()
            if text and text != self.last_transcript and len(text) > 3:
                self.last_transcript = text
                logger.info(f"🎤 USER: '{text}'")
                
                if self.supabase and self.openai_client:
                    try:
                        # Search KB before pushing frame to LLM
                        res = await asyncio.wait_for(self._search_kb(text), timeout=4.0)
                        if res and res.data:
                            kb_text = "\n\n".join([
                                f"[{item.get('source_title', 'Source')}]: {item.get('content', '')}"
                                for item in res.data
                            ])
                            
                            enhanced_prompt = f"{self.base_prompt}\n\nRELEVANT KNOWLEDGE:\n{kb_text}\n\nRULES: Use ONLY this knowledge. Short answers."
                            
                            for msg in self.llm_context.messages:
                                if msg["role"] == "system":
                                    msg["content"] = enhanced_prompt
                                    break
                            logger.info(f"✅ KB context injected ({len(res.data)} chunks)")
                    except Exception as e:
                        logger.error(f"⚠️ KB search skipped: {e}")
            
            # Now push the transcription frame forward to trigger LLM
            await self.push_frame(frame, direction)
            
        else:
            # 2. For ALL other frames (StartFrame, TextFrame, Audio), pass to parent
            # This handles Pipecat's internal _started state correctly
            await super().process_frame(frame, direction)

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info(f"🚀 Initializing Voice Worker: {room_url}")

    # API Keys
    cartesia_api_key = os.getenv("CARTESIA_API_KEY")
    openai_api_key = os.getenv("OPENAI_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")
    supabase_url = os.getenv("VITE_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not (cartesia_api_key and openai_api_key and voice_id):
        logger.error("❌ Missing required API keys or Voice ID")
        return

    # KB Setup
    supabase = None
    openai_client = None
    if KB_AVAILABLE and supabase_url and supabase_key:
        try:
            supabase = create_client(supabase_url, supabase_key)
            openai_client = AsyncOpenAI(api_key=openai_api_key)
            logger.info("✅ KB Service connected")
        except Exception as e:
            logger.error(f"❌ KB setup failed: {e}")

    # Transport
    transport = DailyTransport(
        room_url, token, "Mitesh AI Coach",
        DailyParams(
            audio_out_enabled=True,
            vad_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
            vad_audio_passthrough=True
        )
    )

    # Services
    stt = CartesiaSTTService(api_key=cartesia_api_key, model="sonic-english")
    llm = OpenAILLMService(api_key=openai_api_key, model="gpt-4o")
    tts = CartesiaTTSService(api_key=cartesia_api_key, voice_id=voice_id)

    # Persona
    base_prompt = """You are Mitesh Khatri, the world's no. 1 coach. 
    Style: High-energy, warm, authoritative.
    Rules: Keep responses short (2-3 sentences max). Base answers on knowledge provided."""
    
    messages = [{"role": "system", "content": base_prompt}]
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    # KB Processor
    kb_processor = KnowledgeBaseProcessor(context, openai_client, user_id, base_prompt, supabase)

    # Pipeline
    pipeline = Pipeline([
        transport.input(),
        stt,
        kb_processor,
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
        context_aggregator.assistant()
    ])

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
    runner = PipelineRunner()
    
    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(transport, participant):
        logger.info(f"👋 User joined. Preparing greeting...")
        # NOTE: Reduced delay and avoided redundant Daily transcription capture
        await asyncio.sleep(0.5)
        try:
            # We push the greeting AFTER the start of the pipeline
            await task.queue_frame(TextFrame("Hello! I'm Mitesh. How can I help you today?"))
            logger.info("👋 Greeting sent to pipeline")
        except Exception as e:
            logger.error(f"❌ Greeting failed: {e}")

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        logger.info(f"👋 User left. Session closing.")
        await task.cancel()

    async def heartbeat():
        while True:
            await asyncio.sleep(15)
            logger.info("💓 Service is healthy")

    asyncio.create_task(heartbeat())
    await runner.run(task)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "anonymous"))