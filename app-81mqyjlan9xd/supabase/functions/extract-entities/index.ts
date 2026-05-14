import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { sourceIds, profileId } = await req.json();

        if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
            return new Response(JSON.stringify({ error: "No sourceIds provided" }), { status: 400, headers: corsHeaders });
        }

        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const openai = new OpenAI({
            apiKey: Deno.env.get("OPENAI_API_KEY"),
        });

        // 1. Fetch source metadata
        const { data: sources, error: fetchError } = await supabaseClient
            .from('knowledge_sources')
            .select('id, title, content')
            .in('id', sourceIds);

        if (fetchError || !sources) {
            throw new Error(`Failed to fetch sources: ${fetchError?.message}`);
        }

        console.log(`🔍 Processing ${sources.length} sources for profile: ${profileId}`);

        let nodesCreated = 0;
        let edgesCreated = 0;
        let errors = 0;
        let diagnosticLog = "";
        let textToProcess = "";
        let debugAIRaw = "No AI response yet";

        for (const source of sources) {
            // --- 1. CRITICAL: Mark as scanned to prevent infinite loops ---
            const { error: syncErr } = await supabaseClient.from('knowledge_sources').update({ last_graph_sync: new Date().toISOString() }).eq('id', source.id);
            if (syncErr) console.error(`❌ Sync update FAILED for ${source.id}: ${syncErr.message}`);

            // --- 2. GARBAGE FILTER (Skip system files) ---
            if (source.title?.includes('.DS_Store') || source.title?.startsWith('._')) continue;

            textToProcess = source.content || "";
            let method = textToProcess ? "source_column" : "none_yet";

            // --- 3. THE ULTIMATE TEXT HUNT ---
            if (!textToProcess || textToProcess.length < 50) {
                const { data: chunks } = await supabaseClient.from('knowledge_chunks').select('content').eq('source_id', source.id).limit(20);
                if (chunks && chunks.length > 0) {
                    textToProcess = chunks.map((c: any) => c.content).join("\n");
                    method = `knowledge_chunks (${chunks.length})`;
                } else {
                    const { data: legacy } = await supabaseClient.from('knowledge_base').select('content').or(`metadata->>filename.eq."${source.title}",metadata->>source_title.eq."${source.title}"`).limit(10);
                    if (legacy && legacy.length > 0) {
                        textToProcess = legacy.map((l: any) => l.content).join("\n");
                        method = `knowledge_base legacy (${legacy.length})`;
                    }
                }
            }

            diagnosticLog = `Mode: ${method}. Length: ${textToProcess?.length || 0}`;

            if (!textToProcess || textToProcess.trim().length < 20) continue;

            // --- 4. EXTRACTION ---
            const textSnippet = textToProcess.slice(0, 15000);
            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: `You are a GREEDY Knowledge Graph extractor for an Elite Life Coach. 
                            Identify every possible Concept, Topic, or Action. 
                            Categorize nodes into one of these types: 
                            - 'Ritual': Daily/repeated practices.
                            - 'Limiting Belief': Negative patterns to break.
                            - 'Outcome': Desired results/goals.
                            - 'Obstacle': Challenges or blockers.
                            - 'Method': Specific techniques/systems (e.g., SDE, EFT).
                            - 'Concept': General wisdom.
                            - 'Person' or 'Location' where relevant.
                            Return JSON: {nodes:[{name, type, description}], edges:[{source, target, relation}]}.`
                        },
                        { role: "user", content: `Extract from this text:\n\n${textSnippet}` }
                    ],
                    response_format: { type: "json_object" }
                });

                const aiRaw = completion.choices[0].message.content || '{"nodes":[]}';
                const result = JSON.parse(aiRaw);
                debugAIRaw = aiRaw.slice(0, 200);

                for (const nodeData of result.nodes || []) {
                    const { data: node } = await supabaseClient.from('graph_nodes').upsert({ profile_id: profileId, name: nodeData.name, type: nodeData.type || 'Concept' }, { onConflict: 'profile_id,name' }).select().single();
                    if (node) {
                        nodesCreated++;
                        await supabaseClient.from('node_source_map').upsert({ node_id: node.id, source_id: source.id }, { onConflict: 'node_id,source_id' });
                    }
                }
                for (const edgeData of result.edges || []) {
                    const { data: sNode } = await supabaseClient.from('graph_nodes').select('id').eq('profile_id', profileId).eq('name', edgeData.source).single();
                    const { data: tNode } = await supabaseClient.from('graph_nodes').select('id').eq('profile_id', profileId).eq('name', edgeData.target).single();
                    if (sNode && tNode) {
                        await supabaseClient.from('graph_edges').upsert({ source_id: sNode.id, target_id: tNode.id, relation_type: edgeData.relation || 'related_to' }, { onConflict: 'source_id,target_id,relation_type' });
                        edgesCreated++;
                    }
                }
            } catch (err: any) {
                console.error(`Extraction failed: ${err.message}`);
                errors++;
            }
        }

        return new Response(JSON.stringify({
            success: true,
            sourcesProcessed: sources.length,
            nodesCreated,
            edgesCreated,
            errorCount: errors,
            debug_title: sources[0]?.title || "Unknown",
            debug_source_id: sources[0]?.id || "None",
            debug_diagnostic: diagnosticLog,
            debug_finalTextLength: textToProcess?.length || 0,
            debug_scout: debugAIRaw
        }), { headers: corsHeaders });

    } catch (error: any) {
        console.error("Extraction Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
});
