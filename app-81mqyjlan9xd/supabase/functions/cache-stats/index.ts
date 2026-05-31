import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Upstash HGETALL returns { result: { field: "value", ... } } in REST API
function parseHash(result: any): Record<string, number> {
    if (!result || typeof result !== 'object') return {};
    // REST API returns object map
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(result)) {
        out[k] = parseInt(String(v)) || 0;
    }
    return out;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const redisUrl   = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

    if (!redisUrl || !redisToken) {
        return new Response(JSON.stringify({ error: "Redis not configured" }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const { profileId } = await req.json();
    if (!profileId) {
        return new Response(JSON.stringify({ error: "profileId required" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        // Build date strings for the last 7 days (today first)
        const dates: string[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }

        // Pipeline: HGETALL for each day + GET for kb version — one round-trip
        const pipeline = [
            ...dates.map(d => ['HGETALL', `cache:stats:${profileId}:${d}`]),
            ['GET', `kb:ver:${profileId}`],
        ];

        const results = await fetch(`${redisUrl}/pipeline`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(pipeline),
        }).then(r => r.json());

        // Last result is the kb:ver GET
        const kbVersion: string | null = results[dates.length]?.result ?? null;

        const stats = dates.map((date, i) => {
            const raw = parseHash(results[i]?.result);
            const l1_hit   = raw.l1_hit   || 0;
            const l2_hit   = raw.l2_hit   || 0;
            const l3_hit   = raw.l3_hit   || 0;
            const l3_miss  = raw.l3_miss  || 0;
            const llm_call = raw.llm_call || 0;
            const total    = l1_hit + l2_hit + llm_call;
            const saved    = l1_hit + l2_hit;
            const hit_rate_pct   = total > 0 ? Math.round((saved / total) * 100) : 0;
            const l3_rate_pct    = (l3_hit + l3_miss) > 0
                ? Math.round((l3_hit / (l3_hit + l3_miss)) * 100)
                : 0;
            return { date, l1_hit, l2_hit, l3_hit, l3_miss, llm_call, total, saved, hit_rate_pct, l3_rate_pct };
        });

        return new Response(JSON.stringify({ stats, kbVersion }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
