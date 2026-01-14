import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { messages, topic } = await req.json();
        const apiKey = Deno.env.get('OPENAI_API_KEY');

        if (!apiKey) {
            throw new Error("Missing OPENAI_API_KEY");
        }

        // Construct the context for generation
        // If a specific topic is provided, prioritize it.
        // Otherwise, use ONLY recent conversation (exclude old mindmap contexts)
        let userContent = "";
        if (topic) {
            userContent = `Create a mindmap about: ${topic}`;
        } else if (messages && Array.isArray(messages)) {
            // Filter out mindmap-related messages and take only last 3-5 real messages
            const realMessages = messages.filter((m: any) =>
                !m.content.includes('[MINDMAP') &&
                !m.content.includes('Analyzing conversation')
            ).slice(-4); // Only last 4 messages

            const recentContext = realMessages.map((m: any) => `${m.role}: ${m.content}`).join("\n");
            userContent = `Based on this RECENT conversation, create a mindmap:\n\n${recentContext}`;
        } else {
            userContent = "Create a mindmap about Personal Growth and Mindset.";
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini", // Fast and capable
                messages: [
                    {
                        role: "system",
                        content:
                            'You are an Expert Mind Map Generator. Output ONLY valid JSON: {"root": {"title": "Main Topic", "description": "Brief overview", "children": [...]}}. \n\n🚨 CRITICAL RULES:\n1) EVERY node MUST have "title" + "description"\n2) Create 3-4 LEVELS deep - NO EXCEPTIONS\n3) EVERY SINGLE NODE must have children (except final level)\n4) For EACH main concept, add 3-5 specific sub-concepts:\n   \n   Example for NLP:\n   {"title": "Definition", "description": "Understanding the science of NLP", "children": [\n     {"title": "Core Concept", "description": "Programming the mind through language"},\n     {"title": "Origin", "description": "Developed by Bandler and Grinder in 1970s"},\n     {"title": "Purpose", "description": "Model excellence and replicate success"}\n   ]}\n   \n   {"title": "Techniques", "description": "Practical NLP methods", "children": [\n     {"title": "Anchoring", "description": "Trigger desired states instantly"},\n     {"title": "Reframing", "description": "Change perspective to shift meaning"},\n     {"title": "Modeling", "description": "Copy successful behaviors"}\n   ]}\n\n5) Generate 7-10 main branches\n6) Each branch MUST have 3-5 children\n7) NO EMPTY BRANCHES - if you create a node, give it children!\n8) Be SPECIFIC and DETAILED\n9) No markdown ```json',
                    },
                    { role: "user", content: userContent },
                ],
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API Error: ${errText}`);
        }

        const data = await response.json();
        let rawContent = data.choices?.[0]?.message?.content || "{}";

        // Cleanup markdown just in case
        rawContent = rawContent.replace(/```json\s*|\s*```/g, "").trim();

        const parsed = JSON.parse(rawContent);

        return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
