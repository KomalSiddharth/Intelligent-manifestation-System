import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Access-Control-Max-Age": "86400",
};

const CONFIG = {
    MAX_VIDEO_DURATION_SECONDS: 7200,
    WHISPER_MAX_FILE_SIZE_MB: 25,
    MAX_MEDIA_FILE_SIZE_MB: 1000, // Increased for large videos (1GB)
    CHUNK_SIZE: 1500,
    CHUNK_OVERLAP: 200,
    BATCH_SIZE: 10,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
};

console.log("🚀 [INGEST] Version: 100% WHISPER-POWERED (STABLE)");

const transcribeWithWhisper = async (blob: Blob, fileName: string, openai: OpenAI): Promise<string> => {
    const sizeMB = blob.size / (1024 * 1024);

    if (sizeMB > CONFIG.WHISPER_MAX_FILE_SIZE_MB) {
        throw new Error(`File is ${sizeMB.toFixed(1)}MB. OpenAI Whisper has a 25MB limit.`);
    }

    const file = new File([blob], fileName, { type: blob.type || 'audio/mpeg' });
    const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "en"
    });

    return transcription.text || "";
};

/**
 * Utility: AssemblyAI Transcription (For Large Files)
 * Now uses signed URLs to avoid loading massive files into Edge Function memory.
 */
const transcribeWithAssemblyAI = async (audioUrl: string, fileName: string): Promise<string> => {
    const API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
    if (!API_KEY) {
        console.error("❌ [ASSEMBLYAI] API Key is MISSING in environment!");
        throw new Error("ASSEMBLYAI_API_KEY not configured");
    }
    console.log(`🔑 [ASSEMBLYAI] Key detected: ${API_KEY.slice(0, 4)}...${API_KEY.slice(-4)}`);

    console.log(`🎤 [ASSEMBLYAI] Triggering transcription for ${fileName} via URL...`);

    // 2. Start Transcription (Using the provided signed URL)
    const transcriptRes = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: {
            "authorization": API_KEY,
            "content-type": "application/json"
        },
        body: JSON.stringify({ audio_url: audioUrl, language_code: "en" })
    });

    if (!transcriptRes.ok) {
        const errText = await transcriptRes.text();
        console.error(`❌ [ASSEMBLYAI] Submission failed: ${transcriptRes.status} - ${errText}`);
        throw new Error(`AssemblyAI submission failed: ${transcriptRes.status}`);
    }

    const { id } = await transcriptRes.json();
    if (!id) throw new Error("AssemblyAI transcription start failed - no ID returned");
    console.log(`✅ [ASSEMBLYAI] Transcription ID created: ${id}`);

    // 3. Polling for results
    console.log(`⏳ [ASSEMBLYAI] Polling for transcript ${id}...`);
    let startTime = Date.now();

    while (true) {
        // Break if taking too long for Edge Function (approx 45s safety limit)
        if (Date.now() - startTime > 120000) {
            console.error(`❌ [ASSEMBLYAI] Polling timed out after 120s`);
            throw new Error("AssemblyAI transcription timed out");
        }

        const pollingRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
            headers: { "authorization": API_KEY }
        });

        if (!pollingRes.ok) {
            console.error(`❌ [ASSEMBLYAI] Polling failed: ${pollingRes.status}`);
            throw new Error(`AssemblyAI polling failed: ${pollingRes.status}`);
        }

        const result = await pollingRes.json();
        console.log(`⏱️ [ASSEMBLYAI] Status: ${result.status}`);

        if (result.status === "completed") {
            console.log(`✨ [ASSEMBLYAI] Successfully transcribed ${result.text.length} characters`);
            return result.text;
        }
        if (result.status === "error") {
            console.error(`❌ [ASSEMBLYAI] Error detail: ${result.error}`);
            throw new Error(`AssemblyAI Error: ${result.error}`);
        }

        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
    }
};

/**
 * Utility: Retry with exponential backoff
 */
const retryWithBackoff = async <T>(fn: () => Promise<T>, retries = CONFIG.MAX_RETRIES, context = "operation"): Promise<T> => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            const isLastRetry = i === retries - 1;
            console.warn(`⚠️ [RETRY] ${context} attempt ${i + 1} failed: ${error.message}`);

            if (error?.status === 429 || error?.code === 'rate_limit_exceeded') {
                const delay = CONFIG.RETRY_DELAY_MS * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.message?.includes('fetch failed')) {
                if (!isLastRetry) {
                    const delay = CONFIG.RETRY_DELAY_MS * (i + 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            if (isLastRetry) throw error;
        }
    }
    throw new Error(`Retry exhausted: ${context}`);
};

/**
 * Utility: Fetch with timeout and retry
 */
const fetchWithRetry = async (url: string, options?: RequestInit, timeoutMs = 60000) => {
    return retryWithBackoff(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }, CONFIG.MAX_RETRIES, `fetch ${url}`);
};

/**
 * Utility: Run Apify Actor
 */
const runApifyActor = async (actorId: string, input: any) => {
    const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured");

    console.log(`🚀 [APIFY] Running: ${actorId}`);

    return retryWithBackoff(async () => {
        const response = await fetch(
            `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            }
        );
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Apify failed: ${response.status} - ${errText}`);
        }
        return await response.json();
    }, CONFIG.MAX_RETRIES, `Apify ${actorId}`);
};

/**
 * Processor: Firecrawl for Websites
 */
const processWebsite = async (url: string, openai: OpenAI) => {
    const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_KEY) {
        // Fallback to basic scraper or error
        console.warn("⚠️ FIRECRAWL_API_KEY not found, skipping deep extraction");
        throw new Error("Firecrawl API key not configured for website ingestion");
    }

    console.log(`🌐 [FIRECRAWL] Scraping: ${url}`);
    const response = await fetchWithRetry("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${FIRECRAWL_KEY}`
        },
        body: JSON.stringify({
            url,
            formats: ["markdown"],
            onlyMainContent: true
        })
    });

    if (!response.ok) throw new Error(`Firecrawl failed: ${response.status}`);
    const data = await response.json();

    if (!data.success || !data.data?.markdown) {
        throw new Error("Firecrawl was unable to extract content from this page");
    }

    let extractedText = data.data.markdown;
    const title = data.data.metadata?.title || url;

    // 1. Robust Login Wall Detection (Kajabi, Teachable, etc.)
    const loginKeywords = [/sign in/i, /log in/i, /login/i, /sign up/i, /need to sign in/i, /access denied/i, /protected/i, /email/i, /password/i, /forgot password/i, /remember me/i];
    const matchCount = loginKeywords.filter(kw => extractedText.match(kw)).length;

    // If it has multiple login elements, it's a login wall regardless of length
    const isLoginWall = matchCount >= 3 || (matchCount >= 2 && extractedText.length < 5000);

    if (isLoginWall) {
        console.warn("⚠️ [WEBSITE] Detected possible login wall/gated content.");
    }

    // 2. Smart Media Detection (Scan for YouTube/Vimeo/Wistia)
    const ytMatch = extractedText.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|live\/)|youtu\.be\/)([^"&?\/\s]{11})/);
    const vimeoMatch = extractedText.match(/vimeo\.com\/(?:video\/)?([0-9]+)/);
    const wistiaMatch = extractedText.match(/(?:wistia\.com|wi\.st)\/(?:medias|embed)\/([a-zA-Z0-9]+)/);

    let mediaFound = false;

    if (ytMatch) {
        mediaFound = true;
        console.log(`🎯 [WEBSITE] Found embedded YouTube video: ${ytMatch[1]}`);
        try {
            const yt = await processYoutube(ytMatch[1], `https://www.youtube.com/watch?v=${ytMatch[1]}`, openai);
            if (yt.text) {
                if (isLoginWall || extractedText.length < 1000) {
                    extractedText = `[Embedded Video Transcript]:\n\n${yt.text}\n\n---\n[Original Page Content (Gated)]:\n${extractedText.slice(0, 500)}...`;
                } else {
                    extractedText += `\n\n--- [Attached Video Transcript] ---\n\n${yt.text}`;
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ [WEBSITE] Embedded YouTube extraction failed: ${e.message}`);
        }
    } else if (vimeoMatch || wistiaMatch) {
        mediaFound = true;
        const service = vimeoMatch ? "Vimeo" : "Wistia";
        console.log(`🎯 [WEBSITE] Found ${service} video, but direct transcription is gated.`);
        if (isLoginWall) {
            throw new Error(`This page is a gated ${service} video. Scrapers cannot access private coaching videos. Please download the video and upload the file, or provide a public link.`);
        }
    }

    if (isLoginWall && !mediaFound) {
        throw new Error("This page is protected by a login wall (e.g., Kajabi Portal). Scrapers cannot see your private courses. Solution: Copy the text manually OR upload the video file directly to the 'Files' section.");
    }

    return {
        text: extractedText,
        title: title,
        metadata: data.data.metadata
    };
};

/**
 * Processor: Twitter/X (with Video Transcription)
 */
const processTwitter = async (url: string, openai: OpenAI) => {
    console.log(`🐦 [TWITTER] Processing: ${url}`);
    const data = await runApifyActor('apify/twitter-scraper', {
        startUrls: [{ url }],
        maxItems: 1,
        includeUser: true
    });

    if (!data || data.length === 0) throw new Error("No data found for this Twitter URL");

    const tweet = data[0];
    let text = tweet.full_text || tweet.text || "";
    const author = tweet.user?.screen_name || tweet.user?.name || "Twitter User";

    // Check for video
    const videoUrl = tweet.extended_entities?.media?.find((m: any) => m.type === 'video' || m.type === 'animated_gif')
        ?.video_info?.variants?.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0]?.url;

    if (videoUrl) {
        console.log(`🎯 [TWITTER] Video found, transcribing...`);
        try {
            const res = await fetchWithRetry(videoUrl, {}, 60000);
            if (res.ok) {
                const blob = await res.blob();
                if (blob.size / (1024 * 1024) <= CONFIG.WHISPER_MAX_FILE_SIZE_MB) {
                    const file = new File([blob], `twitter_video.mp4`, { type: 'video/mp4' });
                    const transcription = await openai.audio.transcriptions.create({ file, model: "whisper-1", language: "en" });
                    if (transcription.text) {
                        text += `\n\n[Video Transcript]:\n${transcription.text}`;
                    }
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ [TWITTER] Video transcription failed: ${e.message}`);
        }
    }

    return {
        text: `Tweet by @${author}:\n\n${text}`,
        title: `Tweet from ${author}`,
        metadata: tweet
    };
};

/**
 * Processor: Instagram (with Video Transcription)
 */
const processInstagram = async (url: string, openai: OpenAI) => {
    console.log(`📸 [INSTAGRAM] Processing: ${url}`);
    const instaData = await runApifyActor('apify/instagram-scraper', {
        directUrls: [url],
        resultsType: 'posts',
        resultsLimit: 1
    });

    if (!instaData || instaData.length === 0) throw new Error("No data found for this Instagram URL");

    const post = instaData[0];
    let text = post.caption || "";

    // Check for video/reel
    const videoUrl = post.videoUrl;
    if (videoUrl) {
        console.log(`🎯 [INSTAGRAM] Reel/Video found, transcribing...`);
        try {
            const res = await fetchWithRetry(videoUrl, {}, 90000);
            if (res.ok) {
                const blob = await res.blob();
                if (blob.size / (1024 * 1024) <= CONFIG.WHISPER_MAX_FILE_SIZE_MB) {
                    const file = new File([blob], `insta_reel.mp4`, { type: 'video/mp4' });
                    const transcription = await openai.audio.transcriptions.create({ file, model: "whisper-1", language: "en" });
                    if (transcription.text) {
                        text += `\n\n[Video Transcript]:\n${transcription.text}`;
                    }
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ [INSTAGRAM] Video transcription failed: ${e.message}`);
        }
    }

    return {
        text: `Instagram Post:\n\n${text}`,
        title: `Insta: ${url.split('/').filter(Boolean).pop()}`,
        metadata: post
    };
};

/**
 * Processor: YouTube (Robust)
 */
const processYoutube = async (videoId: string, videoUrl: string, openai: OpenAI) => {
    console.log(`📺 [YOUTUBE] Processing: ${videoId} (URL: ${videoUrl})`);
    const errors: string[] = [];

    // METHOD 1: Official Apify YouTube Scraper (Transcripts/Subtitles)
    try {
        console.log("🎯 [YOUTUBE] Method 1: Apify official scraper...");
        // Use tilde notation for the actor ID to avoid URL routing issues
        const data = await runApifyActor('apify~youtube-scraper', {
            startUrls: [{ url: videoUrl }],
            maxResults: 1,
            downloadSubtitles: true,
            saveSubsAsFile: false
        });

        if (data && data.length > 0) {
            const result = data[0];
            const subs = result.subtitles || [];
            if (subs.length > 0) {
                const bestSub = subs.find((s: any) => s.language === 'en' && s.type !== 'auto_generated')
                    || subs.find((s: any) => s.language === 'en')
                    || subs[0];

                if (bestSub?.srt && bestSub.srt.trim().length > 100) {
                    console.log(`✅ [YOUTUBE] Subtitles found: ${bestSub.srt.length} chars`);
                    const cleanText = bestSub.srt.replace(/\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/g, '').replace(/\n+/g, ' ').trim();
                    return { text: cleanText, title: result.title || "YouTube Video" };
                }
            }
        }
        errors.push("Official scraper: No valid subtitles found");
    } catch (e: any) {
        console.error(`❌ [YOUTUBE] Method 1 failed: ${e.message}`);
        errors.push(`Method 1: ${e.message}`);
    }

    // METHOD 2: Robust Downloader + Whisper
    try {
        console.log("🎯 [YOUTUBE] Method 2: Downloader + Whisper...");
        // Using a highly rated downloader with verified API access
        const audioData = await runApifyActor('apify~youtube-downloader-and-scraper', {
            startUrls: [{ url: videoUrl }],
            maxResults: 1,
            downloadAudio: true
        });

        const result = audioData?.[0];
        if (result?.audioUrl) {
            const audioUrl = result.audioUrl;
            console.log(`🌍 [YOUTUBE] Downloading audio: ${audioUrl.slice(0, 50)}...`);
            const res = await fetchWithRetry(audioUrl, {}, 180000);
            if (res.ok) {
                const blob = await res.blob();
                console.log(`📂 [YOUTUBE] Audio downloaded: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`);

                if (blob.size / (1024 * 1024) <= CONFIG.WHISPER_MAX_FILE_SIZE_MB) {
                    const file = new File([blob], `yt_${videoId}.m4a`, { type: 'audio/mp4' });
                    const transcription = await openai.audio.transcriptions.create({
                        file,
                        model: "whisper-1",
                        language: "en"
                    });
                    if (transcription.text?.length > 10) {
                        return { text: transcription.text.trim(), title: result.title || "YouTube Video" };
                    }
                } else {
                    errors.push(`Audio too large (${(blob.size / (1024 * 1024)).toFixed(1)}MB)`);
                }
            } else {
                errors.push(`Audio fetch failed: ${res.status}`);
            }
        } else {
            // Last Fallback: streamers~youtube-scraper (the one that worked before 404s)
            console.log("🎯 [YOUTUBE] Last Fallback: streamers~youtube-scraper...");
            const fallbackData = await runApifyActor('streamers~youtube-scraper', {
                startUrls: [{ url: videoUrl }],
                maxResults: 1,
                downloadAudio: true
            });
            if (fallbackData?.[0]?.audioUrl) {
                const audioUrl = fallbackData[0].audioUrl;
                const res = await fetchWithRetry(audioUrl, {}, 180000);
                if (res.ok) {
                    const blob = await res.blob();
                    const file = new File([blob], `yt_${videoId}.m4a`, { type: 'audio/mp4' });
                    const transcription = await openai.audio.transcriptions.create({ file, model: "whisper-1", language: "en" });
                    return { text: transcription.text.trim(), title: fallbackData[0].title || "YouTube Video" };
                }
            }
            errors.push("Downloader failed to provide audio URL");
        }
    } catch (e: any) {
        console.error(`❌ [YOUTUBE] Method 2 failed: ${e.message}`);
        errors.push(`Method 2: ${e.message}`);
    }

    throw new Error(`YouTube ingestion failed. Details: ${errors.join(' | ')}`);
};

/**
 * Main Ingestion Logic (Embeddings + Storage)
 */
const performIngestion = async (
    title: string, text: string, type: string, url: string | undefined,
    userId: string, profileId: string | undefined,
    supabaseClient: SupabaseClient, openai: OpenAI,
    existingSourceId?: string, // Optional ID for updating pending record
    folderId?: string // Folder association
) => {
    if (!text || text.trim().length < 5) {
        console.warn(`⚠️ [INGEST] Content too short to ingest: "${text?.slice(0, 20)}..."`);
        throw new Error("Content too short or empty");
    }

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    console.log(`📥 [DB] Creating/Updating source: ${title} (${type}) - ${wordCount} words`);

    let source: any;

    if (existingSourceId) {
        // Update existing "Pending" record
        const { data, error } = await supabaseClient
            .from("knowledge_sources")
            .update({
                title,
                source_type: type,
                source_url: url,
                word_count: wordCount,
                folder_id: folderId
            })
            .eq('id', existingSourceId)
            .select().single();

        if (error) {
            console.error("❌ [DB] Update Failed for source:", error);
            throw error;
        }
        console.log(`✅ [DB] Successfully updated source ${existingSourceId} with ${wordCount} words`);
        source = data;
    } else {
        // Create NEW record
        const { data, error } = await supabaseClient
            .from("knowledge_sources")
            .insert({
                user_id: userId,
                profile_id: profileId,
                title,
                source_type: type,
                source_url: url,
                word_count: wordCount,
                folder_id: folderId
            })
            .select().single();

        if (error) {
            console.error("❌ [DB] Insert Failed for source:", error);
            throw error;
        }
        console.log(`✅ [DB] Successfully created source ${data.id} with ${wordCount} words`);
        source = data;
    }

    // BREAKPOINT: Return source info early for some cases or just ensure it's saved
    // We update word_count BEFORE chunking to ensure UI shows it even if chunking/timeout happens
    console.log(`📊 [DEBUG] Word count ${wordCount} saved for ${source.id}`);

    // Chunking
    const chunks: string[] = [];
    const step = CONFIG.CHUNK_SIZE - CONFIG.CHUNK_OVERLAP;
    for (let i = 0; i < text.length; i += step) {
        const chunk = text.slice(i, i + CONFIG.CHUNK_SIZE).trim();
        if (chunk.length > 20) chunks.push(chunk);
        if (i + CONFIG.CHUNK_SIZE >= text.length) break;
    }

    console.log(`🧩 [CHUNK] Generated ${chunks.length} chunks`);

    let successfulChunks = 0;
    for (let i = 0; i < chunks.length; i += CONFIG.BATCH_SIZE) {
        const batch = chunks.slice(i, i + CONFIG.BATCH_SIZE);
        await Promise.all(batch.map(async (textChunk, idxInBatch) => {
            const globalIdx = i + idxInBatch;
            try {
                const embeddingResponse = await retryWithBackoff(async () => {
                    return await openai.embeddings.create({
                        model: "text-embedding-3-small",
                        input: textChunk
                    });
                }, 3, `embedding chunk`);

                const { error: chunkError } = await supabaseClient.from("knowledge_chunks").insert({
                    source_id: source.id,
                    user_id: userId,
                    profile_id: profileId,
                    content: textChunk,
                    chunk_index: globalIdx,
                    embedding: embeddingResponse.data[0].embedding
                });

                if (chunkError) {
                    console.error("❌ [CHUNK] DB Insert Error:", chunkError);
                } else {
                    successfulChunks++;
                }
            } catch (err: any) {
                console.error(`⚠️ [BATCH] Failed chunk:`, err.message);
            }
        }));
    }

    // --- NEW: Trigger GraphRAG Entity Extraction ---
    console.log(`🚀 [GraphRAG] Triggering extraction for source: ${source.id}`);
    try {
        // We use a non-blocking fetch here to not delay the response
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-entities`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
            },
            body: JSON.stringify({
                sourceIds: [source.id],
                profileId: profileId
            })
        }).catch(err => console.error("GraphRAG Background Fetch Error:", err));

        console.log("✅ GraphRAG Extraction queued.");
    } catch (err) {
        console.error("Error triggering GraphRAG extraction:", err);
    }

    return {
        success: true,
        sourceId: source.id,
        chunks: successfulChunks,
        totalChunks: chunks.length
    };
};

/**
 * HTTP STACK
 */
serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );
        const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
        const body = await req.json().catch(() => ({}));

        let { action, type, url, title, content, userId, profileId, folderId } = body;

        // Resolve User ID (Body priority, then Auth Header)
        if (!userId) {
            const authHeader = req.headers.get("Authorization");
            if (authHeader && !authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "ignore")) {
                const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
                if (user) userId = user.id;
            }
        }

        console.log(`💡 [REQUEST] Action: ${action || type}, URL: ${url || 'N/A'}, User: ${userId}`);

        if (!userId && action !== 'get_read_url') {
            // get_read_url might be public? if not, throw. 
            // valid actions need user.
            throw new Error("Unauthorized: Missing User ID");
        }

        // Ensure Storage Bucket exists with correct limits
        const ensureBucket = async () => {
            const { data: buckets } = await supabaseAdmin.storage.listBuckets();
            const bucketExists = buckets?.find((b: any) => b.name === 'knowledge-assets');

            if (!bucketExists) {
                await supabaseAdmin.storage.createBucket('knowledge-assets', {
                    public: false,
                    fileSizeLimit: 1048576000 // 1GB
                });
            } else {
                // Always try to update to ensure 1GB limit is active
                await supabaseAdmin.storage.updateBucket('knowledge-assets', {
                    fileSizeLimit: 1048576000
                });
            }
        };

        // ACTION HANDLERS
        if (action === 'get_upload_url') {
            await ensureBucket();
            const { fileName } = body;
            const { data, error } = await supabaseAdmin.storage.from('knowledge-assets').createSignedUploadUrl(fileName);
            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === 'get_read_url') {
            const { fileName } = body;
            const { data, error } = await supabaseAdmin.storage.from('knowledge-assets').createSignedUrl(fileName, 3600);
            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === 'transcribe_chunk') {
            const { filePath, fileName, fileType } = body;
            console.log(`🎙️ [CHUNK] Transcribing segment: ${fileName}`);

            const { data: blob, error: downloadError } = await supabaseAdmin.storage.from('knowledge-assets').download(filePath);
            if (downloadError) {
                console.error(`❌ [CHUNK] Download failed for ${filePath}:`, downloadError);
                throw downloadError;
            }
            console.log(`📂 [CHUNK] Downloaded segment ${fileName} (${(blob.size / 1024).toFixed(1)} KB)`);

            if (blob.size < 100) throw new Error("Audio segment is too small or corrupt");

            const file = new File([blob], fileName, { type: fileType });
            try {
                const transcription = await openai.audio.transcriptions.create({
                    file,
                    model: "whisper-1",
                    language: "en"
                });
                console.log(`✅ [CHUNK] Transcription complete for ${fileName}: ${transcription.text?.length || 0} chars`);

                // Clean up chunk immediately
                await supabaseAdmin.storage.from('knowledge-assets').remove([filePath]);

                return new Response(JSON.stringify({ text: transcription.text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            } catch (aiErr: any) {
                console.error(`❌ [CHUNK] Whisper failed for ${fileName}:`, aiErr.message);
                throw aiErr;
            }
        }

        if (action === 'process_media') {
            const { filePath, fileName, fileType } = body;
            console.log(`🎬 [MEDIA] Processing: ${fileName} (${fileType})`);

            // 1. Create/Update PRELIMINARY source record
            let pendingSource: any;
            console.log(`🔍 [DEBUG] Checking for existing record with url: ${filePath}`);

            const { data: existingSource, error: checkError } = await supabaseAdmin
                .from("knowledge_sources")
                .select('id')
                .eq('source_url', filePath)
                .maybeSingle();

            if (checkError) console.error("❌ [DEBUG] Check Error:", checkError);

            if (existingSource) {
                console.log(`♻️ [DEBUG] Updating existing record: ${existingSource.id}`);
                const { data, error } = await supabaseAdmin
                    .from("knowledge_sources")
                    .update({
                        title: fileName,
                        word_count: -1, // Marker: Background job started
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingSource.id)
                    .select().single();

                if (error) console.error("❌ [DEBUG] Update Failed:", error);
                else console.log("✅ [DEBUG] Update Success:", data);
                pendingSource = data;
            } else {
                console.log(`✨ [DEBUG] Inserting NEW record for ${fileName}`);
                const { data, error } = await supabaseAdmin
                    .from("knowledge_sources")
                    .insert({
                        user_id: userId,
                        profile_id: profileId,
                        title: fileName,
                        source_type: 'media',
                        source_url: filePath,
                        word_count: -1, // Marker: Background job started
                        folder_id: folderId
                    })
                    .select().single();

                if (error) console.error("❌ [DEBUG] Insert Failed:", error);
                else console.log("✅ [DEBUG] Insert Success:", data);
                pendingSource = data;
            }

            // 2. TRIGGER BACKGROUND PROCESSING
            // We define the heavy task as an async function but DO NOT await it for the response.
            const runBackgroundProcessing = async () => {
                try {
                    console.log(`🚀 [BACKGROUND] Starting transcription for ${fileName}...`);
                    let transcript = "";
                    let sizeMB = 0;

                    // 1. Get Metadata (to check size without downloading)
                    // Correctly path into subfolders for the list check
                    const pathParts = filePath.split('/');
                    const fileNameOnly = pathParts.pop() || "";
                    const folderPath = pathParts.join('/');

                    const { data: fileStats } = await supabaseAdmin.storage.from('knowledge-assets').list(folderPath, {
                        limit: 1,
                        search: fileNameOnly
                    });

                    if (fileStats && fileStats[0]) {
                        sizeMB = (fileStats[0].metadata?.size || fileStats[0].size || 0) / (1024 * 1024);
                        console.log(`📊 [STORAGE] File size detected: ${sizeMB.toFixed(2)}MB`);
                    } else {
                        console.warn(`⚠️ [STORAGE] Could not find file metadata for ${filePath}, proceeding with caution...`);
                    }

                    if (sizeMB > CONFIG.WHISPER_MAX_FILE_SIZE_MB && Deno.env.get("ASSEMBLYAI_API_KEY")) {
                        console.log(`🎤 [ASSEMBLYAI] Processing large file (${sizeMB.toFixed(1)}MB) via Signed URL...`);

                        // Get Signed URL for AssemblyAI to fetch directly
                        const { data: signData } = await supabaseAdmin.storage.from('knowledge-assets').createSignedUrl(filePath, 3600);
                        if (!signData?.signedUrl) throw new Error("Failed to generate signed URL for AssemblyAI");

                        transcript = await transcribeWithAssemblyAI(signData.signedUrl, fileName);
                    } else if (sizeMB > 50) {
                        // CRITICAL: Prevent OOM for very large files if no AssemblyAI key
                        throw new Error(`File is too large (${sizeMB.toFixed(1)}MB) and no AssemblyAI key provided. Max limit without AssemblyAI is 50MB to prevent function crash.`);
                    } else {
                        // Download only if small
                        const { data: blob, error: downloadError } = await supabaseAdmin.storage.from('knowledge-assets').download(filePath);
                        if (downloadError) throw downloadError;

                        const actualSizeMB = blob.size / (1024 * 1024);

                        if (actualSizeMB <= CONFIG.WHISPER_MAX_FILE_SIZE_MB) {
                            console.log(`🎙️ [WHISPER] Processing single file (${actualSizeMB.toFixed(2)}MB)`);
                            transcript = await transcribeWithWhisper(blob, fileName, openai);
                        } else {
                            console.log(`✂️ [CHUNK] Large file detected (${actualSizeMB.toFixed(1)}MB) and no AssemblyAI key. Falling back to Whisper chunking...`);
                            const chunkSize = 15 * 1024 * 1024;
                            const totalChunks = Math.ceil(blob.size / chunkSize);
                            const results: string[] = new Array(totalChunks).fill("");
                            const batchSize = 2;

                            for (let i = 0; i < totalChunks; i += batchSize) {
                                const batchIndices = [];
                                for (let j = i; j < Math.min(i + batchSize, totalChunks); j++) batchIndices.push(j);

                                const batchPromises = batchIndices.map(async (idx) => {
                                    return retryWithBackoff(async () => {
                                        const chunkStart = idx * chunkSize;
                                        const chunkEnd = Math.min(chunkStart + chunkSize, blob.size);
                                        const chunkBlob = blob.slice(chunkStart, chunkEnd, blob.type);

                                        const transcription = await openai.audio.transcriptions.create({
                                            file: new File([chunkBlob], `${fileName}_part_${idx}`, { type: fileType || blob.type }),
                                            model: "whisper-1",
                                            language: "en"
                                        });
                                        return transcription.text || "";
                                    }, CONFIG.MAX_RETRIES, `transcribe part ${idx}`);
                                });

                                const batchResults = await Promise.all(batchPromises);
                                batchIndices.forEach((idx, resIdx) => { results[idx] = batchResults[resIdx]; });
                            }
                            transcript = results.filter(Boolean).join(" ").trim();
                        }
                    }

                    if (!transcript || transcript.trim().length < 5) {
                        console.error(`❌ [BACKGROUND] Transcript is empty/short for ${fileName}. SourceID: ${pendingSource?.id}`);
                        throw new Error(`Transcription produced no text (Length: ${transcript?.length || 0})`);
                    }

                    console.log(`📝 [BACKGROUND] Success! Updating DB for ${fileName} (${transcript.length} chars)`);

                    // Final Update - Now optimized to save word count FIRST
                    const ingestResult = await performIngestion(fileName, transcript, "file", filePath, userId, profileId, supabaseAdmin, openai, pendingSource?.id, folderId);
                    console.log(`✅ [BACKGROUND] Word count and source record finalized. Chunks generated: ${ingestResult.chunks}`);
                    console.log(`✅ [BACKGROUND] DB Updated successfully. SourceID: ${ingestResult.sourceId}`);
                    console.log(`✅ [BACKGROUND] Completed for ${fileName}`);

                } catch (bgError: any) {
                    console.error(`❌ [BACKGROUND] Failed for ${fileName}:`, bgError);
                    // Update metadata to show failure if possible
                    if (pendingSource?.id) {
                        await supabaseAdmin.from("knowledge_sources").update({
                            metadata: { error: bgError.message, failed_at: new Date().toISOString() }
                        }).eq('id', pendingSource.id);
                    }
                }
            };

            // 3. Fire Background Task correctly
            if ((globalThis as any).EdgeRuntime?.waitUntil) {
                (globalThis as any).EdgeRuntime.waitUntil(runBackgroundProcessing());
            } else {
                runBackgroundProcessing(); // Detached promise in non-Edge envs
            }

            // 4. Return IMMEDIATE Success
            return new Response(JSON.stringify({
                success: true,
                message: "Processing started",
                id: pendingSource?.id
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ROUTE: Background Processing for EVERYTHING
        // This ensures the Edge Function returns immediately and avoids timeouts
        const runEverythingBackground = async () => {
            try {
                let textToIngest = content || "";
                let finalTitle = title || "Untitled Content";
                let finalType = type || "text";

                // URL Processing Routing (Only if NO content provided)
                if (url && !textToIngest) {
                    console.log(`🔗 [DEBUG] Processing URL: ${url}`);
                    if (url.includes("youtube.com") || url.includes("youtu.be")) {
                        const vMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|live\/)|youtu\.be\/)([^"&?\/\s]{11})/);
                        if (!vMatch) throw new Error("Invalid YouTube URL");
                        const yt = await processYoutube(vMatch[1], url, openai);
                        textToIngest = yt.text;
                        finalTitle = yt.title;
                        finalType = "youtube";
                    }
                    else if (url.includes("twitter.com") || url.includes("x.com")) {
                        const tw = await processTwitter(url, openai);
                        textToIngest = tw.text;
                        finalTitle = tw.title;
                        finalType = "twitter";
                    }
                    else if (url.includes("instagram.com")) {
                        const insta = await processInstagram(url, openai);
                        textToIngest = insta.text;
                        finalTitle = insta.title;
                        finalType = "instagram";
                    }
                    else {
                        const web = await processWebsite(url, openai);
                        textToIngest = web.text;
                        finalTitle = web.title;
                        finalType = "web";
                    }
                }

                await performIngestion(
                    finalTitle,
                    textToIngest,
                    finalType,
                    url,
                    userId,
                    profileId,
                    supabaseAdmin,
                    openai,
                    undefined,
                    folderId
                );
                console.log(`✅ [BACKGROUND] Successfully ingested: ${finalTitle}`);
            } catch (err: any) {
                console.error(`❌ [BACKGROUND] Failed:`, err.message);
            }
        };

        // Fire Background Task
        if ((globalThis as any).EdgeRuntime?.waitUntil) {
            (globalThis as any).EdgeRuntime.waitUntil(runEverythingBackground());
        } else {
            runEverythingBackground();
        }

        return new Response(JSON.stringify({
            success: true,
            message: "Ingestion started in background"
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (err: any) {
        const errorMsg = err.message || (typeof err === 'string' ? err : JSON.stringify(err)) || "Unknown ingestion error";
        console.error("❌ [CRITICAL ERROR]:", errorMsg);
        return new Response(JSON.stringify({
            success: false,
            error: errorMsg,
            details: err.details || null
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        });
    }
});
