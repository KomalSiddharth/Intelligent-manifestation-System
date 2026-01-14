const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

// Manual .env parser
function getEnv() {
    try {
        const env = fs.readFileSync('.env', 'utf8');
        const config = {};
        env.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                config[key.trim()] = value.trim().replace(/"/g, '');
            }
        });
        return config;
    } catch (e) {
        console.warn("Could not read .env file");
        return {};
    }
}

const env = getEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
    console.error("Missing credentials (SUPABASE or OPENAI) in .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

async function upload() {
    try {
        const data = JSON.parse(fs.readFileSync('extracted_links.json', 'utf8'));
        console.log(`Processing ${data.length} links with Embeddings...`);

        let successCount = 0;
        let failCount = 0;

        // Process sequentially to manage rate limits and errors
        for (const [index, item] of data.entries()) {
            // 1. Prepare Content (Now with CATEGORY for better retrieval)
            const content = `CATEGORY: ${item.category || 'General'}.\nLESSON TITLE: ${item.title}.\nACCESS LINK: ${item.url}.\n(System: Use this link for users asking about this topic)`;

            // 2. Generate Embedding
            let embedding = [];
            try {
                const response = await openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: content,
                });
                embedding = response.data[0].embedding;
            } catch (embedError) {
                console.error(`Embedding failed for ${item.title}:`, embedError.message);
                failCount++;
                continue;
            }

            // 3. Insert Source (Metadata)
            // Removed 'type' and 'status' as they don't exist in schema
            const { data: source, error: sourceError } = await supabase
                .from('knowledge_sources')
                .insert({
                    title: item.title,
                    source_type: 'course_index', // Correct column name confirmed by error
                    metadata: { url: item.url }
                })
                .select()
                .single();

            if (sourceError || !source) {
                console.error(`Source insert failed for ${item.title}:`, sourceError?.message);
                failCount++;
                continue;
            }

            // 4. Insert Chunk (Content + Embedding)
            const { error: chunkError } = await supabase
                .from('knowledge_chunks')
                .insert({
                    source_id: source.id,
                    content: content,
                    embedding: embedding
                    // chunk_index removed due to schema error
                });

            if (chunkError) {
                console.error(`Chunk insert failed for ${item.title}:`, chunkError.message);
                // Optional: Delete orphan source
                await supabase.from('knowledge_sources').delete().eq('id', source.id);
                failCount++;
            } else {
                successCount++;
                if (index % 10 === 0) console.log(`Processed ${index + 1}/${data.length}...`);
            }
        }

        console.log(`Upload Complete. Success: ${successCount}, Failed: ${failCount}`);

    } catch (e) {
        console.error("Upload process failed:", e);
    }
}

upload();
