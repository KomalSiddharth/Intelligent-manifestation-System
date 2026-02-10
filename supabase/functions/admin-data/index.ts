
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
        const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        console.log(`[Admin Data] Starting... Action: ${req.method}`);

        if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
            throw new Error("Missing Supabase environment variables in Edge Function");
        }

        const supabaseClient = createClient(
            SUPABASE_URL,
            SERVICE_ROLE_KEY,
            {
                global: {
                    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
                },
            }
        )

        // PARSE BODY ONCE
        const body = await req.json().catch(() => ({}));
        const { action, limit = 5000, offset = 0, profileId, status, folderId, userId, severity } = body;

        console.log(`[Admin Data] Action Identifier: ${action}`, { limit, offset, profileId, folderId, status, userId });

        let result;

        if (action === 'get_audience') {
            console.log(`[get_audience] Fetching audience. profileId: ${profileId}, status: ${status}`);
            let query = supabaseClient
                .from('audience_users')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1)

            // Apply filters if provided, but default to showing ALL if not
            if (profileId && profileId !== 'all') {
                query = query.or(`profile_id.eq.${profileId},profile_id.is.null`)
            }

            if (status && status !== 'all') {
                if (status === 'active') {
                    query = query.gt('message_count', 0).neq('status', 'revoked');
                } else if (status === 'invited') {
                    query = query.eq('message_count', 0).neq('status', 'revoked');
                } else if (status === 'revoked') {
                    query = query.eq('status', 'revoked');
                }
            }

            const { data, count, error } = await query
            if (error) throw error
            console.log(`[get_audience] Returning ${data?.length} users.`);
            result = { data, count }
        }

        else if (action === 'get_content') {
            console.log(`[get_content] Fetching content. profileId: ${profileId}, folderId: ${folderId}`);
            // 1. Fetch Knowledge Sources (with batching to bypass 1000 row limit)
            const allKsItems = [];
            let hasMore = true;
            let currentOffset = offset;
            const batchSize = 1000;
            let loops = 0;
            let totalKsCount = 0;

            console.log(`[get_content] Starting fetch loop. Limit: ${limit}, Offset: ${offset}`);

            while (hasMore && allKsItems.length < limit && loops < 10) {
                let queryKS = supabaseClient
                    .from('knowledge_sources')
                    .select('*', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range(currentOffset, currentOffset + batchSize - 1)

                if (folderId) queryKS = queryKS.eq('folder_id', folderId)

                if (profileId && profileId !== 'all') {
                    queryKS = queryKS.or(`profile_id.eq.${profileId},profile_id.is.null`)
                }

                const { data: ksData, count: ksCount, error: ksError } = await queryKS
                if (ksError) throw ksError

                if (ksData && ksData.length > 0) {
                    allKsItems.push(...ksData);
                    currentOffset += ksData.length;
                    totalKsCount = ksCount || 0;

                    // If we got fewer than batchSize, we are done
                    if (ksData.length < batchSize) hasMore = false;
                } else {
                    hasMore = false;
                }
                loops++;
            }

            console.log(`[get_content] Fetched ${allKsItems.length} items from Knowledge Sources.`);

            // 2. Fetch Content Items (Legacy)
            const { data: ciData, error: ciError } = await supabaseClient
                .from('content_items')
                .select('*')
                .limit(100)

            if (ciError) console.error("CI Error", ciError)

            // Normalize
            const items = []

            allKsItems.forEach((item: any) => {
                items.push({
                    id: item.id,
                    title: item.title,
                    type: item.source_type || 'text',
                    source_type: item.source_type || 'text',
                    word_count: item.word_count || 0,
                    file_url: item.source_url,
                    folder_id: item.folder_id,
                    status: 'active',
                    uploaded_at: item.created_at,
                    metadata: {},
                    isOwnContent: true
                })
            })

            if (ciData) {
                ciData.forEach((item: any) => {
                    items.push({
                        id: item.id,
                        title: item.title,
                        type: item.source_type,
                        source_type: item.source_type,
                        word_count: item.word_count || 0,
                        file_url: item.file_url,
                        folder_id: item.folder_id,
                        status: item.status || 'active',
                        uploaded_at: item.uploaded_at,
                        metadata: item.metadata || {},
                        isOwnContent: true
                    })
                })
            }

            result = { data: items, count: (totalKsCount || 0) + (ciData?.length || 0) }
        }

        else if (action === 'get_profiles') {
            const { data, error } = await supabaseClient
                .from('mind_profile')
                .select('*')
                .order('is_primary', { ascending: false })
                .order('updated_at', { ascending: false })

            if (error) throw error
            result = { data }
        }

        else if (action === 'get_profile') {
            console.log(`[get_profile] Fetching profile. profileId: ${profileId}`);
            let query = supabaseClient.from('mind_profile').select('*')

            if (profileId) {
                query = query.eq('id', profileId)
            } else {
                query = query.order('is_primary', { ascending: false }).order('updated_at', { ascending: false })
            }

            const { data, error } = await query.limit(1).maybeSingle()
            if (error) throw error
            result = { data }
        }

        else if (action === 'get_stats') {
            console.log(`[get_stats] Fetching stats. profileId: ${profileId}`);
            // Get total counts
            const { count: userCount } = await supabaseClient
                .from('audience_users')
                .select('*', { count: 'exact', head: true })

            const { count: contentCount } = await supabaseClient
                .from('knowledge_sources')
                .select('*', { count: 'exact', head: true })

            const { data: wordData } = await supabaseClient.rpc('get_total_knowledge_stats', {
                p_profile_id: profileId || null
            })

            result = {
                userCount,
                contentCount,
                totalWords: wordData?.[0]?.total_words || 0
            }
        }

        else if (action === 'get_emotional_history') {
            console.log(`[get_emotional_history] Fetching history for user: ${userId}`);
            const { data, error } = await supabaseClient
                .from('user_emotional_history')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit)

            if (error) throw error
            result = { data }
        }

        else if (action === 'get_alerts') {
            console.log(`[get_alerts] Fetching alerts. status: ${status}, severity: ${severity}`);
            let query = supabaseClient
                .from('admin_alerts')
                .select('*, audience_users!inner(name, email)')
                .order('created_at', { ascending: false })

            if (status !== 'all') query = query.eq('status', status)
            if (severity && severity !== 'all') query = query.eq('severity', severity)

            const { data, error } = await query
            if (error) throw error
            result = { data }
        }

        else {
            throw new Error(`Unknown action: ${action}`)
        }

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )

    } catch (error: any) {
        console.error("Admin Data Error:", error)
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            },
        )
    }
})
