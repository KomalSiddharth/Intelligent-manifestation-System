import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log('--- STARTING DIAGNOSTICS ---');
    try {
        const { count: ksCount, error: ksErr } = await supabase.from('knowledge_sources').select('*', { count: 'exact', head: true });
        const { count: folderCount, error: folderErr } = await supabase.from('folders').select('*', { count: 'exact', head: true });
        const { count: profileCount, error: profileErr } = await supabase.from('mind_profile').select('*', { count: 'exact', head: true });

        console.log('Knowledge Sources Count:', ksCount);
        if (ksErr) console.error('KS Error:', ksErr);

        console.log('Folders Count:', folderCount);
        if (folderErr) console.error('Folder Error:', folderErr);

        console.log('Mind Profiles Count:', profileCount);
        if (profileErr) console.error('Profile Error:', profileErr);

        if (ksCount > 0) {
            const { data: ksData } = await supabase.from('knowledge_sources').select('id, title, folder_id, profile_id').limit(5);
            console.log('Sample Knowledge Sources:', JSON.stringify(ksData, null, 2));
        }

        if (folderCount > 0) {
            const { data: folderData } = await supabase.from('folders').select('id, name, profile_id').limit(5);
            console.log('Sample Folders:', JSON.stringify(folderData, null, 2));
        }
    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    }
    console.log('--- DIAGNOSTICS COMPLETE ---');
}

check();
