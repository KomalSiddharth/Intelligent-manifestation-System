import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
    console.log('--- CHECKING SCHEMA ---');
    try {
        const { data, error } = await supabase.from('knowledge_sources').select('*').limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
            console.log('Columns in knowledge_sources:', Object.keys(data[0]));
            console.log('Sample Row:', JSON.stringify(data[0], null, 2));
        } else {
            console.log('No data in knowledge_sources');
        }
    } catch (err) {
        console.error('Schema Check Error:', err);
    }
}

checkSchema();
