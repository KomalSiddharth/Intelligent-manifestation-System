import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import mammoth from "https://esm.sh/mammoth@1.6.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function refreshGoogleToken(supabase: SupabaseClient, integration: any) {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
        throw new Error("GDrive Token Expired. (Tip: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Supabase for auto-refresh)");
    }

    if (!integration.refresh_token) {
        throw new Error("No refresh token available. Please reconnect Google Drive.");
    }

    console.log("🔄 [SYNC] Refreshing Google Access Token...");
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: integration.refresh_token,
            grant_type: "refresh_token",
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        console.error("❌ [SYNC] Token refresh failed:", err);
        throw new Error("Failed to refresh Google Token. Please reconnect.");
    }

    const data = await res.json();
    const newAccessToken = data.access_token;

    // Save back to DB
    await supabase
        .from('user_integrations')
        .update({ access_token: newAccessToken, updated_at: new Date().toISOString() })
        .eq('id', integration.id);

    return newAccessToken;
}

/**
 * Core Logic: Sync ONE specific profile
 */
async function syncOneProfile(supabase: SupabaseClient, profileId: string, supabaseUrl: string, serviceKey: string, folderUrl?: string) {
    console.log(`[SYNC] Starting sync for profile: ${profileId}${folderUrl ? ` with folder: ${folderUrl}` : ''}`);

    // 1. Get Integration
    const { data: integrationData, error: dbError } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('profile_id', profileId)
        .eq('platform', 'google_drive')
        .order('created_at', { ascending: false })
        .limit(1);

    const integration = integrationData?.[0];

    if (dbError || !integration) throw new Error(`Integration not found for ${profileId}`);
    let accessToken = integration.access_token;

    // 2. Get User ID
    const { data: profile } = await supabase.from('mind_profile').select('user_id').eq('id', profileId).single();
    const userId = profile?.user_id;
    if (!userId) throw new Error(`User ID not found for ${profileId}`);

    // 3. Extract Folder/File ID if URL provided
    let folderQuery = "trashed=false";
    let isSingleFile = false;
    let targetId = "";

    if (folderUrl) {
        // Match Folder ID: folders/... OR ?id=...
        const folderIdMatch = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/) || folderUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        // Match File ID: /d/... OR id=...
        const fileIdMatch = folderUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);

        if (folderIdMatch && folderIdMatch[1] && folderUrl.includes('folders')) {
            folderQuery = `'${folderIdMatch[1]}' in parents and trashed=false`;
            console.log(`[SYNC] Targeted Folder Query: ${folderQuery}`);
        } else if (fileIdMatch && fileIdMatch[1]) {
            isSingleFile = true;
            targetId = fileIdMatch[1];
            console.log(`[SYNC] Targeted File ID: ${targetId}`);
        } else {
            throw new Error("Could not extract a valid Folder or File ID from the link. Please ensure it's a standard Google Drive link.");
        }
    }

    // 4. Fetch Files
    let fetchUrl = "";
    if (isSingleFile) {
        fetchUrl = `https://www.googleapis.com/drive/v3/files/${targetId}?fields=id, name, mimeType, trashed&supportsAllDrives=true`;
    } else {
        const pageSize = 100; // Limit for list search
        fetchUrl = `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&orderBy=modifiedTime desc&fields=files(id, name, mimeType, trashed)&q=${encodeURIComponent(folderQuery)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    }

    let driveRes = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (!driveRes.ok && driveRes.status === 401) {
        accessToken = await refreshGoogleToken(supabase, integration);
        driveRes = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    if (!driveRes.ok) {
        if (driveRes.status === 401) throw new Error("GDrive Token Expired");
        throw new Error(`GDrive API Error: ${driveRes.status}`);
    }

    const resJson = await driveRes.json();
    const files = isSingleFile ? [resJson] : (resJson.files || []);

    const supportedMimeTypes = [
        'application/vnd.google-apps.document',
        'application/vnd.google-apps.spreadsheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/plain',
        'application/pdf',
        'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/x-m4a',
        'audio/flac', 'audio/ogg', 'audio/opus', 'audio/vnd.wave', 'audio/x-wav',
        'video/mp4', 'video/mpeg', 'video/webm'
    ];

    // Helper to recursively find files if it's a folder
    async function getFilesRecursively(fid: string, depth = 0): Promise<any[]> {
        if (depth > 3) return []; // Limit depth to prevent infinite loops/timeouts
        const q = `'${fid}' in parents and trashed = false`;
        const url = `https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id, name, mimeType, parents)&q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) return [];
        const { files: foundFiles } = await res.json();
        let all: any[] = [];
        for (const f of (foundFiles || [])) {
            if (f.mimeType === 'application/vnd.google-apps.folder') {
                const sub = await getFilesRecursively(f.id, depth + 1);
                all = [...all, ...sub];
            } else {
                all.push(f);
            }
        }
        return all;
    }

    let allFiles: any[] = [];
    if (isSingleFile) {
        allFiles = [resJson];
    } else if (folderUrl) {
        const folderIdMatch = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/) || folderUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (folderIdMatch) {
            allFiles = await getFilesRecursively(folderIdMatch[1]);
        }
    } else {
        allFiles = resJson.files || [];
    }

    const filteredFiles = allFiles.filter((f: any) =>
        supportedMimeTypes.some(type => f.mimeType.includes(type))
    );

    // DEDUPLICATION BEFORE SLICING
    const filesToProcess: any[] = [];
    for (const file of filteredFiles) {
        if (filesToProcess.length >= 10) break;

        const storagePath = `drive_sync/${userId}/${file.id}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const gDocUrl = `https://docs.google.com/document/d/${file.id}`;

        const { data: existing } = await supabase
            .from('knowledge_sources')
            .select('id')
            .or(`source_url.eq."${storagePath}",source_url.eq."${gDocUrl}"`)
            .maybeSingle();

        if (!existing) {
            filesToProcess.push(file);
        } else {
            console.log(`⏩ [SYNC] Skipping ${file.name} (Already exists)`);
        }
    }

    let processed = 0;
    const ingestUrl = `${supabaseUrl}/functions/v1/ingest-content`;

    for (const file of filesToProcess) {
        try {
            const storagePath = `drive_sync/${userId}/${file.id}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const gDocUrl = `https://docs.google.com/document/d/${file.id}`;
            let content = "";
            const isMedia = file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/');
            const isDocx = file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            const isGoogleDoc = file.mimeType === 'application/vnd.google-apps.document';
            const isGoogleSheet = file.mimeType === 'application/vnd.google-apps.spreadsheet';
            const isExcel = file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.mimeType === 'application/vnd.ms-excel';

            if (isGoogleDoc) {
                const r = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${accessToken}` } });
                if (r.ok) content = await r.text();
            } else if (isGoogleSheet) {
                // Export Google Sheet as CSV for text ingestion
                const r = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`, { headers: { Authorization: `Bearer ${accessToken}` } });
                if (r.ok) content = await r.text();
            } else if (isDocx) {
                const r = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
                if (r.ok) {
                    const arrayBuffer = await r.arrayBuffer();
                    const result = await mammoth.extractRawText({ arrayBuffer: new Uint8Array(arrayBuffer) });
                    content = result.value;
                }
            } else if (isExcel) {
                const r = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
                if (r.ok) {
                    const arrayBuffer = await r.arrayBuffer();
                    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                    // Convert first sheet to CSV-like text
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    content = XLSX.utils.sheet_to_csv(worksheet);
                }
            } else if (!isMedia) {
                const r = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
                if (r.ok) content = await r.text();
            }

            if (isMedia) {
                const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
                if (mediaRes.ok && mediaRes.body) {
                    const storagePath = `drive_sync/${userId}/${file.id}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

                    // STREAM UPLOAD (No Blob buffering to avoid OOM)
                    const { error: uploadError } = await supabase.storage.from('knowledge-assets').upload(storagePath, mediaRes.body, {
                        contentType: file.mimeType,
                        upsert: true,
                        duplex: 'half' // Required for streaming in Deno
                    });

                    if (!uploadError) {
                        try {
                            console.log(`✅ [SYNC] Uploaded ${file.name}. Triggering ingestion...`);

                            // Pass folderId so transcription is associated correctly
                            const response = await fetch(ingestUrl, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    action: 'process_media',
                                    userId,
                                    profileId,
                                    filePath: storagePath,
                                    fileName: file.name,
                                    fileType: file.mimeType,
                                    folderId: folderUrl?.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1] // Extract from URL if possible
                                })
                            });

                            const result = await response.json();

                            if (response.ok && result.success) {
                                console.log(`✅ [SYNC] Ingestion started for ${file.name}`);
                                processed++;
                            } else {
                                console.error(`❌ [SYNC] Ingestion rejected for ${file.name}:`, result);
                            }
                        } catch (ingestErr: any) {
                            console.error(`❌ [SYNC] Ingestion call failed for ${file.name}:`, ingestErr.message);
                        }
                    }
                }
            } else if (content.trim().length > 10) {
                const response = await fetch(ingestUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, profileId, title: file.name, content: content, type: 'file', url: `https://docs.google.com/document/d/${file.id}` })
                });
                const result = await response.json();
                if (result.success) processed++;
            }
        } catch (e) {
            console.error(`❌ Error in ${file.name}:`, e.message);
        }
    }
    return processed;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY");

        if (!supabaseUrl || !serviceKey) {
            throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
        }

        const supabase = createClient(supabaseUrl, serviceKey);

        const body = await req.json().catch(() => ({}));
        const { profileId, action, driveFolderUrl } = body;

        // MODE 1: Sync ALL (For Cron)
        if (action === 'sync_all' || (!profileId && action !== 'sync_individual')) {
            console.log("🚀 [GLOBAL SYNC] Fetching all active Google Drive integrations...");
            const { data: integrations } = await supabase
                .from('user_integrations')
                .select('profile_id')
                .eq('platform', 'google_drive')
                .eq('is_active', true);

            if (!integrations || integrations.length === 0) {
                return new Response(JSON.stringify({ success: true, message: "No active integrations found." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            console.log(`[GLOBAL SYNC] Found ${integrations.length} profiles to sync.`);
            let totalProcessed = 0;
            for (const item of integrations) {
                try {
                    const count = await syncOneProfile(supabase, item.profile_id, supabaseUrl, serviceKey);
                    totalProcessed += count;
                } catch (e) {
                    console.error(`❌ Failed sync for ${item.profile_id}:`, e.message);
                }
            }

            return new Response(JSON.stringify({ success: true, totalProcessed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // MODE 2: Sync Individual (Existing UI behavior)
        const count = await syncOneProfile(supabase, profileId, supabaseUrl, serviceKey, driveFolderUrl);

        return new Response(JSON.stringify({
            success: true,
            message: `Synced ${count} items.`,
            count: count
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (err: any) {
        console.error("❌ [SYNC CRITICAL]:", err.message);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
