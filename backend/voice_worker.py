
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
    from openai import AsyncOpenAI as OpenAIClient  # ✅ Use Async client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    logger.warning("⚠️ Supabase or OpenAI not installed - knowledge base disabled")


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
    """Search Supabase knowledge base using RAG (Synced with Chat Engine)"""
    if not supabase_client: return ""
    try:
        logger.debug(f"🔍 Searching KB for: '{query[:50]}...'")
        
        # ✅ Async embedding call
        embedding_response = await openai_client.embeddings.create(model="text-embedding-3-small", input=query)
        
        # ✅ Run blocking Supabase call in a separate thread to prevent loop blocking
        def run_rpc():
            return supabase_client.rpc('match_knowledge', {
                'query_embedding': embedding_response.data[0].embedding,
                'match_threshold': 0.35, # Synced threshold
                'match_count': 5,
                'p_profile_id': None
            }).execute()
        
        result = await asyncio.to_thread(run_rpc)
        
        if result.data:
            logger.info(f"🧩 Found {len(result.data)} knowledge chunks")
            return "\n\n".join([f"[Source: {item.get('source_title','Unknown')}]\n{item.get('content','')}" for item in result.data])
        return ""
    except Exception as e:
        logger.error(f"❌ KB search error: {e}")
        return ""


class KnowledgeBaseProcessor(FrameProcessor):
    """Processes transcriptions and injects knowledge base context into Pipecat context"""
    def __init__(self, context, openai_client, user_id, base_prompt, supabase_client):
        super().__init__()
        self.context = context
        self.openai_client = openai_client
        self.user_id = user_id
        self.base_prompt = base_prompt
        self.supabase = supabase_client
        self.last_transcript = ""
    
    async def process_frame(self, frame, direction):
        await self.push_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            text = frame.text.strip()
            if text and text != self.last_transcript:
                self.last_transcript = text
                logger.info(f"🎤 USER: '{text}'")
                
                if self.supabase and self.openai_client:
                    # Async KB search
                    kb_context = await search_knowledge_base(self.user_id, text, self.openai_client, self.supabase)
                    if kb_context:
                        # Inject directly into pipeline context
                        enhanced_prompt = f"{self.base_prompt}\n\nMANDATORY KNOWLEDGE CONTEXT:\n{kb_context}\n\nRule: Use ONLY the above context to answer. If not found, stay in character but keep it short."
                        
                        # Find system message and update
                        for msg in self.context.messages:
                            if msg["role"] == "system":
                                msg["content"] = enhanced_prompt
                                break
                        
                        logger.info("✅ KB context injected into LLM context")


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
        openai_client = OpenAIClient(api_key=openai_api_key) # Now an Async client


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

    # Context & Persona (Synced with Chat Engine)
    base_prompt = """You are Mitesh Khatri, the world's no. 1 coach and Law of Attraction Expert.
    Identity: Transformational Leadership Coach & NLP Expert.
    Speaking Style: High-energy, powerful, authoritative yet warm and deeply human.
    Rules: 
    1. Base 80% of your advice on the provided knowledge. 
    2. Keep responses CONCISE and short for voice.
    3. Use Friendly emojis naturally in spirit.
    4. Start with 'How are you feeling?' if appropriate.
    5. Never hallucinate links or facts."""
    
    # Context
    messages = [{"role": "system", "content": base_prompt}]
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    # KB Processor
    kb_processor = None
    if supabase and openai_client:
        kb_processor = KnowledgeBaseProcessor(context, openai_client, user_id, base_prompt, supabase)

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
        participant_id = participant.get('id')
        logger.info(f"👋 User joined: {participant_id}")
        
        # Start capturing transcription
        try:
            await transport.capture_participant_transcription(participant_id)
            logger.info(f"✅ Started transcription capture for {participant_id}")
        except Exception as e:
            logger.error(f"❌ Transcription capture failed: {e}")

        # Send initial greeting
        try:
            await asyncio.sleep(1) # ✅ Connection stability delay
            greeting = TextFrame("Hello! I'm Mitesh, your AI coach. How can I help you today?")
            await task.queue_frame(greeting)
            logger.info("👋 Queued greeting message")
        except Exception as e:
            logger.error(f"❌ Failed to queue greeting: {e}")

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        logger.info(f"👋 User left: {participant.get('id')}")
        await task.cancel()

    @transport.event_handler("on_app_message")
    async def on_app_message(transport, message, sender):
        logger.info(f"📨 App message from {sender}: {message}")

    await runner.run(task)




if __name__ == "__main__":
    if len(sys.argv) < 3:
        logger.error("Usage: python voice_worker.py <room_url> <token> [user_id]")
        sys.exit(1)
        
    room_url = sys.argv[1]
    token = sys.argv[2]
    user_id = sys.argv[3] if len(sys.argv) > 3 else "anonymous"
    
    asyncio.run(main(room_url, token, user_id))