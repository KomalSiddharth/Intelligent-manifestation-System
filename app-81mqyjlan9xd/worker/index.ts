import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

// Set FFmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

// Load env from parent directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
    console.error("Missing credentials. Ensure .env has VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

console.log("🚀 Delphi Worker Started. Polling for jobs...");

async function processJob(job: any) {
    console.log(`\n📥 Processing Job ID: ${job.id} [Type: ${job.source_type}]`);
    const tempDir = path.resolve(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const inputPath = path.join(tempDir, `input_${job.id}${path.extname(new URL(job.source_url).pathname) || '.mp4'}`);
    const outputPath = path.join(tempDir, `output_${job.id}.mp3`);

    try {
        // 1. Download File
        console.log("   ⬇️ Downloading File:", job.source_url);
        const response = await axios({
            method: 'get',
            url: job.source_url,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(inputPath);
        response.data.pipe(writer);
        await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });
        console.log("   ✅ Download Complete.");

        // 2. Transcribe (Extract Audio first if video)
        let audioToTranscribe = inputPath;

        const isVideo = /\.(mp4|m4v|mov|avi|wmv|flv|webm)$/i.test(inputPath);
        if (isVideo) {
            console.log("   🎬 Video detected. Extracting audio...");
            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .toFormat('mp3')
                    .on('error', (err) => {
                        console.error('     ❌ FFmpeg Error:', err.message);
                        reject(err);
                    })
                    .on('end', () => {
                        console.log('     ✅ Audio Extraction Complete.');
                        resolve(true);
                    })
                    .save(outputPath);
            });
            audioToTranscribe = outputPath;
        }

        console.log("   🎧 Transcribing with Whisper...");
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioToTranscribe),
            model: "whisper-1",
            response_format: "text"
        });
        const contentText = transcription as unknown as string;
        console.log(`   ✅ Transcription Complete (${contentText.length} chars).`);

        // 3. Generate Embeddings & Chunks
        console.log("   🧠 Generating Embeddings...");
        // Simple chunking for now (1000 chars)
        const chunks = contentText.match(/.{1,1000}/gs) || [contentText];

        for (const contentChunk of chunks) {
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: contentChunk,
            });
            const embedding = embeddingResponse.data[0].embedding;

            await supabase.from('knowledge_chunks').insert({
                source_id: job.id,
                user_id: job.user_id,
                content: contentChunk,
                embedding
            });
        }

        // 4. Update Source
        await supabase.from('knowledge_sources').update({
            word_count: contentText.trim().split(/\s+/).length
        }).eq('id', job.id);

        console.log("   ✅ Job Completed Successfully.");

    } catch (error: any) {
        console.error("   ❌ Job Failed:", error.message);
    } finally {
        // Cleanup
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
}

async function startLoop() {
    while (true) {
        const { data: jobs, error } = await supabase
            .from('knowledge_sources')
            .select('*')
            .is('word_count', null) // word_count is used as a proxy for "not processed"
            .limit(1);

        if (jobs && jobs.length > 0) {
            await processJob(jobs[0]);
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

startLoop();
