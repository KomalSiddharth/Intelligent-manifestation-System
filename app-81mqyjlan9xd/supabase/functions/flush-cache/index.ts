import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// One-time admin utility: flush stale response caches after a prompt/RAG-logic
// deploy. Response caches (perm:resp:*, resp:*, coach:resp:*) are keyed by the
// normalized query text and are NOT invalidated by code deploys — only by TTL
// or KB content changes — so old pre-fix answers can keep being served for
// common questions until manually cleared.
serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
    if (!redisUrl || !redisToken) {
        return new Response(JSON.stringify({ error: "Redis not configured" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    const patterns = ["perm:resp:*", "resp:*", "coach:resp:*"];
    let totalDeleted = 0;
    const breakdown: Record<string, number> = {};

    for (const pattern of patterns) {
        let cursor = "0";
        let deletedForPattern = 0;
        do {
            const scanRes = await fetch(`${redisUrl}/scan/${cursor}/match/${encodeURIComponent(pattern)}/count/200`, {
                headers: { Authorization: `Bearer ${redisToken}` }
            }).then(r => r.json());

            cursor = scanRes.result?.[0] ?? "0";
            const keys: string[] = scanRes.result?.[1] ?? [];

            if (keys.length > 0) {
                await fetch(`${redisUrl}/pipeline`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify(keys.map(k => ["DEL", k]))
                });
                deletedForPattern += keys.length;
            }
        } while (cursor !== "0");

        breakdown[pattern] = deletedForPattern;
        totalDeleted += deletedForPattern;
    }

    return new Response(JSON.stringify({ success: true, totalDeleted, breakdown }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
});
