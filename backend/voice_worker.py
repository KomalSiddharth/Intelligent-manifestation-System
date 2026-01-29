
import asyncio
import os
import sys
import aiohttp
from loguru import logger
from dotenv import load_dotenv

from pipecat.frames.frames import EndFrame, StartFrame
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
from pipecat.frames.frames import TextFrame, TranscriptionFrame

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
logger.add(sys.stderr, level="INFO")

# --- Context & KB Helpers ---

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
    
    def update_system_prompt(self, new_prompt):
        self.messages[0]["content"] = new_prompt
    
    def get_messages(self):
        return self.messages

async def search_knowledge_base(user_id: str, query: str, openai_client, supabase_client) -> str:
    """Search Supabase knowledge base using RAG"""
    if not supabase_client: return ""
    try:
        logger.debug(f"🔍 Searching KB for: '{query[:50]}...'")
        embedding_response = openai_client.embeddings.create(model="text-embedding-3-small", input=query)
        result = supabase_client.rpc('match_knowledge_base', {
            'query_embedding': embedding_response.data[0].embedding,
            'match_threshold': 0.7, 'match_count': 3
        }).execute()
        if result.data:
            return "\n\n".join([f"**{item.get('title','')}**\n{item.get('content','')}" for item in result.data])
        return ""
    except Exception as e:
        logger.error(f"❌ KB search error: {e}")
        return ""

class KnowledgeBaseProcessor(FrameProcessor):
    """Processes transcriptions and injects knowledge base context"""
    def __init__(self, ctx_manager, openai_client, user_id, base_prompt, supabase_client):
        super().__init__()
        self.ctx_manager = ctx_manager
        self.openai_client = openai_client
        self.user_id = user_id
        self.base_prompt = base_prompt
        self.supabase = supabase_client
        self.last_transcript = ""
        self._started = False
    
    async def process_frame(self, frame, direction):
        if isinstance(frame, StartFrame):
            self._started = True
            await self.push_frame(frame, direction)
            return
        
        if isinstance(frame, (TextFrame, TranscriptionFrame)):
            text = getattr(frame, 'text', str(frame))
            if text and text != self.last_transcript and len(text.strip()) > 0:
                self.last_transcript = text
                logger.info(f"🎤 USER: '{text}'")
                if self.user_id and self._started and self.supabase:
                    # Blocking call to ensure context is ready
                    kb_context = await search_knowledge_base(self.user_id, text, self.openai_client, self.supabase)
                    if kb_context:
                        enhanced_prompt = f"{self.base_prompt}\n\nRELEVANT CONTEXT:\n{kb_context}"
                        self.ctx_manager.update_system_prompt(enhanced_prompt)
                        logger.info("✅ KB context injected")
        
        await self.push_frame(frame, direction)

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info(f"🚀 Starting voice worker for room: {room_url}")

    # Initialize Dependencies
    cartesia_api_key = os.getenv("CARTESIA_API_KEY")
    openai_api_key = os.getenv("OPENAI_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")
    supabase_url = os.getenv("VITE_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not (cartesia_api_key and openai_api_key and voice_id):
        logger.error("❌ Missing keys")
        return

    # Supabase Setup
    supabase = None
    openai_client = None
    if SUPABASE_AVAILABLE and supabase_url and supabase_key:
        supabase = create_client(supabase_url, supabase_key)
        openai_client = OpenAIClient(api_key=openai_api_key)

    # Transport
    transport = DailyTransport(
        room_url,
        token,
        "Mitesh AI Coach",
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

    # Context & Prompt
    base_prompt = "You are Mitesh Khatri, a Law of Attraction Coach. Be warm, energetic. Keep responses SHORT."
    ctx_mgr = ContextManager(base_prompt)
    
    # KB Processor
    kb_processor = None
    if supabase and openai_client:
        kb_processor = KnowledgeBaseProcessor(ctx_mgr, openai_client, user_id, base_prompt, supabase)

    messages = ctx_mgr.get_messages()
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    # Pipeline
    processors = [
        transport.input(),
        stt,
    ]
    if kb_processor:
        processors.append(kb_processor)
    
    processors.extend([
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
        context_aggregator.assistant()
    ])

    pipeline = Pipeline(processors)
    
    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
    
    runner = PipelineRunner()
    
    # Event Handlers
    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(transport, participant):
        logger.info(f"👋 User joined: {participant.get('id')}")
        transport.capture_participant_transcription(participant["id"])
        # Optional: Welcome message could be triggered here

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        logger.info(f"👋 User left: {participant.get('id')}")
        await task.cancel()

    await runner.run(task)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        logger.error("Usage: python voice_worker.py <room_url> <token> [user_id]")
        sys.exit(1)
        
    room_url = sys.argv[1]
    token = sys.argv[2]
    user_id = sys.argv[3] if len(sys.argv) > 3 else "anonymous"
    
    asyncio.run(main(room_url, token, user_id))