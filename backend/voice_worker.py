import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

# Ensure logs are flushed immediately
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

from pipecat.frames.frames import EndFrame, StartFrame, TextFrame, TranscriptionFrame
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
    """Searches Supabase KB and injects relevant context into LLM"""
    
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
        embedding_response = await self.openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        
        result = await asyncio.to_thread(
            lambda: self.supabase.rpc('match_knowledge', {
                'query_embedding': embedding_response.data[0].embedding,
                'match_threshold': 0.35,
                'match_count': 3,
                'p_profile_id': None  # Fixed: Always use NULL for global search
            }).execute()
        )
        
        return result
    
    async def process_frame(self, frame, direction):
        """Process frames - parent handles StartFrame validation"""
        
        # CRITICAL: Let parent FrameProcessor handle all internal Pipecat logic
        # This handles StartFrame, sets internal _started flag, and pushes frames
        await super().process_frame(frame, direction)
        
        # Now safely process TranscriptionFrame for KB search
        if isinstance(frame, TranscriptionFrame):
            text = frame.text.strip()
            
            if text and text != self.last_transcript and len(text) > 3:
                self.last_transcript = text
                logger.info(f"🎤 USER: '{text}'")
                
                if self.supabase and self.openai_client:
                    try:
                        result = await asyncio.wait_for(
                            self._search_kb(text),
                            timeout=5.0
                        )
                        
                        if result.data:
                            kb_text = "\n\n".join([
                                f"[{item.get('source_title', 'Source')}]: {item.get('content', '')}"
                                for item in result.data
                            ])
                            
                            enhanced_prompt = f"""{self.base_prompt}

RELEVANT KNOWLEDGE:
{kb_text}

RULES: Base answer on above knowledge. Keep SHORT (2-3 sentences) for voice."""
                            
                            for msg in self.llm_context.messages:
                                if msg["role"] == "system":
                                    msg["content"] = enhanced_prompt
                                    break
                            
                            logger.info(f"✅ KB INJECTED: {len(result.data)} chunks")
                        else:
                            logger.info("ℹ️ No KB matches")
                    
                    except asyncio.TimeoutError:
                        logger.warning("⏱️ KB search timed out")
                    except Exception as e:
                        logger.error(f"❌ KB error: {e}")

# --- MAIN ---

async def main(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info(f"🚀 Starting voice worker with KB for room: {room_url}")

    # Initialize API Keys
    cartesia_api_key = os.getenv("CARTESIA_API_KEY")
    openai_api_key = os.getenv("OPENAI_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")
    supabase_url = os.getenv("VITE_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not (cartesia_api_key and openai_api_key and voice_id):
        logger.error(f"❌ Missing keys - Cartesia: {'OK' if cartesia_api_key else 'MISSING'}, OpenAI: {'OK' if openai_api_key else 'MISSING'}, Voice: {'OK' if voice_id else 'MISSING'}")
        return

    # Initialize KB (Supabase + OpenAI)
    supabase = None
    openai_client = None
    
    if KB_AVAILABLE and supabase_url and supabase_key:
        try:
            supabase = create_client(supabase_url, supabase_key)
            openai_client = AsyncOpenAI(api_key=openai_api_key)
            logger.info("✅ Knowledge Base initialized successfully")
        except Exception as e:
            logger.error(f"❌ KB initialization failed: {e}")
    else:
        logger.warning("⚠️ KB disabled - missing Supabase credentials")

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

    # Base Persona
    base_prompt = """You are Mitesh Khatri, the world's no. 1 coach and Law of Attraction Expert.
    Identity: Transformational Leadership Coach & NLP Expert.
    Speaking Style: High-energy, powerful, authoritative yet warm and deeply human.
    Rules: 
    1. Keep responses CONCISE and short for voice (2-3 sentences max).
    2. Be warm, energetic, and encouraging.
    3. Ask follow-up questions to keep conversation flowing.
    4. Stay in character as Mitesh Khatri at all times."""
    
    # LLM Context
    messages = [{"role": "system", "content": base_prompt}]
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    # Create KB Processor
    kb_processor = None
    if supabase and openai_client:
        kb_processor = KnowledgeBaseProcessor(
            context, 
            openai_client, 
            user_id, 
            base_prompt, 
            supabase
        )
        logger.info("✅ KB Processor created")

    # Build Pipeline with KB
    processors = [
        transport.input(),
        stt,
    ]
    
    # Add KB processor if available
    if kb_processor:
        processors.append(kb_processor)
        logger.info("✅ KB Processor added to pipeline")
    
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
            await asyncio.sleep(1)
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

    # Heartbeat
    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(10)
                logger.info("💓 Worker alive with KB enabled" if kb_processor else "💓 Worker alive (no KB)")
        except asyncio.CancelledError:
            pass

    heartbeat_task = asyncio.create_task(heartbeat())

    # Run pipeline
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"❌ Pipeline error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        heartbeat_task.cancel()


if __name__ == "__main__":
    try:
        if len(sys.argv) < 3:
            logger.error("Usage: python voice_worker.py <room_url> <token> [user_id]")
            sys.exit(1)
            
        room_url = sys.argv[1]
        token = sys.argv[2]
        user_id = sys.argv[3] if len(sys.argv) > 3 else "anonymous"
        
        asyncio.run(main(room_url, token, user_id))
    except Exception as e:
        logger.error(f"💥 WORKER CRASHED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
