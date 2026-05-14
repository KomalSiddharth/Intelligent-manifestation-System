
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Try to find .env file
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    console.log("Loading .env from", envPath);
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking conversations and audience_users tables...");

    const { data: convs, error: convError } = await supabase.from('conversations').select('*').limit(5);
    if (convError) {
        console.error("Error fetching conversations:", convError);
    } else {
        console.log("Conversations sample:");
        console.log(JSON.stringify(convs, null, 2));
    }

    const { data: users, error: userError } = await supabase.from('audience_users').select('*').limit(5);
    if (userError) {
        console.error("Error fetching audience_users:", userError);
    } else {
        console.log("Audience Users sample:");
        console.log(JSON.stringify(users, null, 2));
    }
}

check();
