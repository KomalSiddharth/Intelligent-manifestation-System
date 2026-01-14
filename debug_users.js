const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUsers() {
    const { data, error } = await supabase
        .from('audience_users')
        .select('name, status, message_count')
        .limit(50);

    if (error) {
        console.error(error);
        return;
    }

    console.log("Audience Users Statuses:");
    data.forEach(u => {
        console.log(`${u.name}: ${u.status} (${u.message_count} messages)`);
    });
}

checkUsers();
