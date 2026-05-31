import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

// warm-cache
// Pre-populates the L3 retrieval cache for a list of common queries.
// This ensures the first visitor asking about popular topics gets a fast
// response instead of waiting for vector search.
//
// Accepts: { profileId: string, queries: string[] }
// Returns: { warmed: number, total: number, kbVersion: string, errors: string[] }

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeCacheKey(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 120);
}

function formatChunk(c: any): string {
    const title = c.source_title || "Knowledge";
    const url   = c.source_url  || c.metadata?.url || "";
    const linkLine = url ? ` (Link: ${url})` : "";
    return `[SOURCE: ${title}${linkLine}]\n${c.content}`;
}

async function compressToBase64(str: string): Promise<string> {
    try {
        const bytes = new TextEncoder().encode(str);
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const chunks: Uint8Array[] = [];
        const reader = cs.readable.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value!);
        }
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.length; }
        let bin = '';
        out.forEach(b => (bin += String.fromCharCode(b)));
        return 'gz:' + btoa(bin);
    } catch (_) {
        return str;
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const redisUrl    = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken  = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
    const openaiKey   = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");

    if (!redisUrl || !redisToken || !openaiKey || !supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ error: "Missing env config" }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const { profileId, queries } = await req.json().catch(() => ({}));
    if (!profileId || !Array.isArray(queries) || queries.length === 0) {
        return new Response(JSON.stringify({ error: "profileId and queries[] required" }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const openai   = new OpenAI({ apiKey: openaiKey });
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current KB version (same logic as chat-engine)
    let kbVersion = 'v0';
    try {
        const { data } = await supabase
            .from('knowledge_sources')
            .select('updated_at')
            .eq('profile_id', profileId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();
        if (data?.updated_at) {
            kbVersion = new Date(data.updated_at).getTime().toString(16);
        }
    } catch (_) { /* use default */ }

    const capped = queries.slice(0, 25); // max 25 queries per call
    let warmed = 0;
    const errors: string[] = [];

    for (const query of capped) {
        try {
            // 1. Embed the query
            const embRes = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: query,
            });
            const embedding = embRes.data[0].embedding;

            // 2. Vector search (same params as fast coach path in chat-engine)
            const { data: chunks, error: matchErr } = await supabase.rpc("match_knowledge", {
                query_embedding: embedding,
                match_threshold: 0.30,
                match_count: 8,
                p_profile_id: profileId,
            });

            if (matchErr) { errors.push(`${query}: ${matchErr.message}`); continue; }
            if (!chunks?.length) continue;

            // 3. Also fetch source metadata for URL/title
            const sourceIds = [...new Set(chunks.map((c: any) => c.source_id).filter(Boolean))];
            const { data: sources } = sourceIds.length > 0
                ? await supabase
                    .from('knowledge_sources')
                    .select('id, title, source_url, metadata')
                    .in('id', sourceIds)
                : { data: [] };
            const srcMap = new Map((sources || []).map((s: any) => [s.id, s]));

            const enriched = chunks.map((c: any) => {
                const src = srcMap.get(c.source_id) as any;
                return { ...c, source_title: src?.title, source_url: src?.source_url || src?.metadata?.url };
            });

            // 4. Format + compress + store in L3 cache (12 h TTL)
            const context    = enriched.map(formatChunk).join("\n\n---\n\n");
            const compressed = await compressToBase64(context);
            const l3Key      = `rag:r:${profileId}:${kbVersion}:${normalizeCacheKey(query)}`;

            await fetch(`${redisUrl}/pipeline`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify([['SET', l3Key, compressed, 'EX', 43200]]),
            });

            warmed++;
            console.log(`✅ [WARM] Cached "${query.slice(0, 50)}"`);
        } catch (e: any) {
            errors.push(`${query}: ${e.message}`);
        }
    }

    return new Response(JSON.stringify({ warmed, total: capped.length, kbVersion, errors }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
});
