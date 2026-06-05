import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

// ============================================================
// pre-cache-responses — generates answers directly, no HTTP call
// POST: { profileId, questions[], overwrite? }
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

    const redisUrl    = Deno.env.get("UPSTASH_REDIS_REST_URL")!;
    const redisToken  = Deno.env.get("UPSTASH_REDIS_REST_TOKEN")!;
    const openaiKey   = Deno.env.get("OPENAI_API_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? "";

    if (!redisUrl || !redisToken || !openaiKey || !supabaseUrl || !serviceKey) {
        return new Response(JSON.stringify({ error: "Missing env config" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    const { profileId, questions, overwrite = false } = await req.json().catch(() => ({}));
    if (!profileId || !Array.isArray(questions) || questions.length === 0) {
        return new Response(JSON.stringify({ error: "profileId and questions[] required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    const openai   = new OpenAI({ apiKey: openaiKey });
    const supabase = createClient(supabaseUrl, serviceKey);
    const cap      = questions.slice(0, 25);
    let cached = 0, skipped = 0;
    const errors: string[] = [];

    // Fetch KB sources (safe — won't crash if fails)
    let srcMap = new Map<string, any>();
    try {
        const { data: sources } = await supabase
            .from("knowledge_sources")
            .select("id, title, source_url")
            .eq("profile_id", profileId);
        srcMap = new Map((sources ?? []).map((s: any) => [s.id, s]));
        console.log(`📚 Loaded ${srcMap.size} knowledge sources`);
    } catch (e: any) {
        console.warn(`⚠️ Could not load sources: ${e.message}`);
    }

    for (const question of cap) {
        const permKey = `perm:resp:${profileId}:${normalizeCacheKey(question)}`;

        // Skip if already cached
        if (!overwrite) {
            try {
                const ex = await fetch(`${redisUrl}/get/${encodeURIComponent(permKey)}`,
                    { headers: { Authorization: `Bearer ${redisToken}` } }
                ).then(r => r.json());
                if (ex.result) { skipped++; continue; }
            } catch (_) {}
        }

        try {
            // Load all KB chunks directly (skip vector search — avoids RPC issues)
            // Works well for small KBs (support bot has ~50 chunks from 2 PDFs)
            const { data: allChunks, error: chunkErr } = await supabase
                .from("knowledge_chunks")
                .select("content, source_id")
                .eq("profile_id", profileId)
                .limit(100);

            if (chunkErr) {
                errors.push(`${question.slice(0,40)}: DB error - ${chunkErr.message}`);
                continue;
            }

            const context = (allChunks ?? []).slice(0, 8).map((c: any) => {
                const src = srcMap.get(c.source_id);
                const url = src?.source_url ? ` (Link: ${src.source_url})` : "";
                return `[SOURCE: ${src?.title ?? "Knowledge"}${url}]\n${c.content}`;
            }).join("\n\n---\n\n") || "No specific knowledge found.";

            // 3. Generate answer — always GPT-4o-mini (reliable for batch job)
            let answer = "";
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                max_tokens: 400,
                messages: [
                    {
                        role: "system",
                        content: `You are IMK Support Bot — a helpful, friendly customer support assistant for Mitesh Khatri's programs.
Answer based ONLY on the knowledge provided. Be concise, clear, and professional.
If info is not in knowledge base, say "Please contact support at support@miteshkhatri.com".
KNOWLEDGE:\n${context}`
                    },
                    { role: "user", content: question }
                ]
            });

            answer = completion.choices[0]?.message?.content ?? "";
            if (!answer) { errors.push(`${question}: empty response`); continue; }

            // 4. Store PERMANENTLY in Redis (no TTL = never expires)
            await fetch(`${redisUrl}/pipeline`, {
                method: "POST",
                headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
                body: JSON.stringify([
                    ["SET", permKey, JSON.stringify({ text: answer, sources: [] })]
                ]),
            });

            cached++;
            console.log(`✅ [PRE-CACHE] "${question.slice(0, 50)}"`);
            await new Promise(r => setTimeout(r, 500));

        } catch (e: any) {
            const msg = e?.message ?? e?.toString() ?? "unknown error";
            console.error(`❌ Failed: "${question}" → ${msg}`);
            errors.push(`${question.slice(0, 40)}: ${msg}`);
        }
    }

    return new Response(JSON.stringify({
        cached, skipped, errors,
        total: cap.length,
        note: `${cached} cached permanently. ${skipped} already existed.`
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
