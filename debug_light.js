
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runDiag() {
    console.log("--- LIGHTWEIGHT DIAGNOSTICS ---");
    console.log("URL:", supabaseUrl);

    try {
        // 1. Check knowledge_sources count
        const ksRes = await fetch(`${supabaseUrl}/rest/v1/knowledge_sources?select=count`, {
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Range': '0-0',
                'Prefer': 'count=exact'
            }
        });
        const ksCountHead = ksRes.headers.get('content-range');
        console.log("KS Count (Range Header):", ksCountHead);

        // 2. Check mind_profile count
        const pRes = await fetch(`${supabaseUrl}/rest/v1/mind_profile?select=count`, {
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Range': '0-0',
                'Prefer': 'count=exact'
            }
        });
        console.log("Profile Count (Range Header):", pRes.headers.get('content-range'));

        // 3. Get sample profiles
        const sampleRes = await fetch(`${supabaseUrl}/rest/v1/mind_profile?select=id,name,biography,purpose&limit=3`, {
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`
            }
        });
        const samples = await sampleRes.json();
        console.log("Sample Profiles:", JSON.stringify(samples, null, 2));

    } catch (err) {
        console.error("Diag error:", err);
    }
}

runDiag();
