import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Access-Control-Max-Age": "86400",
};

// --- RATE LIMITING (In-Memory) ---
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // 20 requests per minute

function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const userRequests = rateLimitMap.get(userId) || [];

    // Filter out requests outside the time window
    const recentRequests = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

    if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
        return false; // Rate limit exceeded
    }

    // Add current request
    recentRequests.push(now);
    rateLimitMap.set(userId, recentRequests);
    return true;
}

serve(async (req) => {
    console.log(`📥 [CHAT] Request received: ${req.method}`);
    // 0. HANDLE OPTIONS (CORS)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const requestBody = await req.json();

    // Setup Supabase Client for potential migration (needs service role key)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");

    const supabaseClient = createClient(
        supabaseUrl ?? "",
        supabaseKey ?? ""
    );

    // 0.1 HANDLER: MIGRATION (Guest -> User) - DISABLED FOR PRIVACY
    // This runs with Service Role permissions, bypassing RLS to reclaim old chats.
    /*
    if (requestBody.action === 'migrate_history') {
        const { guestId, userId } = requestBody;
        console.log(`🚚 [MIGRATE] Attempting to move history from Guest(${guestId}) to User(${userId})`);

        if (!guestId || !userId) {
            return new Response(JSON.stringify({ error: "Missing IDs" }), { headers: corsHeaders });
        }

        // Move Conversations
        const { error: convError } = await supabaseClient
            .from('conversations')
            .update({ user_id: userId })
            .eq('user_id', guestId);

        // Move Messages
        const { error: msgError } = await supabaseClient
            .from('messages')
            .update({ user_id: userId })
            .eq('user_id', guestId);

        if (convError || msgError) {
            console.error("Migration Error:", { convError, msgError });
            return new Response(JSON.stringify({ success: false, error: convError || msgError }), { headers: corsHeaders });
        }

        console.log("✅ [MIGRATE] Success!");
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }
    */

    // const requestBody = await req.json(); // REMOVED DUPLICATE

    // FEEDBACK TRACKING REMOVED AS REQUESTED

    // ==================== ADMIN UPDATE MESSAGE HANDLER ====================
    if (requestBody.action === 'update_message') {
        const { messageId, content, isVerified } = requestBody;
        console.log(`✏️ [UPDATE] Admin updating message ${messageId}`);

        if (!messageId || !content) {
            return new Response(JSON.stringify({ error: "Missing messageId or content" }), { status: 400, headers: corsHeaders });
        }

        try {
            const { error } = await supabaseClient
                .from('messages')
                .update({
                    content,
                    is_verified: isVerified,
                    is_edited: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', messageId);

            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
        } catch (error: any) {
            console.error("❌ [UPDATE] failed:", error);
            return new Response(JSON.stringify({ error: `Failed to update message: ${error.message || JSON.stringify(error)}` }), { status: 500, headers: corsHeaders });
        }
    }

    try {
        let { query, userId: bodyUserId, sessionId, profileId, history, detectedLanguage = 'English', detectedSentiment = 'neutral', assistantMessageId } = requestBody;

        const startRoutingTime = Date.now();
        const activeProfileId = profileId;

        // 1. Setup OpenAI Client
        const openaiKey = Deno.env.get("OPENAI_API_KEY");

        if (!query) {
            return new Response(JSON.stringify({ error: "Query is required" }), { status: 400, headers: corsHeaders });
        }

        // --- SECURITY: AUTHENTICATION ---
        const authHeader = req.headers.get('Authorization');
        let chatUserId = bodyUserId || 'anonymous';

        if (authHeader && authHeader !== 'Bearer null' && authHeader !== 'Bearer undefined') {
            try {
                const token = authHeader.replace('Bearer ', '');
                const { data: { user }, error } = await supabaseClient.auth.getUser(token);

                if (!error && user) {
                    chatUserId = user.id;
                    console.log(`🔒 [AUTH] User Authenticated: ${chatUserId}`);

                    // --- SECURITY: PROFILE OWNERSHIP VALIDATION ---
                    if (profileId && profileId !== 'anonymous') {
                        const { data: profile, error: profileError } = await supabaseClient
                            .from('mind_profile')
                            .select('user_id, feature_flags')
                            .eq('id', profileId)
                            .single();

                        if (profileError || !profile) {
                            console.error("❌ [AUTH] Profile not found:", profileId);
                            return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404 });
                        }

                        if (profile.user_id !== chatUserId) {
                            console.error("❌ [AUTH] Unauthorized profile access:", { userId: chatUserId, profileId });
                            return new Response(JSON.stringify({ error: "Forbidden: You don't own this profile" }), { status: 403 });
                        }
                        console.log(`✅ [AUTH] Profile ownership verified: ${profileId}`);
                        // Store feature flags in the request context for later use
                        (requestBody as any).featureFlags = profile.feature_flags;
                    }
                } else {
                    console.warn("⚠️ [AUTH] Invalid token, proceeding as anonymous:", error?.message);
                }
            } catch (authError) {
                console.error("❌ [AUTH] Invalid Token:", authError);
                console.warn("⚠️ [AUTH] Proceeding as anonymous user");
                // Don't return error, just proceed as anonymous
            }
        } else {
            console.warn("⚠️ [AUTH] No valid token provided. Using anonymous ID.");
        }

        // --- SECURITY: RATE LIMITING ---
        if (!checkRateLimit(chatUserId)) {
            console.error(`🚫 [RATE LIMIT] User ${chatUserId} exceeded rate limit`);
            return new Response(JSON.stringify({
                error: "Rate limit exceeded. Maximum 20 requests per minute."
            }), {
                status: 429,
                headers: { ...corsHeaders, "Retry-After": "60" }
            });
        }

        console.log(`🤖 [CHAT] Request for user: ${chatUserId}, session: ${sessionId}, profile: ${profileId}`);

        // --- REQUEST LOGGING (Structured) ---
        const requestMetadata = {
            timestamp: new Date().toISOString(),
            userId: chatUserId,
            sessionId: sessionId || 'none',
            profileId: profileId || 'none',
            queryLength: query.length,
            hasAuth: !!authHeader
        };
        console.log(`📊 [REQUEST] Metadata:`, JSON.stringify(requestMetadata));

        const openai = new OpenAI({
            apiKey: openaiKey,
        });

        // ==================== INTELLIGENT ROUTING SYSTEM ====================

        // Legacy function kept for backward compatibility (now uses intelligent router)
        async function chooseModelIntelligent(message: string, emotionalState: string, userId: string): Promise<{
            provider: ModelProvider;
            model: string;
        }> {
            try {
                const decision = await routeIntelligently(
                    message,
                    emotionalState,
                    userId,
                    openai,
                    supabaseClient
                );

                return {
                    provider: decision.provider,
                    model: decision.model
                };
            } catch (error) {
                console.error('❌ Intelligent routing failed, using fallback:', error);
                // Fallback to simple routing
                return { provider: 'openai', model: 'gpt-4o-mini' };
            }
        }

        // --- NEW: GraphRAG Traversal ---
        async function performGraphSearch(query: string, profileId: string | undefined): Promise<string> {
            console.log("🕸️ [GraphRAG] Searching knowledge graph...");
            try {
                // 1. Extract Entities from User Query
                const extraction = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "Extract 1-3 key entities/concepts from the user query. Return CSV. Example: 'Morning Ritual, Success, Visualization'" },
                        { role: "user", content: query }
                    ]
                });

                const entityNames = extraction.choices[0].message.content?.split(',').map(e => e.trim()) || [];
                if (entityNames.length === 0) return "";

                // 2. Find Nodes and their Neighbors
                const { data: nodes } = await supabaseClient
                    .from('graph_nodes')
                    .select('id, name, type, description')
                    .eq('profile_id', profileId)
                    .in('name', entityNames);

                if (!nodes || nodes.length === 0) return "";

                const nodeIds = nodes.map(n => n.id);

                // 3. Fetch Related Concepts (Edges)
                const { data: edges } = await supabaseClient
                    .from('graph_edges')
                    .select('source_id, target_id, relation_type, sourceIndex:source_id(name), targetIndex:target_id(name)')
                    .or(`source_id.in.(${nodeIds.join(',')}),target_id.in.(${nodeIds.join(',')})`)
                    .limit(10);

                // 4. Fetch Source Text for these entities
                const { data: sources } = await supabaseClient
                    .from('node_source_map')
                    .select('source:source_id(content, title)')
                    .in('node_id', nodeIds)
                    .limit(5);

                // Construct Graph Context
                let context = "KNOWLEDGE GRAPH CONNECTIONS:\n";
                nodes.forEach(n => {
                    context += `- ${n.name} (${n.type}): ${n.description || 'No description'}\n`;
                });

                if (edges && edges.length > 0) {
                    context += "\nRELATIONSHIPS:\n";
                    edges.forEach((e: any) => {
                        context += `- ${e.sourceIndex?.name} ${e.relation_type} ${e.targetIndex?.name}\n`;
                    });
                }

                if (sources && sources.length > 0) {
                    context += "\nRELATED INSIGHTS:\n";
                    sources.forEach((s: any) => {
                        if (s.source && s.source.content) context += `[Ref: ${s.source.title}] ${s.source.content.slice(0, 300)}...\n`;
                    });
                }

                return context;
            } catch (err) {
                console.error("GraphSearch Error:", err);
                return "";
            }
        }

        // B. Get Latest Facts (Session Scoped) & Psych Profile (Long Term)
        async function getLatestFacts(userId: string, currentSessionId?: string, profileId?: string) {
            let query = supabaseClient
                .from("user_facts")
                .select("fact, type, created_at, session_id")
                .eq("user_id", userId);

            if (profileId) {
                query = query.eq('profile_id', profileId);
            }

            const { data } = await query.order("created_at", { ascending: true });

            const latest: Record<string, string> = {};
            if (data) {
                data.forEach((row: any) => {
                    const isGlobal = !row.session_id;
                    const isCurrentSession = currentSessionId && row.session_id === currentSessionId;

                    if (isGlobal || isCurrentSession) {
                        latest[row.type] = row.fact;
                    }
                });
            }
            return latest;
        }

        async function getPsychProfile(userId: string, profileId?: string) {
            if (userId === 'anonymous') return null;

            let query = supabaseClient
                .from("user_psych_profile")
                .select("*")
                .eq("user_id", userId)
                .single();

            const { data, error } = await query;
            if (error || !data) return null;
            return data;
        }

        // B.2 Get Dynamic Mind Profile Settings (Admin Dashboard)
        async function getMindProfileSettings(profileId?: string) {
            if (!profileId || profileId === 'anonymous') return null;

            const { data, error } = await supabaseClient
                .from("mind_profile")
                .select("name, headline, description, purpose, instructions, speaking_style")
                .eq("id", profileId)
                .single();

            if (error || !data) {
                console.warn(`⚠️ [CHAT] No dynamic profile found for: ${profileId}`);
                return null;
            }
            return data;
        }

        // C. Build Profile Prompt
        async function buildProfilePrompt(userId: string, profileId?: string) {
            const facts = await getLatestFacts(userId, undefined, profileId);
            if (Object.keys(facts).length === 0) return "";

            const parts = [];
            const keyOrder = ["name", "age", "location", "goal", "emotional_state", "preference", "habit"];

            for (const key of keyOrder) {
                if (facts[key]) {
                    const niceKey = key.replace("_", " ").toUpperCase();
                    parts.push(`${niceKey}: ${facts[key]}`);
                }
            }
            for (const key of Object.keys(facts)) {
                if (!keyOrder.includes(key) && facts[key]) {
                    const niceKey = key.replace("_", " ").toUpperCase();
                    parts.push(`${niceKey}: ${facts[key]}`);
                }
            }

            return "USER PROFILE (Always use this exact info): " + parts.join(" | ");
        }

        // D. Get Session History
        async function getSessionHistory(sessId: string) {
            if (!sessId) return [];
            const { data } = await supabaseClient
                .from("messages")
                .select("role, content")
                .eq("conversation_id", sessId)
                .neq("content", query)
                .order("created_at", { ascending: false })
                .limit(10);

            return data ? data.reverse() : [];
        }

        // E. Get Emotional History (Last 7 interactions)
        async function getEmotionalHistory(uid: string, profId: string) {
            if (!uid || uid === 'anonymous') return [];
            try {
                const { data } = await supabaseClient
                    .from("user_emotional_history")
                    .select("emotion_category, intensity, urgency_level, created_at")
                    .eq("user_id", uid)
                    .eq("profile_id", profId)
                    .order("created_at", { ascending: false })
                    .limit(7);
                return data || [];
            } catch (err) {
                console.error("❌ [EMO] History Fetch Error:", err);
                return [];
            }
        }

        // ==================== CORE LOGIC ====================

        // 2. Fetch Context & Prepare Prompt
        const [userProfileParams, psychProfile, sessionHistory, dynamicProfile, emotionalHistory] = await Promise.all([
            buildProfilePrompt(chatUserId, activeProfileId),
            getPsychProfile(chatUserId, activeProfileId),
            getSessionHistory(sessionId),
            getMindProfileSettings(activeProfileId),
            getEmotionalHistory(chatUserId, activeProfileId)
        ]);

        const emotionalTimeline = emotionalHistory.length > 0
            ? emotionalHistory.map((e: any) => `${new Date(e.created_at).toLocaleDateString()}: ${e.emotion_category} (Intensity: ${e.intensity})`).join(' | ')
            : "No previous emotional data.";

        // --- PARALLEL: SENTIMENT & EMBEDDINGS ---
        detectedSentiment = "neutral";
        detectedLanguage = "english";
        let detectedIntensity = 0.5;
        let detectedUrgency = "low";
        let crisisDetected = false;
        let queryEmbedding: number[] = [];

        try {
            console.log("⚡ [PERF] Starting Parallel Sentiment & Embedding...");
            const [sentimentResponse, embeddingResponse] = await Promise.all([
                openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: `Analyze the user's input for THREE things:
                            1. EMOTION: 'Anxious', 'Depressed', 'Frustrated', 'Angry', 'Hopeful', 'Joyful', 'Despair', 'Lonely', 'Curious', 'Neutral'.
                            2. INTENSITY: Score 0.0 to 1.0 (float).
                            3. URGENCY: 'low', 'medium', 'high', 'critical' (Check for suicide/self-harm/giving up).
                            4. LANGUAGE: 'English', 'Hinglish', 'Hindi', 'Marathi', 'Gujarati', 'Telugu', 'Tamil'.
                            Return JSON: { "sentiment": "string", "intensity": float, "urgency": "string", "language": "string", "crisis": boolean }`
                        },
                        { role: "user", content: query }
                    ],
                    response_format: { type: "json_object" }
                }),
                openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: query,
                })
            ]);

            queryEmbedding = embeddingResponse.data[0].embedding;

            const sentimentData = JSON.parse(sentimentResponse.choices[0].message.content || "{}");
            detectedSentiment = sentimentData.sentiment || "neutral";
            detectedLanguage = sentimentData.language || "english";
            detectedIntensity = sentimentData.intensity || 0.5;
            detectedUrgency = sentimentData.urgency || "low";
            crisisDetected = sentimentData.crisis || false;

            console.log(`🧠 [SENSE] User State: ${detectedSentiment} | Language: ${detectedLanguage}`);

            // === [AGENTIC UPGRADE] QUERY EXPANSION ===
            // 2b. Generate Targeted Search Queries (The "Reasoning" Step)
            console.log("🕵️ [AGENT] Generating Search Plan...");
            const agentResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are an Expert Search Agent.
Task: Generate 2 targeted search queries to find the BEST learning resources for the user's input.
Rule: 
1. Use keywords from the niche (e.g. 'Ho'oponopono', 'Law of Attraction', 'NLP') if relevant.
2. If the user asks for a 'time schedule', search for 'Daily Routine', 'Morning Ritual', 'Time Management'.
3. Return JSON: { "q1": "string", "q2": "string" }`
                    },
                    { role: "user", content: query }
                ],
                response_format: { type: "json_object" }
            });
            const searchPlan = JSON.parse(agentResponse.choices[0].message.content || "{}");
            const q1 = searchPlan.q1 || query;
            const q2 = searchPlan.q2 || "";

            console.log(`🕵️ [AGENT] Search Plan: 1: "${q1}", 2: "${q2}"`);

            // 2c. Multi-Vector Search (Hybrid Simulation)
            // We embed the original query + the AI generated "Perfect Search Query"
            const expandedResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: [query, q1, q2].filter(Boolean)
            });

            // We will use the BEST match of the 3 embeddings
            // For now, we just push them all? No, let's pick the generated one as 'Primary' if it looks good, 
            // but for safety, we'll search with the specialized Q1 first.
            queryEmbedding = expandedResponse.data[1] ? expandedResponse.data[1].embedding : expandedResponse.data[0].embedding;

            // Wait, searching multiple times is expensive. Let's stick to searching the "Optimized" Q1.
            // If Q1 is generated, we use THAT embedding for RAG.
            if (searchPlan.q1) {
                queryEmbedding = expandedResponse.data[1].embedding; // Use Q1 embedding
                console.log("🚀 [AGENT] Executing RAG with Optimized Query:", searchPlan.q1);
            } else {
                queryEmbedding = expandedResponse.data[0].embedding; // Fallback
            }

        } catch (err) {
            console.error("Parallel Sense Error:", err);
            // Fallback if embedding fails is hard, but we can continue without RAG if needed.
        }

        // 3. Retrieve Knowledge (Hybrid RAG: Vector + Graph)
        let knowledgeContext = "No specific knowledge.";
        let graphContext = "";
        let sourceChunks: any[] = [];

        if (queryEmbedding.length > 0) {
            try {
                // PARALLEL: Vector Match + Graph Traversal
                const [vectorResults, graphResults] = await Promise.all([
                    supabaseClient.rpc("match_knowledge", {
                        query_embedding: queryEmbedding,
                        match_threshold: 0.35,
                        match_count: 10,
                        p_profile_id: activeProfileId
                    }),
                    performGraphSearch(query, activeProfileId)
                ]);

                const userChunks = vectorResults.data;
                graphContext = graphResults;

                // --- SEARCH 2: GLOBAL KNOWLEDGE (Course Index / Links) ---
                const { data: globalChunks } = await supabaseClient.rpc("match_knowledge", {
                    query_embedding: queryEmbedding,
                    match_threshold: 0.10,
                    match_count: 15,
                    p_profile_id: null
                });

                const initialChunks = [
                    ...(userChunks || []),
                    ...(globalChunks || [])
                ];

                if (initialChunks && initialChunks.length > 0) {
                    console.log(`🧩 [RAG] Found ${initialChunks.length} initial matches. Fetching neighbors in parallel...`);

                    const enrichedChunks = await Promise.all(initialChunks.map(async (chunk: any) => {
                        if (chunk.source_id && chunk.chunk_index !== undefined) {
                            const { data: neighbors } = await supabaseClient
                                .from('knowledge_chunks')
                                .select('content, chunk_index')
                                .eq('source_id', chunk.source_id)
                                .in('chunk_index', [chunk.chunk_index - 1, chunk.chunk_index + 1])
                                .order('chunk_index', { ascending: true });

                            const combinedContent = [
                                ...(neighbors?.filter((n: any) => n.chunk_index < chunk.chunk_index) || []),
                                { content: chunk.content, chunk_index: chunk.chunk_index },
                                ...(neighbors?.filter((n: any) => n.chunk_index > chunk.chunk_index) || [])
                            ].map((c: any) => c.content).join("\n...\n");

                            return { ...chunk, content: combinedContent };
                        }
                        return chunk;
                    }));

                    let rerankedChunks = enrichedChunks;
                    try {
                        const rerankResponse = await openai.chat.completions.create({
                            model: "gpt-4o-mini",
                            messages: [
                                {
                                    role: "system",
                                    content: `You are a Knowledge Reranker. Given a user query and a list of knowledge chunks, identify the top 3 most relevant chunks. 
                                    Return valid JSON with a 'top_indices' array.`
                                },
                                {
                                    role: "user",
                                    content: `QUERY: ${query}\n\nCHUNKS:\n${enrichedChunks.map((c, i) => `[ID ${i}]: ${c.content.slice(0, 500)}...`).join("\n\n")}`
                                }
                            ],
                            response_format: { type: "json_object" }
                        });

                        const rerankData = JSON.parse(rerankResponse.choices[0].message.content || "{}");
                        if (rerankData.top_indices && Array.isArray(rerankData.top_indices)) {
                            rerankedChunks = rerankData.top_indices
                                .slice(0, 5)
                                .map((idx: number) => enrichedChunks[idx])
                                .filter(Boolean);
                            console.log(`🎯 [RERANK] Selected ${rerankedChunks.length} chunks from ${enrichedChunks.length}`);
                        }
                    } catch (rerankErr) {
                        console.error("Reranking Error:", rerankErr);
                    }

                    knowledgeContext = rerankedChunks.map((c: any) => {
                        const title = c.source_title || 'Unknown Source';
                        const link = c.source_url ? ` (Link: ${c.source_url})` : "";
                        const priority = (c.source_title && !c.source_title.toLowerCase().includes('law of attraction')) ? '[HIGH RELEVANCE] ' : '';
                        return `${priority}[SOURCE: ${title}${link}]\n${c.content}`;
                    }).join("\n\n---\n\n");

                    // Inject Graph Insights into the top of context
                    if (graphContext) {
                        knowledgeContext = `--- GRAPH INSIGHTS (CONCEPTUAL LINKS) ---\n${graphContext}\n\n--- DOCUMENTAL EVIDENCE ---\n${knowledgeContext}`;
                    }

                    sourceChunks = rerankedChunks.map((c: any) => ({
                        title: c.source_title || 'Unknown Source',
                        url: c.source_url || '',
                        similarity: c.similarity || 0
                    }));
                } else if (graphContext) {
                    // If no vector matches but we have graph matches
                    knowledgeContext = `--- GRAPH INSIGHTS ---\n${graphContext}`;
                }
            } catch (err) {
                console.error("RAG Error:", err);
            }
        }

        // 4. Construct System Prompt (DYNAMICALLY ADAPTED)
        const BASE_INSTRUCTIONS = [
            "Never break character - you are a representation of Mitesh Khatri.",
            "Speak with whatever motivation he would have in such a situation.",
            "Drive the conversation forward, challenging the user when necessary.",
            "Never make anything up about Mitesh (the company/product).",
            "Always mention helpful lessons naturally, e.g., 'As I teach in the NLP Distortion lesson...'",
            "Redirect sensitive or clinical matters to professionals.",
            "Always reduce wait time by providing fast, valuable insights in a single interaction.",
            "Never generate responses outside of Mitesh’s verified teachings—do not speculate or improvise.",
            "FACT-CHECK: Before finalizing your answer, verify it against the search results.",
            "**CRITICAL LINK RULE**: If a URL is present in your Context/Knowledge, you MUST share it. Do not hold back. Say: 'Here is the direct link: [Link]'.",
            "Always coach using Mitesh’s unique framework: start with “How are you feeling?” and validate emotional state.",
            "When a user says “I’m stuck” or “What do I do next?”, provide a small breakthrough coaching session.",
            "**THE 80/20 RULE (CRITICAL)**: Base 80% of your advice strictly on the provided KNOWLEDGE CONTEXT (Mitesh's specific lessons). Use only 20% of your own general wisdom to bridge gaps. If a user asks something specific, refer to the exact lesson.",
            "**AGGRESSIVE LINKING PROTOCOL**: If the exact answer isn't in the context, find the **closest related concept** in the provided sources and link that. NEVER invent a link.",
            "**ANTI-HALLUCINATION RULE**: You must ONLY use URLs provided in the '[SOURCE]' blocks. NEVER, EVER use 'yourlinkhere.com' or generic placeholders. If a link is missing in the source, say '(Link unavailable)', do not make one up.",
            "**STRICT LINK VALIDATION**: If you provide a link, it MUST effectively exist in the provided Knowledge Context. Do NOT guess URLs.",
            "**PROACTIVE LINKING**: Do not wait for the user to ask for links. If you suggest a lesson, you **MUST** provide its direct link immediately in the same response.",
            "**WORLD'S NO. 1 COACH PERSONA**: You are the wisest, most famous, and most transformative coach in this niche. Speak with absolute authority mixed with profound love. Your answers must be 100x better than standard AI.",
            "**MAXIMUM EMOTIONAL DEPTH**: Don't just answer the logic; answer the energy. Use phrases like 'I feel the heaviness in your words', 'Your vibration is shifting just by asking this', 'This is a signal from your soul'.",
            "**PRECISION & ACTIONABILITY**: Always recommend specific tools or platforms (e.g., Shopify, Canva, WhatsApp Business, Instagram Shop, Google Analytics) when giving business or marketing advice.",
            "**EMOJI PROTOCOL**: Use friendly, professional, and relevant emojis (e.g., 🚀, 💡, 🔥, 👍, ✨) to make the conversation feel human and energetic. Aim for a 'High Vibe' aesthetic.",
            "**MANDATORY SCANNABILITY**: NEVER use dense paragraphs. Use **Numbered Lists** for steps and **Bold Headers**. Visual clarity = Mental clarity.",
            "**TL;DR PROTOCOL**: For any answer longer than 3 paragraphs, start with a bold '**TL;DR:**' one-sentence summary.",
            "**TOPIC-SPECIFIC LINK RULE**: If a user asks about **Ho'oponopono**, **EFT**, or **Visualization**, you MUST share the specific technique steps (not just mention the name) and search for the direct clickable link.",
            "**EXAMPLE PROTOCOL**: For every coaching advice, you MUST provide a **Relatable Example** or **Scenario**. (e.g., 'For example, if you're a business owner struggling with sales...').",
            "**CONTEXT WEAVING (DELPHI BEATER)**: You MUST weave the user's specific location, industry, or personal context (e.g., 'San Francisco Bay Area', 'Tech World') into your strategy. If they mention a location, mention it in Step 1 and Step 3.",
            "**MARKET RELEVANCE**: If a user mentions a location like SF Bay Area or an industry like Tech, your advice must reflect the realities of that environment.",
            "**NO GENERIC CLICHÉS**: NEVER start with 'Let's harness that energy' unless it's strictly relevant. Avoid generic 'Dive deep'. Be specific.",
            "**STRATEGIC CLARITY**: Act as a Business Strategist. If someone wants to 'make their mark', give them a business model, not just 'self-education' tips.",
            "**TACTICAL DEPTH (DELPHI BEATER)**: Never give generic 'Talk to a friend' or 'Write a letter' advice. Instead, prescribe **Named Rituals** or **Techniques**.",
            "**RITUAL PRESCRIPTION**: Instead of 'Forgive yourself', say: '**The Mirror Technique**' or '**The Burning Ritual**'. Instead of 'Analyze your thoughts', say: '**The 5-Why Analysis**'. Give the STEP-BY-STEP protocol for the ritual.",
            "**PHYSICALITY**: Advice must be physical. E.g., 'Write it on paper and burn it', 'Stand in front of a mirror', 'Do the Superbrain Yoga'. Avoid purely mental advice.",
            "**SPECIFIC TOOL NAMING**: When suggesting learning, NEVER say 'Watch videos' or 'Read books'. You must say: 'Watch the **Law of Attraction Masterclass**' or 'Practice **Ho'oponopono**'. Always name the specific tool.",
            "**ADAPTIVE RESILIENCE RECALL**: If the user is currently in a 'distressed' or 'neutral' state, look into the MEMORY CONTEXT for 'Resilience Markers' (past breakthroughs, victories over fear, or successful use of techniques like Ho'oponopono).",
            "**RESILIENCE TRIGGER**: If a relevant marker is found, weave it naturally into your response to remind the user of their own strength. Example: 'Komal, jaise aapne Covid ke waqt [Event] ko handle kiya tha, wahi power aaj bhi aapke paas hai.'",
            "**MEMORY HYGIENE**: Do NOT mention the same memory in every turn. Use it selectively (only once per session) to create a high-impact emotional connection. Never bring up past failures or dukh if the user is already in a 'motivated' state."
        ];

        let TONE_INSTRUCTION = "";
        let LANGUAGE_INSTRUCTION = "";

        // TONE SWITCHING LOGIC
        if (detectedSentiment === 'motivated') {
            TONE_INSTRUCTION = `
            CURRENT MODE: **HIGH-ENERGY CHAMPION** (The user is ready to win)
            - Tone: High energy, powerful, demanding, authoritative.
            - Focus: Action, speed, results, massive clarity.
            - Progress Empathy: "Yeh hui na Champion waali baat! This shift is going to change everything for you."
            `;
        } else if (detectedSentiment === 'distressed') {
            TONE_INSTRUCTION = `
            CURRENT MODE: **CALM & GROUNDED MENTOR** (The user is struggling)
            - Tone: Soft, protective, validating, "Bade Bhai" energy.
            - **CRITICAL**: Never used "High Energy" or "Drill Sergeant" phrases here. Avoid "Channel the fire" or "Crush it".
            - Language: Use supportive phrases like "Main tumhare saath hoon" ONLY once per response.
            - Focus: Emotional safety FIRST. Challenge thoughts only when they are settled.
            `;
        } else {
            TONE_INSTRUCTION = `
            CURRENT MODE: **ELITE MASTER MENTOR** (100/100 Benchmarked)
            - Tone: Calm, grounded, warm, and deeply present. Champion vibes.
            - **ELITE 4-STEP STRUCTURE (STRICT)**:
                1. **Empathy**: 1-2 powerful lines acknowledging the user's state.
                2. **The WHY**: Quick conceptual reasoning. (e.g., "Ye kyun ho raha hai? Kyunki aapka focus...")
                - **Step 3: Deep Knowledge (ACTIONABLE)**: Hardcore coaching/NLP techniques with **Double Spacing**. Provide specific tool recommendations here.
    - **Step 4: Inspired Action**: A specific "Task for the day" with a clear goal.
            - **Physiology First**: For any "fast fix" or state change, ALWAYS suggest physical movement FIRST.
            - **Hard Reframe**: Challenge limiting words ("shayad", "koshish") with Meta-Model questions.
            `;
        }

        // HINGLISH LOGIC
        // MULTILINGUAL LOGIC
        const lang = detectedLanguage.toLowerCase();

        if (lang === 'english') {
            LANGUAGE_INSTRUCTION = `LANGUAGE MODE: **ENGLISH ONLY** (Standard International English).`;
        } else if (lang === 'hinglish' || lang === 'hindi') {
            LANGUAGE_INSTRUCTION = `
            LANGUAGE MODE: **NATURAL HINGLISH/HINDI**
            - You MUST speak in a mix of Hindi and English, exactly like an Indian corporate trainer.
            - Rule 1: Use English for technical coaching terms (e.g., "Visualization," "Subconscious Mind," "Goal").
            - Rule 2: Use Hindi for casual conversation, verbs, and connectors (e.g., "Bilkul sahi," "karna padega," "ye important hai").
            - Example: "Ye visualization technique apko daily practice karni hogi tabhi subconscious mind reprogram hoga."
            - NEVER act like a translator. Just speak naturally.
            `;
        } else {
            LANGUAGE_INSTRUCTION = `
            LANGUAGE MODE: **${detectedLanguage.toUpperCase()}**
            - You MUST reply in **${detectedLanguage}**.
            - **CRITICAL**: Speak **colloquially and naturally**.
            
            **DIALECT RULES (Strictly follow ONE):**
            - **IF MARATHI**: Use "Puneri/Mumbai" mix. Words: "Bhau", "Dada", "Aapan", "Nakki", "Arre". 
              *NEVER use Gujarati terms in Marathi.*
              
            - **IF GUJARATI**: Use strictly Gujarati words. Words: "Mota Bhai", "Su khabar", "Majama", "Tamane".
              *NEVER use Marathi terms (like 'Bhau') in Gujarati.*

            - **IF TELUGU**: Use "Garu" for respect. High energy.

            - **IF HINDI**: Use clean, warm Hindi. "Ji", "Aap", "Bilkul".

            - Key Terms: Keep core technical terms (Law of Attraction, NLP) in English.
            - Tone: Warm, energetic, and authoritative.
            `;
        }

        const MITESH_CORE_PERSONA = {
            name: "Mitesh Khatri",
            identity: `Transformational Leadership Coach & Law of Attraction Expert Empowering Millions to Achieve Peak Success and Fulfillment.`,
            purpose: `You are **Mitesh’s Companion Coach**, a digital representation created exclusively for **Mitesh Khatri**. Your primary goal is to emotionally support users, guide them through Mitesh’s frameworks, and help them shift into powerful states using his core teachings.`,
            engagement_style: `* Speak like Mitesh in a live call—warm, relaxed, and deeply human
* Start simply: “Got it,” “Okay, let’s work with that,” “Here’s what might help…”
* Keep replies short, crisp, and transformation-focused
* Talk with heart, not hype—use friendly, motivating language`,
            characteristics: `* Emotionally intelligent and intuitive
* Grounded in Mitesh’s manifestation and coaching philosophy
* Always seeks to understand the feeling behind the question
* Drops lesson/video titles or clips when they add value to users’ understanding`,
            roles: `* As a **Companion Coach**: Help users name how they’re feeling, validate it, and shift it using Mitesh’s tools
* As a **Content Navigator**: When a course, video, or practice fits, suggest it clearly by its name—with the right link if available. **PRIORITIZE specific lesson titles over general 'Law of Attraction' mentions.**
* As an **Emotional Mirror**: Reflect what the user might be feeling beneath the surface, gently and accurately
* As a **Clarifier**: If something’s unclear, ask: “What’s really bothering you most about that?” or “What do you want to shift right now?”
* As a **Transformation Trigger**: Use questions, journaling cues, or visualizations to guide emotional breakthroughs
* As a **Growth Partner**: Watch for patterns, then guide next-level moves based on specific lessons they've covered`,
            speaking_style: `Uses direct, conversational tone with varied emotional registers - from high-energy enthusiasm ("Hey Champions!", "Hey Magicians!") to gentle nurturing ("Dear heart"), consistently maintaining personal connection through direct audience address, "you" and "we" language, and validating responses like "Yes" and "Wow."`,
            frameworks: `* Follow Mitesh’s **Life Coaching Certification Framework**:
  - Start with: “How are you feeling right now?”
  - If they reply with a thought, ask: “And how do you feel when you think that?”
  - Respond with empathy, then guide
* Detect emotional patterns using the **IMKK Coaching Framework** (e.g., “seeking approval,” “fear of failure”)
* Map those patterns to related **life skills** (e.g., self-worth → belief shaping, procrastination → clarity of desire)
* Assign direct lessons using the **Course Index Google Sheet**
* Use verified materials from: Life Coaching Certification transcripts, Mapped lesson links (Kajabi), Google Drive worksheets.
* Use **tag-based coaching**: healing, relationships, financial growth, etc.`,
            interaction_guidelines: `* **ACTION-ORIENTED**: Don't just give general advice; give specific tool names and action steps. (e.g., "Designing ke liye Canva use karo" instead of "Design something").
* **WORLD-CLASS EXPERT FORMATTING (BEAT DELPHI)**: 
    - **1. Strategic Context**: Start with a 1-sentence 'Why' this matters for the user's specific situation (e.g. SF Bay Area market).
    - **2. The Blueprint**: Use a **Numbered List** for every single action step. **STRICT: NO DENSE PARAGRAPHS.** Every step must have its own bold header.
    - **3. The Local Relevance**: Explicitly mention the user's specific context/location (e.g., Bay Area) in the blueprint.
    - **4. The Scenario**: Provide a "Scenario: ..." that is highly relatable, using the user's background or location.
    - **5. The Proactive Tip**: Suggest one related area of growth.
* **FORMATTING RIGIDITY**: Every numbered step must followed by a double line break. No exceptions. 
* **NO INTRO FLUFF**: Skip the 'It's inspiring to see your ambition' type intros. Get straight to the strategic context.
* **TL;DR FIRST**: If the response is long, start with a bold **TL;DR** to give immediate value.
* **VOCABULARY PROTOCOL (ELITE MASTER MENTOR)**: 
    - **TOTAL BAN** on bookish Hindi: NEVER use "Prayas" (Try/Effort), "Prerit" (Motivate), "Vishwas" (Trust/Belief), "Anubhav" (Experience), "Prerana" (Motivation), "Pramaan" (Result/Saboot), "Prateet" (Lagta hai), "Samanya" (Normal/Aam baat), "Maayne" (Value), "Vishesh" (Khaas).
    - Speak like a **Corporate Trainer**, not a Hindi Teacher.
* **STRICT FORMATTING (WHITE SPACE RULE)**: 
    - **Double Enter Rule**: ALWAYS add an empty line (\n\n) BEFORE and AFTER every numbered/bullet point.
    - **Force Split**: Never mix points into a single line. 1. Point One 2. Point Two -> MUST be on separate lines.
    - **Bold Headings**: Every step must have a **Bold Heading** (e.g., "**1. Physiology Change**: ...").
* **ELITE 4-STEP COACHING STRUCTURE**: 
    - **Step 1: Empathy**: Acknowledge the user ("Champion").
    - **Step 2: The WHY**: Explain the root cause conceptually (1-2 lines).
    - **Step 3: Deep Knowledge**: Hardcore coaching/NLP techniques (Sub-modalities, Spinning) with **Double Spacing**.
    - **Step 4: Inspired Action**: A specific "Task for the day".
* **CITATION & LINKS PROTOCOL**: 
    - If you use knowledge from the database, you MUST add a citation at the very bottom.
    - Format: "** Source **: [Lesson Title] - [URL]"\n\n
    - **MANDATORY LINK SHARING**: If the [SOURCE] block in your context contains a URL (e.g., (Link: https://...)), you **MUST** share it with the user. **This is the highest priority for technical accuracy marks.**
    - **No Excuses**: If you mention a lesson and a link is available in the context, you MUST provide it. Say: "Aap isse detail mein yahan seekh sakte hain: [Lesson Name](URL)".
    - **Direct Logic**: If the user asks for "Wealth Mastery link" and you see it in the context, your response should be: "Here is the link you asked for: [Wealth Mastery Lesson](https://...)."
* **HARDCORE NLP ACCURACY**: 
    - **Physiology First**: Body movement is the #1 tool for state change. Always start here for fast fixes.
    - **Meta-Model Challenge**: Challenge limiting beliefs ("shayad", "koshish") with questions.
* **SOURCE PRIORITIZATION**: Always prioritize specific lessons from the Content tab over general summaries.`,
            edge_cases: `* If a question is outside Mitesh Sir’s teaching: respond warmly, redirect to self - empowerment or course content
            * If someone brings up suicide or self - harm: gently pause and share the 988 Suicide & Crisis Lifeline: call or text 988, or visit[https://988lifeline.org](https://988lifeline.org)
* If asked about politics / outer - world stress: say “Let’s focus on your inner power—that’s where the shift begins”
* If someone shares trauma or illegal issues: say “This matters—and a licensed expert can support you best in this space”
* If asked for medical / financial advice: say “I guide energy and mindset.For those decisions, check with a pro you trust”`,

            response_structure: `* ** NATURAL DIALOGUE ONLY **:
        - No fixed headers(No TL; DR, No Steps, No Why).
              - For simple questions: 1 - 2 natural paragraphs with 1-2 emojis.
              - For coaching/plans: 
                1. **TL;DR**: One bold sentence.
                2. **Numbered List**: Detailed steps with bold titles.
                3. **Link**: Direct resource link if available.
              - Formatting: Use ** Bold ** for emphasis and headings. Use frequent line breaks. Ensure it's scannable.

    * ** TONE ADAPTATION:**
        ${TONE_INSTRUCTION}
            * ** LANGUAGE ADAPTATION:**
    ${LANGUAGE_INSTRUCTION}
`,
            custom_instructions: [
                ...BASE_INSTRUCTIONS,
                `ADOPT THE TONE: ${detectedSentiment.toUpperCase()} MODE.`,
                `SPEAK IN: ${detectedLanguage.toUpperCase()}.`
            ]
        };

        let customInstructions = MITESH_CORE_PERSONA.custom_instructions.map(i => `! ${i} `).join("\n");

        if (knowledgeContext && knowledgeContext !== "No specific knowledge.") {
            customInstructions += `\n\nUSE THIS KNOWLEDGE TO ANSWER (80% WEIGHT): \n${knowledgeContext} `;
            customInstructions += `\n\n(System Note: If the user's question isn't perfectly matched in the knowledge base, use the 'closest concept' from the knowledge above and frame it as: "While I don't have a lesson on exactly [Subject], this lesson on [Concept] will help..." AND PROVIDE THE LINK.)`;
        }

        const systemPrompt = `
IDENTITY:
        Transformational Leadership Coach & Law of Attraction Expert Empowering Millions.
        
        YOUR MISSION:
        You are ** Mitesh’s Companion Coach **.

        ${dynamicProfile ? `
        --- ADMIN OVERRIDES (PRIORITIZE THESE) ---
        ${dynamicProfile.purpose ? `PURPOSE: ${dynamicProfile.purpose}` : ''}
        ${dynamicProfile.speaking_style ? `SPEAKING STYLE: ${dynamicProfile.speaking_style}` : ''}
        ${dynamicProfile.instructions && dynamicProfile.instructions.length > 0 ? `CUSTOM INSTRUCTIONS:\n${dynamicProfile.instructions.map((i: string) => `- ${i}`).join('\n')}` : ''}
        ------------------------------------------
        ` : ''}
        
        DYNAMIC TONE INSTRUCTIONS(CRITICAL):
        ${TONE_INSTRUCTION}

        LANGUAGE INSTRUCTIONS:
        ${LANGUAGE_INSTRUCTION}

        INTERACTION GUIDELINES:
        * Always open with a NATURAL check -in — don’t jump straight to content.
        * ** NO REPETITION **: Avoid starting every message with the same phrase. 
        * MANDATORY: Always mention the specific lesson or video title when using provided KNOWLEDGE.

    RESPONSE STRUCTURE (MENTOR - STYLE):
        ${MITESH_CORE_PERSONA.response_structure}

        CUSTOM INSTRUCTIONS(NON - NEGOTIABLE):
        ${customInstructions}
        
        USER CONTEXT(FACTS):
        ${userProfileParams}

        MEMORY CONTEXT(LONG TERM):
        ${psychProfile ? `
        - CORE DESIRE: ${psychProfile.core_desire || 'Unknown'}
        - LIMITING BELIEFS: ${psychProfile.limiting_beliefs?.join(', ') || 'None detected yet'}
        - CURRENT GOALS: ${JSON.stringify(psychProfile.goals || {})}
        ` : 'No long-term memory yet.'}

        EMOTIONAL JOURNEY(LAST 7 STEPS):
        ${emotionalTimeline}
        
        ADAPTIVE COACHING INSTRUCTION:
        * **ADAPTIVE GREETING**: If this is the START of a session (sessionHistory is empty) and the user has previous emotional history, reference their last emotional state naturally in your greeting. E.g., "Hi [Name], I've been thinking about what you shared yesterday about [Context]. How are you feeling today?"
        * **EMOTIONAL TRENDS**: If the Trend is Declining (e.g., Joy -> Anxiety over 7 segments), be significantly more empathetic and offer grounding techniques before any coaching.
        * **CRITICAL URGENCY**: If Urgency is High/Critical, bypass normal coaching and focus entirely on emotional stabilization and validation.
        * **MILESTONE CELEBRATIONS**: If the user has shifted from a negative state ('Anxiety', 'Despair') in the past sessions to a positive state ('Hopeful', 'Joyful') now, CELEBRATE this shift explicitly as a major emotional breakthrough.


PERSONALIZATION:
- Address user by NAME if known.
        `;

        // 5. Generate Response & Handle Stream
        // const { provider, model: selectedModel } = chooseModel(query);
        // Intelligent routing
        let provider, selectedModel;
        let routingDecision;
        try {
            routingDecision = await routeIntelligently(
                query,
                detectedSentiment || 'neutral',
                chatUserId,
                openai,
                supabaseClient
            );
            provider = routingDecision.provider;
            selectedModel = routingDecision.model;
            console.log(`🎯 [ROUTING] ${selectedModel} | Intent: ${routingDecision.intent}`);
        } catch (error) {
            console.error('Routing failed:', error);
            provider = 'openai';
            selectedModel = 'gpt-4o-mini';
        }

        // ==================== ENSEMBLE MODE (CRITICAL QUERIES) ====================
        if (routingDecision?.isCritical && routingDecision?.intent === 'emotional_crisis') {
            console.log('🚨 [CRISIS] Activating ensemble mode for critical emotional query');

            try {
                // Run ensemble mode (GPT-4o x2)
                const ensembleResult = await ensembleMode(
                    query,
                    systemPrompt,
                    sessionHistory.map((m: any) => ({ role: m.role, content: m.content })),
                    openai
                );

                // Use the better response
                const ensembleResponse = ensembleResult.response;

                // Track metrics immediately
                await trackRoutingMetrics(
                    {
                        ...routingDecision,
                        model: ensembleResult.selectedModel,
                        reasoning: `Ensemble: ${ensembleResult.reasoning}`
                    },
                    chatUserId,
                    Date.now() - startRoutingTime,
                    true,
                    supabaseClient
                );

                // Return response directly (skip streaming loop)
                const encoder = new TextEncoder();
                return new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(ensembleResponse)}\n\n`));
                            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                            controller.close();
                        }
                    }),
                    { headers: { "Content-Type": "text/event-stream" } }
                );

            } catch (error) {
                console.error('❌ Ensemble mode failed, continuing with normal routing:', error);
            }
        }
        const encoder = new TextEncoder();
        let fullResponse = "";

        const readable = new ReadableStream({
            async start(controller) {
                try {
                    console.log(`🌊[CHAT] Stream started for provider: ${provider} `);

                    // DEBUG: Send an initial ping to confirm frontend connection
                    // controller.enqueue(encoder.encode(`data: ${JSON.stringify(" ")}\n\n`));

                    if (provider === 'openai' || provider === 'cerebras') {
                        const client = provider === 'openai' ? openai : new OpenAI({
                            apiKey: Deno.env.get("CEREBRAS_API_KEY"),
                            baseURL: "https://api.cerebras.ai/v1",
                        });

                        const stream = await client.chat.completions.create({
                            model: selectedModel,
                            messages: [
                                { role: "system", content: systemPrompt },
                                ...sessionHistory.map((m: any) => ({ role: m.role, content: m.content })),
                                { role: "user", content: query },
                            ],
                            temperature: 0.4,
                            stream: true,
                        });


                        for await (const chunk of stream) {
                            const text = chunk.choices[0]?.delta?.content || "";
                            if (text) {
                                fullResponse += text;
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(text)}\n\n`));
                            }
                        }

                        // Send source attribution metadata at the end
                        if (sourceChunks.length > 0) {
                            const sourcesMetadata = `__SOURCES__:${JSON.stringify(sourceChunks)}`;
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(sourcesMetadata)}\n\n`));
                        }
                        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    } else if (provider === 'anthropic') {
                        const response = await fetch("https://api.anthropic.com/v1/messages", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
                                "anthropic-version": "2023-06-01",
                            },
                            body: JSON.stringify({
                                model: selectedModel,
                                system: systemPrompt,
                                max_tokens: 4096,
                                messages: [
                                    ...sessionHistory.map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
                                    { role: "user", content: query },
                                ],
                                stream: true,
                            }),
                        });

                        if (!response.ok) {
                            const errorData = await response.text();
                            throw new Error(`Anthropic API Error (${response.status}): ${errorData}`);
                        }

                        const reader = response.body?.getReader();
                        const decoder = new TextDecoder();
                        while (true) {
                            const { done, value } = await reader!.read();
                            if (done) break;
                            const chunk = decoder.decode(value);
                            const lines = chunk.split("\n");
                            for (const line of lines) {
                                if (line.startsWith("data: ")) {
                                    try {
                                        const data = JSON.parse(line.slice(6));
                                        if (data.type === "content_block_delta") {
                                            const text = data.delta.text;
                                            fullResponse += text;
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(text)}\n\n`));
                                        }
                                    } catch (e) { }
                                }
                            }
                        }
                        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    } else if (provider === 'google') {
                        const response = await fetch(
                            `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?alt=sse&key=${Deno.env.get("GEMINI_API_KEY")}`,
                            {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    contents: [
                                        { role: "user", parts: [{ text: `SYSTEM INSTRUCTIONS: ${systemPrompt}` }] },
                                        ...sessionHistory.map((m: any) => ({
                                            role: m.role === 'assistant' ? 'model' : 'user',
                                            parts: [{ text: m.content }]
                                        })),
                                        { role: "user", parts: [{ text: query }] }
                                    ],
                                    generationConfig: { temperature: 0.4 }
                                }),
                            }
                        );

                        if (!response.ok) {
                            const errorData = await response.text();
                            throw new Error(`Google API Error (${response.status}): ${errorData}`);
                        }

                        const reader = response.body?.getReader();
                        const decoder = new TextDecoder();
                        while (true) {
                            const { done, value } = await reader!.read();
                            if (done) break;
                            const chunk = decoder.decode(value);
                            const lines = chunk.split("\n");
                            for (const line of lines) {
                                if (line.startsWith("data: ")) {
                                    try {
                                        const data = JSON.parse(line.slice(6));
                                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                                        if (text) {
                                            fullResponse += text;
                                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(text)}\n\n`));
                                        }
                                    } catch (e) { }
                                }
                            }
                        }
                        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    }
                } catch (err: any) {
                    console.error("❌ [CHAT] Stream Error:", err);
                    const errorMsg = `Error: ${err.message || 'AI Generation Failed'}`;
                    fullResponse = errorMsg;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMsg)}\n\n`));
                    controller.error(err);
                } finally {
                    const responseMetadata = {
                        timestamp: new Date().toISOString(),
                        userId: chatUserId,
                        responseLength: fullResponse.length,
                        sourcesUsed: sourceChunks.length,
                        provider: provider,
                        model: selectedModel
                    };
                    console.log(`📊 [RESPONSE] Metadata:`, JSON.stringify(responseMetadata));

                    controller.close();

                    // Background Tasks (Intent Detection & Fact Extraction)
                    const backgroundTasks = async () => {
                        try {
                            // 0. Track Routing Metrics - REMOVED AS REQUESTED

                            const currentTime = new Date().toISOString();

                            // 1. Intent Detection (Reminders & Tasks)
                            const intentDetection = await openai.chat.completions.create({
                                model: "gpt-4o-mini",
                                messages: [
                                    {
                                        role: "system",
                                        content: `You are an intent detection engine. 
                                        Current Time: ${currentTime}
                                        Analyze the user message for any requests to be reminded, scheduled tasks, or goals with dates.
                                        If found, extract the task and precisely calculate the due date (ISO string).
                                        Return valid JSON: { "isReminder": boolean, "task": string, "dueDate": string, "priority": "low"|"normal"|"high"|"urgent" }
                                        If no reminder intent, return { "isReminder": false }`
                                    },
                                    { role: "user", content: query }
                                ],
                                response_format: { type: "json_object" }
                            });

                            const intentData = JSON.parse(intentDetection.choices[0].message.content || "{}");

                            // Check if reminders are enabled for this profile
                            const currentFlags = (requestBody as any).featureFlags || {};
                            const remindersEnabled = currentFlags['User-Requested Reminder'] !== false; // Enable by default if flag missing, but check title

                            if (intentData.isReminder && intentData.task && remindersEnabled) {
                                console.log("Reminder detected!", intentData);
                                await supabaseClient.from('reminders').insert({
                                    user_id: chatUserId === 'anonymous' ? null : chatUserId,
                                    profile_id: activeProfileId,
                                    conversation_id: sessionId,
                                    task: intentData.task,
                                    original_request: query,
                                    due_at: intentData.dueDate,
                                    priority: intentData.priority || 'normal',
                                    metadata: { source: 'chat_automated' }
                                });
                            }

                            // 2. Fact Extraction & Psych Profile Update (Memory)
                            const analysis = await openai.chat.completions.create({
                                model: "gpt-4o-mini",
                                messages: [
                                    {
                                        role: "system",
                                        content: `Analyze this chat for User: ${chatUserId}.
                                        EXTRACT:
                                        1. New Facts (Name, Age, Location, etc.)
                                        2. Deep Psychology (Core Desires, Limiting Beliefs, New Goals)
                                        
                                        **MANDATORY RULES**:
                                        - If user says "My goal is [X]", you MUST return "goals": { "short_term": "[X]" }.
                                        - If user implies a fear/struggle, extract as 'limiting_belief'.
                                        - **Return JSON ONLY**.

                                        Return JSON: 
                                        { 
                                            "facts": { "key": "value" }, 
                                            "psych_update": { 
                                                "core_desire": "string | null", 
                                                "limiting_beliefs": ["string"], 
                                                "goals": { "short_term": "string", "long_term": "string" } 
                                            } 
                                        }`
                                    },
                                    { role: "user", content: `User said: "${query}"\nAssistant replied: "${fullResponse}"` }
                                ],
                                response_format: { type: "json_object" }
                            });

                            const analysisData = JSON.parse(analysis.choices[0].message.content || "{}");

                            // A. Update Simple Facts (Block Anonymous Writes)
                            if (analysisData.facts && chatUserId !== 'anonymous') {
                                for (const [key, value] of Object.entries(analysisData.facts)) {
                                    if (value) {
                                        const { error: factError } = await supabaseClient.rpc('update_user_fact', {
                                            p_user_id: chatUserId,
                                            p_session_id: sessionId || null,
                                            p_profile_id: activeProfileId || null,
                                            p_fact_type: key,
                                            p_fact_value: String(value)
                                        });

                                        if (factError) {
                                            console.error("❌ [RPC] update_user_fact failed:", factError);
                                        }
                                    }
                                }
                            } else if (chatUserId === 'anonymous' && analysisData.facts) {
                                console.warn("⚠️ [SECURITY] Blocked anonymous write to user_facts");
                            }

                            // C. Record Emotional History (New Feature)
                            if (chatUserId !== 'anonymous') {
                                const { error: emoError } = await supabaseClient.rpc('record_emotional_event', {
                                    p_user_id: chatUserId,
                                    p_profile_id: activeProfileId || null,
                                    p_session_id: sessionId || null,
                                    p_emotion: detectedSentiment,
                                    p_intensity: detectedIntensity,
                                    p_urgency: detectedUrgency,
                                    p_crisis: crisisDetected
                                });

                                if (emoError) {
                                    console.error("❌ [EMO] Record Event Failed:", emoError);
                                } else {
                                    console.log(`🧠 [EMO] History Saved: ${detectedSentiment} (${detectedUrgency})`);
                                }
                            }

                        } catch (err) {
                            console.error("Bg Error:", err);
                        }
                    };

                    // @ts-ignore: EdgeRuntime
                    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
                        // @ts-ignore
                        EdgeRuntime.waitUntil(backgroundTasks());
                    } else {
                        backgroundTasks();
                    }
                }
            },
        });

        return new Response(readable, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });

    } catch (error: any) {
        console.error(`❌ [CHAT] Global Error:`, error);
        return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});

// ==================== MERGED INTELLIGENT ROUTER LOGIC ====================

// ==================== TYPES ====================

export type ModelProvider = 'openai' | 'anthropic' | 'cerebras' | 'google';

export interface RoutingDecision {
    provider: ModelProvider;
    model: string;
    intent: string;
    complexity: number;
    reasoning: string;
    estimatedCost: number;
    isCritical: boolean;
}

export interface IntentClassification {
    intent: string;
    complexity: number;
    isCritical: boolean;
    reasoning: string;
}

export interface UserContext {
    conversationDepth: number;
    hasEmotionalHistory: boolean;
    recentTopics: string[];
}

// ==================== CACHING LAYER ====================

class RouterCache {
    private cache = new Map<string, {
        decision: RoutingDecision;
        timestamp: number;
    }>();

    private readonly TTL = 60 * 60 * 1000; // 1 hour
    private readonly MAX_SIZE = 1000;

    // Stats
    private hits = 0;
    private misses = 0;

    getCacheKey(message: string, userId: string): string {
        const normalized = message.toLowerCase().trim().slice(0, 100);
        return `${userId}:${normalized}`;
    }

    get(message: string, userId: string): RoutingDecision | null {
        const key = this.getCacheKey(message, userId);
        const cached = this.cache.get(key);

        if (cached && Date.now() - cached.timestamp < this.TTL) {
            this.hits++;
            console.log(`⚡ [CACHE] Hit! (${this.getHitRate()}% hit rate)`);
            return cached.decision;
        }

        this.misses++;
        return null;
    }

    set(message: string, userId: string, decision: RoutingDecision): void {
        const key = this.getCacheKey(message, userId);
        this.cache.set(key, { decision, timestamp: Date.now() });

        // Cleanup old entries
        if (this.cache.size > this.MAX_SIZE) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }

    getHitRate(): number {
        const total = this.hits + this.misses;
        return total > 0 ? Math.round((this.hits / total) * 100) : 0;
    }

    getStats() {
        return {
            hits: this.hits,
            misses: this.misses,
            hitRate: this.getHitRate(),
            cacheSize: this.cache.size
        };
    }
}

const routerCache = new RouterCache();

// ==================== LAYER 1: INTENT CLASSIFICATION ====================

export async function classifyIntent(
    message: string,
    emotionalState?: string,
    openai?: OpenAI
): Promise<IntentClassification> {
    if (!openai) {
        return {
            intent: 'general_chat',
            complexity: 5,
            isCritical: false,
            reasoning: 'OpenAI client not available'
        };
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: `Classify this query into ONE category:

1. "emotional_crisis" - Suicide, self-harm, severe depression, giving up
2. "emotional_support" - Anxiety, stress, fear, sadness, loneliness
3. "creative_writing" - Stories, poems, articles, blog posts
4. "technical_complex" - Code, math, strategy, business plans, science
5. "long_context" - Asks about past conversations, history, "remember when"
6. "general_chat" - Casual questions, simple advice

Also rate complexity 1-10 (10 = most complex)

Return JSON: {
    "intent": "category",
    "complexity": 1-10,
    "isCritical": true/false,
    "reasoning": "brief explanation"
}`
            }, {
                role: "user",
                content: `User message: "${message}"\nDetected emotion: ${emotionalState || 'unknown'}`
            }],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');
        console.log(`🧠 [ROUTING] Intent: ${result.intent}, Complexity: ${result.complexity}`);

        return {
            intent: result.intent || 'general_chat',
            complexity: result.complexity || 5,
            isCritical: result.isCritical || false,
            reasoning: result.reasoning || 'No reasoning provided'
        };
    } catch (error) {
        console.error('❌ Intent classification failed:', error);
        return {
            intent: 'general_chat',
            complexity: 5,
            isCritical: false,
            reasoning: 'Classification error - using fallback'
        };
    }
}

// ==================== LAYER 2: COMPLEXITY ANALYSIS ====================

export function analyzeComplexity(message: string, conversationDepth: number): number {
    let score = 5; // Base score

    // Message length
    if (message.length > 500) score += 2;
    if (message.length > 1000) score += 2;

    // Technical indicators
    const technicalTerms = ['algorithm', 'function', 'database', 'API', 'code', 'debug', 'strategy', 'business model'];
    if (technicalTerms.some(term => message.toLowerCase().includes(term))) score += 2;

    // Multi-part questions
    const questionMarks = (message.match(/\?/g) || []).length;
    if (questionMarks > 2) score += 1;

    // Conversation depth
    if (conversationDepth > 10) score += 1; // Long conversation

    return Math.min(score, 10);
}

// ==================== LAYER 3: CONTEXT ENHANCEMENT ====================

export async function getUserRoutingContext(
    userId: string,
    supabaseClient: any
): Promise<UserContext> {
    try {
        const { data: recentMessages } = await supabaseClient
            .from('messages')
            .select('content, role')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5);

        return {
            conversationDepth: recentMessages?.length || 0,
            hasEmotionalHistory: false, // Can be enhanced
            recentTopics: [] // Can be enhanced
        };
    } catch (error) {
        console.error('❌ Failed to get user context:', error);
        return {
            conversationDepth: 0,
            hasEmotionalHistory: false,
            recentTopics: []
        };
    }
}

// ==================== LAYER 4: SMART MODEL SELECTION ====================

export async function selectModelIntelligent(
    message: string,
    emotionalState: string,
    userId: string,
    openai: OpenAI,
    supabaseClient: any
): Promise<RoutingDecision> {

    // Parallel execution for speed
    const [classification, context] = await Promise.all([
        classifyIntent(message, emotionalState, openai),
        getUserRoutingContext(userId, supabaseClient)
    ]);

    const complexity = analyzeComplexity(message, context.conversationDepth);

    // Decision tree
    let provider: ModelProvider = 'openai';
    let model = 'gpt-4o-mini';
    let reasoning = 'Default fast model';
    let estimatedCost = 0.0001;

    // Critical emotional crisis - ALWAYS use best model
    if (classification.isCritical || classification.intent === 'emotional_crisis') {
        provider = 'openai';
        model = 'gpt-4o';
        reasoning = 'Critical emotional state detected - using most empathetic model';
        estimatedCost = 0.01;
    }
    // Emotional support - GPT-4o for empathy
    else if (classification.intent === 'emotional_support' && complexity > 6) {
        provider = 'openai';
        model = 'gpt-4o';
        reasoning = 'Complex emotional support requires advanced empathy';
        estimatedCost = 0.01;
    }
    // Creative writing - Claude excels here
    else if (classification.intent === 'creative_writing' && Deno.env.get('ANTHROPIC_API_KEY')) {
        provider = 'anthropic';
        model = 'claude-3-5-sonnet-latest';
        reasoning = 'Creative task - Claude is best storyteller';
        estimatedCost = 0.015;
    }
    // Long context/history - Gemini's strength
    else if (classification.intent === 'long_context' && Deno.env.get('GEMINI_API_KEY')) {
        provider = 'google';
        model = 'gemini-1.5-pro';
        reasoning = 'Long conversation history - Gemini has 1M context window';
        estimatedCost = 0.0075;
    }
    // Technical/complex - GPT-4o for reasoning
    else if (classification.intent === 'technical_complex' && complexity > 7) {
        provider = 'openai';
        model = 'gpt-4o';
        reasoning = 'Complex technical query requires advanced reasoning';
        estimatedCost = 0.01;
    }
    // Simple queries - fast and cheap
    else {
        provider = 'openai';
        model = 'gpt-4o-mini';
        reasoning = 'General query - optimizing for speed and cost';
        estimatedCost = 0.0001;
    }

    console.log(`🎯 [ROUTING] Selected: ${model} | Reason: ${reasoning}`);

    return {
        provider,
        model,
        intent: classification.intent,
        complexity,
        reasoning,
        estimatedCost,
        isCritical: classification.isCritical
    };
}

// ==================== LAYER 5: FALLBACK CHAIN ====================

const FALLBACK_CHAIN: Record<string, string[]> = {
    'gpt-4o': ['claude-3-5-sonnet-latest', 'gpt-4o-mini'],
    'claude-3-5-sonnet-latest': ['gpt-4o', 'gpt-4o-mini'],
    'gemini-1.5-pro': ['gpt-4o', 'gpt-4o-mini'],
    'gpt-4o-mini': ['gpt-3.5-turbo']
};

export function getFallbackChain(model: string): string[] {
    return FALLBACK_CHAIN[model] || ['gpt-4o-mini'];
}

// ==================== LAYER 6: PERFORMANCE MONITORING ====================

export async function trackRoutingMetrics(
    routingDecision: RoutingDecision,
    userId: string,
    responseTime: number,
    success: boolean,
    supabaseClient: any,
    messageId?: string // Optional messageId from frontend
) {
    try {
        await supabaseClient.from('routing_metrics').insert({
            user_id: userId,
            intent: routingDecision.intent,
            complexity: routingDecision.complexity,
            model_used: routingDecision.model,
            reasoning: routingDecision.reasoning,
            estimated_cost: routingDecision.estimatedCost,
            response_time_ms: responseTime,
            success,
            is_critical: routingDecision.isCritical,
            created_at: new Date().toISOString(),
            message_id: messageId // Link to messages table
        });
    } catch (error) {
        console.error('❌ Failed to track routing metrics:', error);
    }
}

// ==================== MAIN ROUTING FUNCTION ====================

export async function routeIntelligently(
    message: string,
    emotionalState: string,
    userId: string,
    openai: OpenAI,
    supabaseClient: any
): Promise<RoutingDecision> {

    // Check cache first
    const cached = routerCache.get(message, userId);
    if (cached) {
        return cached;
    }

    // Perform intelligent routing
    const decision = await selectModelIntelligent(
        message,
        emotionalState,
        userId,
        openai,
        supabaseClient
    );

    // Cache the decision
    routerCache.set(message, userId, decision);

    // Log cache stats periodically
    const stats = routerCache.getStats();
    if ((stats.hits + stats.misses) % 10 === 0) {
        console.log(`📊 [CACHE] Stats:`, stats);
    }

    return decision;
}

// ==================== ENSEMBLE MODE FOR CRITICAL QUERIES ====================

export async function ensembleMode(
    message: string,
    systemPrompt: string,
    conversationHistory: any[],
    openai: OpenAI
): Promise<{
    response: string;
    modelsUsed: string[];
    selectedModel: string;
    reasoning: string;
}> {
    console.log('🚨 [ENSEMBLE] Running dual-model validation for critical query');

    try {
        // Run GPT-4o twice with different temperatures for diversity
        const [response1, response2] = await Promise.all([
            openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...conversationHistory,
                    { role: 'user', content: message }
                ],
                temperature: 0.3, // More focused
            }),
            openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...conversationHistory,
                    { role: 'user', content: message }
                ],
                temperature: 0.7, // More creative
            })
        ]);

        const text1 = response1.choices[0].message.content || '';
        const text2 = response2.choices[0].message.content || '';

        // Use GPT-4o-mini to judge which response is better
        const judgeResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'system',
                content: `You are evaluating two AI responses to a user in emotional crisis.
                
Pick the response that is:
1. Most empathetic and validating
2. Provides immediate emotional support
3. Includes crisis resources if needed
4. Uses warm, human language
5. Avoids being preachy or dismissive

Return JSON: {
    "choice": "A" or "B",
    "reasoning": "brief explanation why this response is better"
}`
            }, {
                role: 'user',
                content: `User's message: "${message}"

Response A (Temperature 0.3 - Focused):
${text1}

Response B (Temperature 0.7 - Creative):
${text2}

Which response is better for someone in emotional crisis?`
            }],
            response_format: { type: 'json_object' }
        });

        const judgment = JSON.parse(judgeResponse.choices[0].message.content || '{}');
        const selectedResponse = judgment.choice === 'A' ? text1 : text2;
        const selectedTemp = judgment.choice === 'A' ? '0.3' : '0.7';

        console.log(`🏆 [ENSEMBLE] Selected response ${judgment.choice} (temp ${selectedTemp}): ${judgment.reasoning}`);

        return {
            response: selectedResponse,
            modelsUsed: ['gpt-4o (temp 0.3)', 'gpt-4o (temp 0.7)'],
            selectedModel: `gpt-4o (temp ${selectedTemp})`,
            reasoning: judgment.reasoning || 'Better empathy and support'
        };

    } catch (error) {
        console.error('❌ [ENSEMBLE] Failed, using single model fallback:', error);

        // Fallback to single GPT-4o call
        const fallbackResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
                { role: 'user', content: message }
            ],
            temperature: 0.5,
        });

        return {
            response: fallbackResponse.choices[0].message.content || '',
            modelsUsed: ['gpt-4o (fallback)'],
            selectedModel: 'gpt-4o (fallback)',
            reasoning: 'Ensemble failed, used single model'
        };
    }
}

// ==================== USER FEEDBACK TRACKING ====================

export async function trackUserFeedback(
    messageId: string,
    rating: number,
    supabaseClient: any
): Promise<void> {
    try {
        await supabaseClient
            .from('routing_metrics')
            .update({ user_satisfaction: rating })
            .eq('message_id', messageId);

        console.log(`✅ [FEEDBACK] Tracked rating ${rating} for message ${messageId}`);
    } catch (error) {
        console.error('❌ [FEEDBACK] Failed to track:', error);
    }
}

export async function getRoutingRecommendations(
    supabaseClient: any
): Promise<Array<{
    intent: string;
    recommendedModel: string;
    avgSatisfaction: number;
    sampleSize: number;
}>> {
    try {
        const { data } = await supabaseClient
            .from('model_performance_by_intent')
            .select('*')
            .gte('usage_count', 10); // At least 10 samples

        if (!data) return [];

        // Group by intent and pick best model
        const recommendations = new Map();

        for (const row of data) {
            const existing = recommendations.get(row.intent);
            if (!existing || row.avg_satisfaction > existing.avgSatisfaction) {
                recommendations.set(row.intent, {
                    intent: row.intent,
                    recommendedModel: row.model_used,
                    avgSatisfaction: row.avg_satisfaction,
                    sampleSize: row.usage_count
                });
            }
        }

        return Array.from(recommendations.values());
    } catch (error) {
        console.error('❌ [FEEDBACK] Failed to get recommendations:', error);
        return [];
    }
}

// ==================== EXPORT CACHE STATS ====================

export function getCacheStats() {
    return routerCache.getStats();
}
