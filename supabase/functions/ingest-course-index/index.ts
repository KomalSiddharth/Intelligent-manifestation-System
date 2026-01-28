import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { lessons, profileId } = await req.json(); // Expecting array of { title, keywords, url }

        if (!lessons || !Array.isArray(lessons)) {
            throw new Error("Invalid input: 'lessons' array is required.");
        }

        const insertedIds: string[] = [];
        const processedDocs = [];
        let currentCategory = "General";

        for (const lesson of lessons) {
            if (!lesson.title) continue;

            const title = lesson.title.trim();
            const url = lesson.url ? lesson.url.trim() : "";

            // If it's a category header (Title present, but URL missing)
            if (title && !url) {
                currentCategory = title;
                console.log(`Found Category Header: ${currentCategory}`);
                continue;
            }

            // Create a structured text chunk optimized for RAG retrieval
            const content = `COURSE/CATEGORY: ${currentCategory}.
      LESSON TITLE: ${title}.
      ACCESS LINK: ${url}.
      
      (System Note: Use this link when the user asks for this specific topic or lesson.)`;

            const wordCount = content.split(/\s+/).length;

            // Store in knowledge_sources
            const { data: inserted, error } = await supabase.from('knowledge_sources').insert({
                title: `${currentCategory}: ${title}`,
                content: content,
                summary: `Course Index Entry for: ${title} in ${currentCategory}`,
                source_type: 'course_index', // Changed from 'type' to match schema
                status: 'processed',
                word_count: wordCount,
                profile_id: profileId,
                metadata: { url: url, category: currentCategory }
            }).select('id').single();

            if (error) {
                console.error(`Failed to insert ${title}:`, error);
            } else if (inserted) {
                processedDocs.push(title);
                insertedIds.push(inserted.id);
            }
        }

        // --- NEW: Trigger GraphRAG Entity Extraction ---
        if (insertedIds.length > 0) {
            console.log(`🚀 [GraphRAG] Triggering extraction for ${insertedIds.length} new sources...`);
            try {
                const extractionResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-entities`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                    },
                    body: JSON.stringify({
                        sourceIds: insertedIds,
                        profileId: profileId
                    })
                });

                if (!extractionResponse.ok) {
                    console.error("GraphRAG Extraction Failed:", await extractionResponse.text());
                } else {
                    console.log("✅ GraphRAG Extraction queued successfully.");
                }
            } catch (err) {
                console.error("Error calling extraction function:", err);
            }
        }

        return new Response(
            JSON.stringify({
                message: `Successfully indexed ${processedDocs.length} lessons. GraphRAG extraction triggered.`,
                indexed: processedDocs
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
