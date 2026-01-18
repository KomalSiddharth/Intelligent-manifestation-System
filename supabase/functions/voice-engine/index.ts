import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Expose-Headers": "X-TTS-Failed, X-TTS-Error, X-Response-Text",
};

serve(async (req) => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const mode = url.searchParams.get("mode");

        let textToSpeak = "";
        let voiceIdUsed = "";

        if (mode === 'tts') {
            console.log("🎤 Voice Engine (TTS Mode) Request Received");
            const { text, voiceId } = await req.json();
            if (!text) throw new Error("Text is required for TTS mode");
            textToSpeak = text;
            voiceIdUsed = voiceId || Deno.env.get("ELEVEN_LABS_VOICE_ID") || "ErXwobaYiN019PkySvjV";
        } else {
            console.log("🎤 Voice Engine (S2S Mode) Request Received");

            // Initialize clients
            const supabaseClient = createClient(
                Deno.env.get("SUPABASE_URL") ?? "",
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
            );

            const openai = new OpenAI({
                apiKey: Deno.env.get("OPENAI_API_KEY"),
            });

            // Get form data
            const formData = await req.formData();
            const audioFile = formData.get('audio') as File;
            const profileId = formData.get('profileId') as string;

            if (!audioFile) {
                throw new Error("Audio file is required");
            }

            console.log("📝 Profile ID:", profileId);

            // Step 1: Speech to Text
            console.log("🎧 Starting STT...");
            const transcription = await openai.audio.transcriptions.create({
                file: audioFile,
                model: "whisper-1",
            });
            const query = transcription.text;
            console.log("✅ Transcribed:", query);

            // Step 2: Get Profile
            let profile = null;
            if (profileId) {
                const { data } = await supabaseClient
                    .from("mind_profile")
                    .select("*")
                    .eq("id", profileId)
                    .single();
                profile = data;
                console.log("👤 Profile:", profile?.name);
            }

            // Step 3: Get Knowledge Base Context
            console.log("📚 Fetching knowledge...");
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: query,
            });
            const queryEmbedding = embeddingResponse.data[0].embedding;

            const { data: knowledgeChunks } = await supabaseClient.rpc('match_knowledge_chunks', {
                query_embedding: queryEmbedding,
                match_threshold: 0.5,
                match_count: 3,
            });

            const knowledgeContext = knowledgeChunks
                ?.map((chunk: any) => chunk.content)
                .join("\n\n") || "";

            // Step 4: Generate Response
            console.log("🤖 Generating response...");
            const systemPrompt = `
You are an AI clone of ${profile?.headline || "Mitesh Khatri, a Law of Attraction Coach"}.
Your Biography: ${profile?.description || "Not provided."}
Your Speaking Style: ${profile?.speaking_style || "Warm, energetic, high-vibe, and very human."}

Instructions:
- Be warm, energetic, and sound like a real human, not a robot. 
- Use short sentences. Pause naturally.
- Use casual language like "Hey champion", "Got it", "Absolutely".
- If the knowledge base has the answer, explain it simply.
- If not, say "I don't have that info handy, but let's focus on what I can help with!" in a positive way.

Knowledge Base Context:
${knowledgeContext}

STRICT INSTRUCTIONS:
1. Answer ONLY based on the Context.
2. NO long lectures. Keep it conversational.
3. NEVER invent links. Use ONLY links found in the Context.
4. ABSOLUTELY NO placeholder URLs.
5. Focus on the VIBE: High energy, positive, and empowering!
`;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: query },
                ],
            });
            textToSpeak = completion.choices[0].message.content || "I'm sorry, I couldn't generate a response.";
            console.log("✅ Response generated:", textToSpeak.substring(0, 100) + "...");

            voiceIdUsed = profile?.eleven_labs_voice_id || Deno.env.get("ELEVEN_LABS_VOICE_ID") || "ErXwobaYiN019PkySvjV";
        }

        // Step 5: Text to Speech (Common for both modes)
        console.log("🔊 Generating audio for:", textToSpeak.substring(0, 50) + "...");
        const elevenLabsApiKey = Deno.env.get("ELEVEN_LABS_API_KEY");

        console.log("🎙️ Using voice:", voiceIdUsed);

        const elResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceIdUsed}`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': elevenLabsApiKey || "",
                },
                body: JSON.stringify({
                    text: textToSpeak,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                }),
            }
        );

        if (!elResponse.ok) {
            const errText = await elResponse.text();
            console.error("❌ ElevenLabs Error:", errText);

            // Fallback: Return text for browser TTS
            return new Response(null, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                    "X-Response-Text": encodeURIComponent(textToSpeak),
                    "X-TTS-Failed": "true",
                    "X-TTS-Error": encodeURIComponent(errText.substring(0, 200)),
                }
            });
        }

        // Success: Return audio
        const audioBlob = await elResponse.blob();
        console.log("✅ Audio generated, size:", audioBlob.size);

        return new Response(audioBlob, {
            headers: {
                ...corsHeaders,
                "Content-Type": "audio/mpeg",
                "X-Response-Text": encodeURIComponent(textToSpeak),
            },
        });

    } catch (error: any) {
        console.error("❌ Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
