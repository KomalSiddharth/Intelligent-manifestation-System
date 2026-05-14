import axios from 'axios';
import 'dotenv/config';

const SYNC_INTERVAL = 30 * 60 * 1000; // 30 minutes
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function triggerSync() {
    console.log(`[${new Date().toISOString()}] 🔄 Starting Automated Drive Sync...`);
    
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        console.error("❌ SUPABASE_URL or SERVICE_ROLE_KEY missing from environment");
        return;
    }

    try {
        const response = await axios.post(
            `${SUPABASE_URL}/functions/v1/sync-drive`,
            { action: 'sync_all' },
            {
                headers: {
                    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`[${new Date().toISOString()}] ✅ Sync Completed:`, response.data);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Sync Failed:`, error.message);
    }
}

// Initial sync on startup
triggerSync();

// Schedule regular sync
setInterval(triggerSync, SYNC_INTERVAL);

console.log("🚀 Sync Worker is running 24/7...");
