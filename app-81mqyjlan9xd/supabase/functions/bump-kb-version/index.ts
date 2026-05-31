import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// bump-kb-version
// Deletes the cached kb:ver:{profileId} key from Redis so the next
// chat-engine request fetches a fresh version from the DB.
// Also deletes all L3 retrieval cache keys for this profile using SCAN + DEL
// (capped at 500 keys to avoid timeout on very large caches).
//
// Call this after:
//  - Adding / editing / deleting knowledge_sources rows in Supabase
//  - Running ingest-content to load new KB documents

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const redisUrl   = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

    if (!redisUrl || !redisToken) {
        return new Response(JSON.stringify({ error: "Redis not configured" }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const { profileId } = await req.json().catch(() => ({}));
    if (!profileId) {
        return new Response(JSON.stringify({ error: "profileId required" }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    let deleted = 0;
    try {
        // 1. Delete the cached KB version key — next request refreshes from DB
        await fetch(`${redisUrl}/del/${encodeURIComponent(`kb:ver:${profileId}`)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${redisToken}` },
        });

        // 2. SCAN for L3 retrieval keys matching rag:r:{profileId}:*
        //    Upstash REST: POST /scan/0/match/{pattern}/count/500
        let cursor = '0';
        const keysToDelete: string[] = [];
        do {
            const scanRes = await fetch(`${redisUrl}/scan/${cursor}/match/${encodeURIComponent(`rag:r:${profileId}:*`)}/count/100`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${redisToken}` },
            }).then(r => r.json());

            cursor = String(scanRes.result?.[0] ?? '0');
            const keys: string[] = scanRes.result?.[1] ?? [];
            keysToDelete.push(...keys);

            if (keysToDelete.length >= 500) break; // safety cap
        } while (cursor !== '0');

        // 3. Delete found L3 keys in a single pipeline
        if (keysToDelete.length > 0) {
            await fetch(`${redisUrl}/pipeline`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(keysToDelete.map(k => ['DEL', k])),
            });
            deleted = keysToDelete.length;
        }

        console.log(`🗑️ [BUMP-KB] Cleared kb:ver + ${deleted} L3 keys for profile ${profileId}`);

        return new Response(JSON.stringify({
            success: true,
            message: `KB version invalidated. ${deleted} L3 retrieval cache entries cleared.`,
            keysDeleted: deleted,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
