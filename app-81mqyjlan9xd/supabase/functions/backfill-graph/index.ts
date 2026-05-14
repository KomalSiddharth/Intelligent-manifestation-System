import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/*
  RPC REQUIRED:
  CREATE OR REPLACE FUNCTION get_unmapped_sources(p_limit int)
  RETURNS SETOF uuid AS $$
  BEGIN
      RETURN QUERY
      SELECT id FROM knowledge_sources
      WHERE id NOT IN (SELECT DISTINCT source_id FROM node_source_map)
      LIMIT p_limit;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
*/

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const { batchSize = 10, profileId } = await req.json();

        if (!profileId) {
            return new Response(JSON.stringify({ error: "profileId is required" }), { status: 400, headers: corsHeaders });
        }

        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        console.log(`🚀 [BACKFILL] Starting batch process for ${batchSize} sources...`);

        // 1. Get unmapped source IDs DIRECTLY (checking last_graph_sync)
        // This prevents infinite loops where a file yields 0 nodes and keeps getting retried.
        const { data: rawSources, error: fetchError } = await supabaseClient
            .from('knowledge_sources')
            .select('id')
            .is('last_graph_sync', null)
            .limit(batchSize);

        if (fetchError) {
            console.error("❌ [BACKFILL] Database Error:", fetchError);
            throw fetchError;
        }

        const sourceIds = rawSources?.map(s => s.id) || [];

        if (sourceIds.length === 0) {
            console.log("✅ [BACKFILL] No pending sources found.");

            // Get global stats to show user why it finished
            const { count: totalSources } = await supabaseClient.from('knowledge_sources').select('*', { count: 'exact', head: true });
            const { count: syncedSources } = await supabaseClient.from('knowledge_sources').select('*', { count: 'exact', head: true }).not('last_graph_sync', 'is', null);
            const { count: mappedSources } = await supabaseClient.from('node_source_map').select('source_id', { count: 'exact', head: true });

            return new Response(JSON.stringify({
                success: true,
                message: "Process Complete. No unmapped sources found.",
                stats: {
                    nodesCreated: 0,
                    edgesCreated: 0,
                    debug_title: "COMPLETE",
                    debug_source_id: "ALL_DONE",
                    debug_scout: `Total: ${totalSources} | Synced: ${syncedSources} | With Nodes: ${mappedSources}`,
                    global_stats: {
                        total: totalSources,
                        synced: syncedSources,
                        with_nodes: mappedSources
                    }
                }
            }), { headers: corsHeaders });
        }

        // 2. Trigger extract-entities for these IDs
        const extractParams = {
            sourceIds,
            profileId
        };
        const authHeader = req.headers.get("Authorization");
        const apikeyHeader = req.headers.get("apikey") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        console.log(`📡 [BACKFILL] Sending to extract-entities: ${JSON.stringify(extractParams)}`);
        if (!authHeader) console.warn("⚠️ [BACKFILL] No Authorization header found on incoming request.");

        const extractResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-entities`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader || `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                'apikey': apikeyHeader || ""
            },
            body: JSON.stringify(extractParams)
        });

        if (!extractResponse.ok) {
            const errorText = await extractResponse.text();
            console.error(`❌ [BACKFILL] Extraction Brain reported error (${extractResponse.status}):`, errorText);

            // Return a 200 with error details so user can see it in PowerShell
            return new Response(JSON.stringify({
                success: false,
                error: `Extraction Brain Failed (HTTP ${extractResponse.status})`,
                details: errorText,
                hint: "Ensure 'extract-entities' is deployed and apikey/auth headers are correct."
            }), { headers: corsHeaders });
        }

        const result = await extractResponse.json();
        console.log(`✅ [BACKFILL] Successfully processed batch. AI Extracted ${result.nodesCreated || 0} nodes.`);

        return new Response(JSON.stringify({
            success: true,
            message: `Batch complete. Processed ${sourceIds.length} sources.`,
            stats: {
                nodesCreated: result.nodesCreated || 0,
                edgesCreated: result.edgesCreated || 0,
                errors: result.errorCount || 0,
                debug_title: result.debug_title || "Unknown",
                debug_source_id: result.debug_source_id || "None",
                debug_diagnostic: result.debug_diagnostic || "No data",
                debug_finalTextLength: result.debug_finalTextLength || 0,
                debug_scout: result.debug_scout || "No scout data"
            }
        }), { headers: corsHeaders });

    } catch (err: any) {
        console.error("❌ [BACKFILL] Global Error:", err.message);
        return new Response(JSON.stringify({
            success: false,
            error: "Backfill Controller Error",
            message: err.message,
            stack: err.stack
        }), { status: 500, headers: corsHeaders });
    }
});
