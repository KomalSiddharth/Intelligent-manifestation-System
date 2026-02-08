import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

# ⭐ VERSION 32.0: THE FINAL STABILITY & PROBE
VERSION = "32.0-AUDIO-PROBE"

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logger.remove()
logger.add(sys.stderr, level="INFO", format="{time:HH:mm:ss} | {level} | {message}")

async def run_bot(room_url: str, token: str, user_id: str = "anonymous"):
    logger.info(f"🎯 Starting {VERSION}")

    from pipecat.frames.frames import TextFrame, EndFrame, LLMMessagesUpdateFrame, AudioRawFrame
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
    from pipecat.processors.frame_processor import FrameProcessor

    # ⭐ SENSOR: Proves if bot is actually generating ANY sound
    class AudioProbe(FrameProcessor):
        async def process_frame(self, frame, direction):
            if isinstance(frame, AudioRawFrame):
                if not hasattr(self, 'cnt'): self.cnt = 0
                self.cnt += 1
                if self.cnt % 100 == 0:
                    logger.info(f"🔊 [PROBE] BOT IS PRODUCING AUDIO: {len(frame.audio)} bytes")
            await self.push_frame(frame, direction)

    openai_key = os.getenv("OPENAI_API_KEY")
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    voice_id = os.getenv("CARTESIA_VOICE_ID")

    if not all([openai_key, cartesia_key, voice_id]):
        logger.error("❌ Missing Keys!")
        return

    transport = DailyTransport(
        room_url,
        token,
        "Mitesh AI Coach",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer()
        )
    )

    stt = OpenAISTTService(api_key=openai_key)
    llm = OpenAILLMService(api_key=openai_key, model="gpt-4o-mini")
    # ⭐ Model set to multilingual for Hinglish support
    tts = CartesiaTTSService(
        api_key=cartesia_key, 
        voice_id=voice_id,
        model_id="sonic-multilingual" 
    )

    # MODERN Context setup
    context = LLMContext([{"role": "system", "content": "You are Mitesh Khatri, a life coach. Speak in short Hinglish sentences."}])
    aggregators = LLMContextAggregatorPair(context)

    pipeline = Pipeline([
        transport.input(),
        stt,
        aggregators.user(),
        llm,
        tts,
        AudioProbe(), # Sensor placed before output
        transport.output(),
        aggregators.assistant(),
    ])

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))

    @transport.event_handler("on_participant_joined")
    async def on_participant_joined(transport, participant):
        if participant.get("info", {}).get("userName") == "Mitesh AI Coach":
            return
            
        logger.info(f"👋 User {participant['id']} joined. Wait 5s for Greeting...")
        await asyncio.sleep(5)
        
        # ⭐ Trigger Greeting (Modern Pattern)
        logger.info("📤 Triggering Greeting...")
        await task.queue_frames([
            LLMMessagesUpdateFrame(messages=[
                {"role": "user", "content": "Hi Mitesh, I am here. Say hello."}
            ], run_llm=True)
        ])

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        await task.queue_frame(EndFrame())

    runner = PipelineRunner()
    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"💥 Pipeline Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(1)
    asyncio.run(run_bot(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "test-user"))
