# 🚀 Deploying the Sync Function (Updated for Audio/Video)

To make the "Sync Now" button work for **Docs, PDF, Audio, and Video**, use this code.

1. **Go to Supabase Dashboard**
2. Click **Edge Functions** (on the left)
3. Click **Create a new Function** (or Edit existing `sync-drive`)
4. Name it: `sync-drive`
5. Click **Deploy**

## Paste the Code
1. Copy the code below exactly:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const logs: string[] = [];
    const addLog = (msg: string) => {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ${msg}`);
        logs.push(`[${time}] ${msg}`);
    };

    try {
        addLog("🚀 Function started");
        
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        
        if (!supabaseUrl || !serviceKey) {
            throw new Error("Missing Supabase environment variables (URL/ServiceKey)");
        }

        const supabase = createClient(supabaseUrl, serviceKey);
        addLog("✅ Supabase client initialized");

        const body = await req.json().catch(() => ({}));
        const { profileId } = body;
        
        if (!profileId) throw new Error("Missing profileId in request body");
        addLog(`👤 Profile ID: ${profileId}`);

        // 1. Get Integration
        addLog("🔍 Fetching integration...");
        const { data: integration, error: dbError } = await supabase
            .from('user_integrations')
            .select('*')
            .eq('profile_id', profileId)
            .eq('platform', 'google_drive')
            .single();

        if (dbError || !integration) {
            throw new Error(`Integration error: ${dbError?.message || "Not found"}`);
        }
        addLog("✅ Integration found");

        const accessToken = integration.access_token;
        if (!accessToken) throw new Error("Access token is empty");

        // 2. Get User ID
        addLog("🔍 Fetching profile...");
        const { data: profile, error: profileError } = await supabase
            .from('mind_profile')
            .select('user_id')
            .eq('id', profileId)
            .single();

        if (profileError || !profile) {
            throw new Error(`Profile error: ${profileError?.message || "Not found"}`);
        }
        const userId = profile.user_id;
        addLog(`✅ User ID resolved: ${userId}`);

        // 3. Fetch Files
        addLog("📂 Fetching files from Google Drive...");
        const query = "trashed = false and (mimeType contains 'audio/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'application/pdf')";
        const driveRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name, mimeType, size)`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!driveRes.ok) {
            const errText = await driveRes.text();
            throw new Error(`Google Drive API (Status ${driveRes.status}): ${errText.slice(0, 100)}`);
        }
        const { files } = await driveRes.json();
        const filesToProcess = files?.slice(0, 5) || [];
        addLog(`📂 Found ${files?.length || 0} files. Processing latest ${filesToProcess.length}...`);

        let processed = 0;
        const ingestUrl = `${supabaseUrl}/functions/v1/ingest-content`;

        for (const file of filesToProcess) {
            try {
                addLog(`⚙️ Processing: ${file.name} (${file.mimeType})`);
                
                let content = "";
                let subAction = "ingest";

                if (file.mimeType.includes('document')) {
                    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${accessToken}` } });
                    if (r.ok) content = await r.text();
                } else if (file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/')) {
                    subAction = "media";
                } else {
                    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
                    if (r.ok) content = await r.text();
                }

                if (subAction === "media") {
                    addLog(`  🎥 Downloading media...`);
                    const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
                    if (mediaRes.ok) {
                        const blob = await mediaRes.blob();
                        const storagePath = `drive_sync/${userId}/${file.id}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                        addLog(`  📦 Uploading to storage...`);
                        const { error: uploadError } = await supabase.storage.from('knowledge-assets').upload(storagePath, blob, { contentType: file.mimeType, upsert: true });
                        
                        if (!uploadError) {
                            addLog(`  🚀 Triggering ingest-content (media)...`);
                            const response = await fetch(ingestUrl, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'process_media', userId, profileId, filePath: storagePath, fileName: file.name, fileType: file.mimeType })
                            });
                            const result = await response.json();
                            if (result.success) processed++;
                            else addLog(`  ⚠️ Ingest failed: ${result.error}`);
                        } else {
                            addLog(`  ❌ Upload error: ${uploadError.message}`);
                        }
                    }
                } else if (content.length > 10) {
                    addLog(`  📄 Triggering ingest-content (text/pdf)...`);
                    const response = await fetch(ingestUrl, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, profileId, title: file.name, content: content, type: 'file', url: `https://docs.google.com/document/d/${file.id}` })
                    });
                    const result = await response.json();
                    if (result.success) processed++;
                    else addLog(`  ⚠️ Ingest failed: ${result.error}`);
                } else {
                    addLog(`  ⚠️ File too short or download failed.`);
                }
            } catch (innerErr: any) {
                addLog(`  ❌ Sub-task error: ${innerErr.message}`);
            }
        }

        addLog(`⭐ Sync complete! ${processed} items processed.`);
        
        return new Response(JSON.stringify({
            success: true,
            message: `Synced ${processed} items.`,
            count: processed,
            logs: logs
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (err: any) {
        addLog(`❌ CRITICAL ERROR: ${err.message}`);
        return new Response(JSON.stringify({
            success: false,
            error: err.message,
            logs: logs
        }), {
            status: 200, // Always return 200 so we can read the logs in the frontend
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
```

6. Click **Deploy Function** (or Save).

---
**Now "Sync Now" will fetch Audio & Video too!** ✅
