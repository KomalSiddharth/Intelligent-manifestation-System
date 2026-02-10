import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log('--- STARTING PROFILE DIAGNOSTICS ---');
    try {
        const { data: profiles, error: pErr } = await supabase.from('mind_profile').select('*');
        console.log('Profiles Found:', profiles?.length || 0);
        if (pErr) console.error('Profile Error:', pErr);

        if (profiles && profiles.length > 0) {
            console.log('All Profiles:', JSON.stringify(profiles.map(p => ({ id: p.id, name: p.name, is_primary: p.is_primary })), null, 2));
        }

        const { count: ksCount } = await supabase.from('knowledge_sources').select('*', { count: 'exact', head: true });
        console.log('Total Knowledge Sources:', ksCount);

        if (ksCount > 0) {
            // Group by profile_id
            const { data: grouped } = await supabase.from('knowledge_sources').select('profile_id');
            const counts = grouped.reduce((acc, curr) => {
                acc[curr.profile_id] = (acc[curr.profile_id] || 0) + 1;
                return acc;
            }, {});
            console.log('Content Items grouped by profile_id:', JSON.stringify(counts, null, 2));
        }

    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    }
    console.log('--- DIAGNOSTICS COMPLETE ---');
}

check();
