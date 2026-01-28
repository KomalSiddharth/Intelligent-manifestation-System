import asyncio
import os
import sys
import time
from aiohttp import ClientSession
from dotenv import load_dotenv
from loguru import logger

from pipecat.frames.frames import EndFrame, StartFrame, TextFrame, TranscriptionFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.services.openai import OpenAILLMService
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.services.cartesia import CartesiaTTSService, CartesiaSTTService
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.transports.services.daily import DailyTransport, DailyParams

# Knowledge base integration (optional)
try:
    from supabase import create_client, Client
    from openai import OpenAI as OpenAIClient
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    logger.warning("⚠️ Supabase not installed - knowledge base disabled")

# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
logger.remove(0)
logger.add(sys.stderr, level="INFO")  # Change to DEBUG for more logs

# Configuration
IDLE_TIMEOUT_SECONDS = 300

# Initialize Supabase (if available)
if SUPABASE_AVAILABLE:
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if SUPABASE_URL and SUPABASE_KEY:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("✅ Supabase connected for knowledge base")
    else:
        supabase = None
        logger.warning("⚠️ Supabase credentials missing - knowledge base disabled")
else:
    supabase = None

class ContextManager:
    """Manages conversation context with sliding window"""
    MAX_MESSAGES = 20
    
    def __init__(self, system_prompt):
        self.messages = [{"role": "system", "content": system_prompt}]
        self.base_prompt = system_prompt
    
    def add_message(self, role, content):
        self.messages.append({"role": role, "content": content})
        self.trim_if_needed()
    
    def trim_if_needed(self):
        if len(self.messages) > self.MAX_MESSAGES:
            self.messages = [self.messages[0]] + self.messages[-19:]
            logger.debug(f"📝 Context trimmed to {len(self.messages)}")
    
    def update_system_prompt(self, new_prompt):
        """Update system prompt with knowledge base context"""
        self.messages[0]["content"] = new_prompt
    
    def get_messages(self):
        return self.messages

async def search_knowledge_base(user_id: str, query: str, openai_client) -> str:
    """Search Supabase knowledge base using RAG"""
    if not supabase:
        return ""
    
    try:
        logger.debug(f"🔍 Searching KB for: '{query[:50]}...'")
        
        # Generate embedding
        embedding_response = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=query
        )
        query_embedding = embedding_response.data[0].embedding
        
        # Search vector store
        result = supabase.rpc('match_knowledge_base', {
            'query_embedding': query_embedding,
            'match_threshold': 0.7,
            'match_count': 3
        }).execute()
        
        # Format context
        if result.data and len(result.data) > 0:
            context = "\n\n".join([
                f"**{item.get('title', 'Reference')}**\n{item.get('content', '')}"
                for item in result.data
            ])
            logger.info(f"✅ Found {len(result.data)} KB matches")
            return context
        
        logger.debug("⚠️ No KB matches")
        return ""
        
    except Exception as e:
        logger.error(f"❌ KB search error: {e}")
        return ""

class KnowledgeBaseProcessor(FrameProcessor):
    """Processes transcriptions and injects knowledge base context"""
    
    def __init__(self, ctx_manager, openai_client, user_id, base_prompt):
        super().__init__()
        self.ctx_manager = ctx_manager
        self.openai_client = openai_client
        self.user_id = user_id
        self.base_prompt = base_prompt
        self.last_transcript = ""
        self._started = False
    
    async def process_frame(self, frame, direction):
        # Handle StartFrame
        if isinstance(frame, StartFrame):
            self._started = True
            logger.debug("✅ KB Processor started")
            await self.push_frame(frame, direction)
            return
        
        # Process transcriptions
        if isinstance(frame, (TextFrame, TranscriptionFrame)):
            text = getattr(frame, 'text', str(frame))
            
            if text and text != self.last_transcript and len(text.strip()) > 0:
                self.last_transcript = text
                logger.info(f"🎤 USER: '{text}'")
                
                # Search knowledge base in background (non-blocking)
                if self.user_id and self._started and supabase:
                    asyncio.create_task(self._enhance_context(text))
        
        # Always push frame forward
        await self.push_frame(frame, direction)
    
    async def _enhance_context(self, query):
        """Background task: search KB and update context"""
        try:
            kb_context = await search_knowledge_base(
                self.user_id,
                query,
                self.openai_client
            )
            
            if kb_context:
                enhanced_prompt = f"""{self.base_prompt}

RELEVANT CONTEXT FROM KNOWLEDGE BASE:
{kb_context}

Use this context to provide accurate, personalized answers."""
                
                self.ctx_manager.update_system_prompt(enhanced_prompt)
                logger.info("✅ KB context injected")
            
        except Exception as e:
            logger.error(f"KB enhancement failed: {e}")

async def main(room_url: str, token: str, user_id: str = None):
    """Main voice pipeline function"""
    
    base_prompt = """You are Mitesh Khatri, a Law of Attraction Coach.

Be warm, energetic, and empowering.
Keep responses VERY SHORT (1-2 sentences maximum).
Speak naturally and conversationally.
Be encouraging and supportive."""
    
    ctx_mgr = ContextManager(base_prompt)
    
    try:
        async with ClientSession() as session:
            # Validate API keys
            cartesia_api_key = os.getenv("CARTESIA_API_KEY")
            openai_api_key = os.getenv("OPENAI_API_KEY")
            voice_id = os.getenv("CARTESIA_VOICE_ID")

            if not cartesia_api_key or not openai_api_key or not voice_id:
                logger.error("❌ Missing required API keys!")
                logger.error(f"Cartesia: {bool(cartesia_api_key)}")
                logger.error(f"OpenAI: {bool(openai_api_key)}")
                logger.error(f"Voice ID: {bool(voice_id)}")
                return

            logger.info(f"✅ Initializing voice pipeline for user: {user_id or 'anonymous'}")

            # OpenAI client for embeddings (if KB enabled)
            openai_client = None
            if SUPABASE_AVAILABLE:
                from openai import OpenAI as OpenAIClient
                openai_client = OpenAIClient(api_key=openai_api_key)

            # Transport
            transport = DailyTransport(
                room_url,
                token,
                "Mitesh AI Coach",
                DailyParams(
                    audio_out_enabled=True,
                    audio_in_enabled=True,
                    vad_analyzer=SileroVADAnalyzer()
                )
            )

            # Services
            logger.info("🎙️ Initializing Cartesia STT...")
            stt = CartesiaSTTService(
                api_key=cartesia_api_key,
                model="sonic-english"
            )
            
            logger.info("🧠 Initializing OpenAI LLM...")
            llm = OpenAILLMService(
                api_key=openai_api_key,
                model="gpt-4o"
            )
            
            logger.info("🔊 Initializing Cartesia TTS...")
            tts = CartesiaTTSService(
                api_key=cartesia_api_key,
                voice_id=voice_id
            )

            # Knowledge base processor (if enabled)
            kb_processor = None
            if openai_client and supabase:
                kb_processor = KnowledgeBaseProcessor(
                    ctx_mgr,
                    openai_client,
                    user_id,
                    base_prompt
                )
                logger.info("✅ Knowledge base processor enabled")

            # Context
            messages = ctx_mgr.get_messages()
            context = OpenAILLMContext(messages)
            context_aggregator = llm.create_context_aggregator(context)

            # Pipeline (with or without KB)
            if kb_processor:
                pipeline = Pipeline([
                    transport.input(),
                    stt,
                    kb_processor,  # Injects KB context
                    context_aggregator.user(),
                    llm,
                    tts,
                    transport.output(),
                    context_aggregator.assistant(),
                ])
            else:
                pipeline = Pipeline([
                    transport.input(),
                    stt,
                    context_aggregator.user(),
                    llm,
                    tts,
                    transport.output(),
                    context_aggregator.assistant(),
                ])

            # Task
            task = PipelineTask(
                pipeline,
                params=PipelineParams(
                    allow_interruptions=True,
                    enable_metrics=True
                )
            )

            last_activity = time.time()

            @transport.event_handler("on_participant_joined")
            async def on_participant_joined(transport, participant):
                nonlocal last_activity
                last_activity = time.time()
                logger.info(f"👤 User joined: {participant['id']}")
                # No auto-greeting - user can speak immediately

            @transport.event_handler("on_participant_left")
            async def on_participant_left(transport, participant, reason):
                logger.info(f"👋 User left: {reason}")
                await task.queue_frame(EndFrame())

            # Timeout monitor
            async def timeout_monitor():
                while True:
                    await asyncio.sleep(30)
                    idle = time.time() - last_activity
                    if idle > IDLE_TIMEOUT_SECONDS:
                        logger.warning(f"⏰ Session timeout ({idle:.0f}s)")
                        await task.queue_frame(EndFrame())
                        break

            asyncio.create_task(timeout_monitor())

            logger.info("🚀 Pipeline started - ready for voice!")
            runner = PipelineRunner()
            await runner.run(task)
            
            logger.info("✅ Pipeline completed successfully")

    except Exception as e:
        logger.critical(f"💀 Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("❌ Usage: python voice_worker.py <room_url> <token> [user_id]")
        sys.exit(1)
    
    room_url_arg = sys.argv[1]
    token_arg = sys.argv[2]
    user_id_arg = sys.argv[3] if len(sys.argv) > 3 else None
    
    logger.info("=" * 60)
    logger.info("🎤 Voice Worker Starting...")
    logger.info(f"📍 Room: {room_url_arg[:50]}...")
    logger.info(f"👤 User: {user_id_arg or 'anonymous'}")
    logger.info("=" * 60)
    
    try:
        asyncio.run(main(room_url_arg, token_arg, user_id_arg))
    except KeyboardInterrupt:
        logger.info("🛑 Stopped by user")
    except Exception as e:
        logger.critical(f"💀 Startup error: {e}")
        sys.exit(1)