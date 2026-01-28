import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { question, authorName, profileId } = await req.json();

        if (!question) {
            throw new Error("Question is required");
        }

        // Truncate question to avoid token overflows
        const truncatedQuestion = question.length > 2000 ? question.slice(0, 2000) + "..." : question;

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseKey);
        const openai = new OpenAI({ apiKey: openaiKey });

        console.log(`🤖 [KAJABI-REPLY] Generating reply for ${authorName || 'User'} (Profile: ${profileId || 'Global'})`);

        // 1. Generate embedding for RAG
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: truncatedQuestion,
        });
        const embedding = embeddingResponse.data[0].embedding;

        // 2. RAG Match - Reduced count to save tokens
        const { data: knowledgeChunks, error: matchError } = await supabase.rpc("match_knowledge", {
            query_embedding: embedding,
            match_threshold: 0.35,
            match_count: 5,
            p_profile_id: profileId || null
        });

        if (matchError) {
            console.error("Match Knowledge Error:", matchError);
        }

        const context = knowledgeChunks && knowledgeChunks.length > 0
            ? knowledgeChunks.map((c: any) => `[Source: ${c.source_title || 'Lesson'}]\n${c.content}`).join("\n\n---\n\n")
            : "No direct reference found in Knowledge Base.";

        // 3. System Prompt Construction
        const systemPrompt = `
      You are Mitesh Khatri, a world-recognized Leadership & Spiritual Coach. 
      Your task is to provide a high-value, professional response to a Platinum Community student.

      STRICT COMMANDS:
      1. ADDRESSING: You MUST start the reply with "Hi @${authorName}," (Exactly like that, with the tagging @ symbol).
      2. PERSONA: You are the CEO and Head Coach. Your tone is Authoritative, Deeply Empathetic, and Visionary. 
      3. GREETINGS: NEVER use "Kaisa hai dost" or "Bade Bhai". Use professional greetings if needed, or get straight to the point after the Hi @Name.
      4. KNOWLEDGE BASE INTEGRATION: 
         - Use the CONTEXT below to identify specific Lessons, Rituals, or Strategies (e.g., DMP, Law of Attraction, Emotional Anchors, Career Sabotage patterns).
         - Reference them BY NAME. 
         - Provide a clear, actionable instruction based ON THE KNOWLEDGE BASE.
      5. SIGN-OFF: You MUST end only with "Mitesh Khatri". Do not use "Mitesh Bhai".
      6. LANGUAGE: Professional English/Hinglish is okay, but it must remain high-class and sophisticated.

      CONTEXT FROM KNOWLEDGE BASE:
      ${context}
    `;

        // 4. Generate Completion
        const chatResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: truncatedQuestion }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        const reply = chatResponse.choices[0].message.content;

        // Calculate a rough confidence score
        const avgSimilarity = knowledgeChunks && knowledgeChunks.length > 0
            ? knowledgeChunks.reduce((sum: number, c: any) => sum + (c.similarity || 0), 0) / knowledgeChunks.length
            : 0;

        return new Response(
            JSON.stringify({
                text: reply,
                confidence: avgSimilarity,
                chunks_used: knowledgeChunks?.length || 0,
                context_preview: context.slice(0, 200) + "..."
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );

    } catch (error) {
        console.error("Error in generate-kajabi-reply:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});
