import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, x-api-key, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
    // 0. HANDLE OPTIONS (CORS)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 1. AUTHENTICATION
        const providedApiKey = req.headers.get("x-api-key");
        const expectedApiKey = Deno.env.get("ASK_API_KEY");
        
        if (!providedApiKey || providedApiKey !== expectedApiKey) {
            console.error("🚫 [ASK] Unauthorized: Invalid or missing x-api-key");
            return new Response(
                JSON.stringify({ error: "Unauthorized" }), 
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. PARSE BODY
        const body = await req.json().catch(() => ({}));
        const { question } = body;

        if (!question || typeof question !== 'string') {
            console.error("⚠️ [ASK] Bad Request: Missing question");
            return new Response(
                JSON.stringify({ error: "Question is required" }), 
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`📥 [ASK] Received question: "${question.substring(0, 50)}..."`);

        // 3. SETUP CLIENTS
        const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // 4. GENERATE EMBEDDING
        console.log("⚡ [ASK] Generating embedding...");
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: question
        });
        const queryEmbedding = embeddingResponse.data[0].embedding;

        // 5. VECTOR SIMILARITY SEARCH
        console.log("🔍 [ASK] Searching knowledge base...");
        const { data: chunks, error: rpcError } = await supabaseClient.rpc("match_knowledge", {
            query_embedding: queryEmbedding,
            match_threshold: 0.10, // Generous threshold to catch variations
            match_count: 5,
            p_profile_id: null // Global knowledge search
        });

        if (rpcError) {
            console.error("❌ [ASK] RPC Error:", rpcError);
            throw rpcError;
        }

        // 6. BUILD CONTEXT
        let context = "";
        if (chunks && chunks.length > 0) {
            context = chunks.map((c: any) => c.content).join("\n\n---\n\n");
            console.log(`🧩 [ASK] Found ${chunks.length} related chunks.`);
        } else {
            console.log("⚠️ [ASK] No related chunks found.");
        }

        // 7. GENERATE ANSWER
        console.log("🧠 [ASK] Generating answer...");
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Standard fast model used in chat-engine
            temperature: 0.7,
            messages: [
                {
                    role: "system",
                    content: `You are Mitesh Khatri's AI assistant. You answer questions based on his teachings, philosophy, and knowledge. Be warm, clear, and insightful. Answer only based on the provided context. If the answer is not in the context, say 'I don't have specific information on this, but I recommend connecting with the community or Mitesh directly.'`
                },
                {
                    role: "user",
                    content: `Context: ${context}\n\nQuestion: ${question}`
                }
            ]
        });

        const answer = completion.choices[0].message?.content || "";
        console.log("✅ [ASK] Answer generated successfully.");

        // 8. RETURN RESPONSE
        return new Response(
            JSON.stringify({ answer }), 
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error("🔥 [ASK] Internal Server Error:", error);
        return new Response(
            JSON.stringify({ 
                error: "Internal server error", 
                details: error.message || "Unknown error"
            }), 
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
