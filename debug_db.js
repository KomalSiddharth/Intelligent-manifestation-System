
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCounts() {
    console.log("--- DB DIAGNOSTICS ---");

    try {
        const { count: ksCount, error: ksErr } = await supabase
            .from('knowledge_sources')
            .select('*', { count: 'exact', head: true });
        console.log("Knowledge Sources Count:", ksCount, ksErr || "");

        const { count: ciCount, error: ciErr } = await supabase
            .from('content_items')
            .select('*', { count: 'exact', head: true });
        console.log("Content Items Count:", ciCount, ciErr || "");

        const { count: userCount, error: userErr } = await supabase
            .from('audience_users')
            .select('*', { count: 'exact', head: true });
        console.log("Audience Users Count:", userCount, userErr || "");

        const { count: profileCount, error: profileErr } = await supabase
            .from('mind_profile')
            .select('*', { count: 'exact', head: true });
        console.log("Mind Profiles Count:", profileCount, profileErr || "");

        // Check a sample profile to see if it has biography
        const { data: profiles, error: pErr } = await supabase.from('mind_profile').select('id, name, biography, purpose').limit(5);
        console.log("Sample Profiles:", profiles, pErr || "");
    } catch (err) {
        console.error("Diagnostic execution error:", err);
    }
}

checkCounts();
