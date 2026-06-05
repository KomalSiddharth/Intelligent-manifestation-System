import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ============================================================
// pre-cache-responses
// Generates LLM answers for a list of questions and stores
// them permanently in Redis (TTL = 0, never expires).
//
// POST body: { profileId: string, questions: string[], overwrite?: boolean }
// Returns: { cached: number, skipped: number, errors: string[] }
// ============================================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeCacheKey(text: string): string {
    return text.trim().toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 120);
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const redisUrl   = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    // Use ANON key to call chat-engine (it's a public endpoint)
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!redisUrl || !redisToken || !supabaseUrl || !anonKey) {
        return new Response(JSON.stringify({ error: "Missing env config" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { profileId, questions, overwrite = false } = await req.json().catch(() => ({}));
    if (!profileId || !Array.isArray(questions) || questions.length === 0) {
        return new Response(JSON.stringify({ error: "profileId and questions[] required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const BATCH_SIZE = 5; // process 5 at a time to avoid timeouts
    const cap = questions.slice(0, 50); // max 50 per call
    let cached = 0, skipped = 0;
    const errors: string[] = [];

    for (const question of cap) {
        const cacheKey = `perm:resp:${profileId}:${normalizeCacheKey(question)}`;

        // Check if already cached (skip unless overwrite=true)
        if (!overwrite) {
            try {
                const existing = await fetch(`${redisUrl}/get/${encodeURIComponent(cacheKey)}`,
                    { headers: { Authorization: `Bearer ${redisToken}` } }
                ).then(r => r.json());
                if (existing.result) { skipped++; continue; }
            } catch (_) {}
        }

        // Call chat-engine to generate the real response
        try {
            const chatRes = await fetch(`${supabaseUrl}/functions/v1/chat-engine`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${anonKey}`,
                },
                body: JSON.stringify({
                    query: question,
                    profileId,
                    userId: "pre-cache-bot",
                    history: [],
                    detectedLanguage: "english",
                    detectedSentiment: "neutral",
                }),
            });

            if (!chatRes.ok) {
                errors.push(`${question}: HTTP ${chatRes.status}`);
                continue;
            }

            // Read the streamed response
            const reader = chatRes.body?.getReader();
            const decoder = new TextDecoder();
            let fullResponse = "";

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    for (const line of chunk.split("\n")) {
                        if (!line.startsWith("data: ")) continue;
                        const data = line.slice(6).trim();
                        if (data === "[DONE]") break;
                        try {
                            const parsed = JSON.parse(data);
                            if (typeof parsed === "string" && !parsed.includes("__SOURCES__")) {
                                fullResponse += parsed;
                            }
                        } catch (_) {}
                    }
                }
            }

            if (!fullResponse) { errors.push(`${question}: empty response`); continue; }

            // Store PERMANENTLY in Redis (TTL = 0 = never expires)
            await fetch(`${redisUrl}/pipeline`, {
                method: "POST",
                headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
                body: JSON.stringify([
                    ["SET", cacheKey, JSON.stringify({ text: fullResponse, sources: [] })]
                    // NO "EX" = permanent, never expires
                ]),
            });

            cached++;
            console.log(`✅ [PRE-CACHE] Cached: "${question.slice(0, 50)}"`);

            // Small pause to respect rate limits
            await new Promise(r => setTimeout(r, 800));

        } catch (e: any) {
            errors.push(`${question}: ${e.message}`);
        }
    }

    return new Response(JSON.stringify({
        cached,
        skipped,
        errors,
        total: cap.length,
        note: `${cached} questions permanently cached. Run again with next batch.`
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
