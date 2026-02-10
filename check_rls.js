import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkRLS() {
    console.log('--- CHECKING RLS STATUS ---');
    try {
        const { data, error } = await supabase.rpc('get_admin_profiles'); // Just a test call

        // Query pg_tables to see RLS status
        const { data: tables, error: tErr } = await supabase.from('pg_tables').select('tablename, rowsecurity').in('tablename', ['knowledge_sources', 'folders', 'mind_profile']);

        // Actually, pg_tables doesn't have rowsecurity in some versions or it's named differently.
        // Let's use information_schema or a direct query if possible.

        const { data: rlsStatus, error: rlsErr } = await supabase.rpc('check_rls_status');
        if (rlsErr) {
            console.log('check_rls_status RPC not found, trying direct PG query');
            const { data: pgData, error: pgErr } = await supabase.rpc('exec_sql', { sql: "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'" });
            if (pgErr) {
                console.log('exec_sql not found. I will assume RLS might be on and try to select with anon key.');
            } else {
                console.log('RLS Status:', pgData);
            }
        } else {
            console.log('RLS Status:', rlsStatus);
        }

        // Try selecting with ANON KEY to see if RLS blocks it
        const anonSupabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
        const { data: folders, error: fErr } = await anonSupabase.from('folders').select('*').limit(1);
        console.log('Anon Folder Select:', folders?.length || 0, fErr ? fErr.message : 'SUCCESS');

        const { data: ks, error: ksErr } = await anonSupabase.from('knowledge_sources').select('*').limit(1);
        console.log('Anon KS Select:', ks?.length || 0, ksErr ? ksErr.message : 'SUCCESS');

    } catch (err) {
        console.error('RLS Check Error:', err);
    }
}

checkRLS();
