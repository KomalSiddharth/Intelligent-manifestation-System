import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// sync-recordings — Fetch Zoom Cloud Recording links → session_recordings
//
// POST /functions/v1/sync-recordings
// Body: {
//   fromDate?: "YYYY-MM-DD",   default: 90 days ago
//   toDate?:   "YYYY-MM-DD",   default: today
//   dryRun?:   true            preview without saving
// }
//
// Secrets needed (Supabase Edge Functions → Secrets):
//   ZOOM_ACCOUNT_ID
//   ZOOM_CLIENT_ID
//   ZOOM_CLIENT_SECRET
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Zoom Server-to-Server OAuth ───────────────────────────────
async function getZoomToken(): Promise<string> {
  const accountId    = Deno.env.get("ZOOM_ACCOUNT_ID");
  const clientId     = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Missing ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET secrets");
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Zoom auth failed: ${JSON.stringify(data)}`);
  }
  console.log("✅ [REC-SYNC] Zoom token obtained");
  return data.access_token;
}

// ── Split date range into 1-month chunks ─────────────────────
function getMonthChunks(fromDate: string, toDate: string): { from: string; to: string }[] {
  const chunks: { from: string; to: string }[] = [];
  let cur = new Date(fromDate + "T00:00:00Z");
  const end = new Date(toDate + "T00:00:00Z");

  while (cur < end) {
    const chunkStart = cur.toISOString().split("T")[0];
    const chunkEnd = new Date(cur);
    chunkEnd.setMonth(chunkEnd.getMonth() + 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    const chunkEndStr = chunkEnd.toISOString().split("T")[0];
    if (chunkStart !== chunkEndStr) {
      chunks.push({ from: chunkStart, to: chunkEndStr });
    }
    cur = new Date(chunkEnd);
    cur.setDate(cur.getDate() + 1);
  }
  return chunks;
}

// ── Fetch all account cloud recordings in range ───────────────
async function fetchAllRecordings(token: string, accountId: string, fromDate: string, toDate: string, warnings: string[]): Promise<any[]> {
  const meetings: any[] = [];
  const chunks = getMonthChunks(fromDate, toDate);
  console.log(`📅 [REC-SYNC] ${chunks.length} month chunks (${fromDate} → ${toDate})`);

  for (const { from, to } of chunks) {
    let nextPageToken = "";
    let pageCount = 0;

    do {
      const url = new URL(`https://api.zoom.us/v2/accounts/${accountId}/recordings`);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      url.searchParams.set("page_size", "300");
      if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

      const res = await fetch(url.toString(), {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.text();
        const msg = `recordings ${from}→${to}: ${res.status} — ${body.slice(0, 200)}`;
        console.warn(`⚠️ [REC-SYNC] ${msg}`);
        warnings.push(msg);
        break;
      }

      const data = await res.json();
      meetings.push(...(data.meetings ?? []));
      nextPageToken = data.next_page_token ?? "";
      pageCount++;
    } while (nextPageToken && pageCount < 20);

    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`📋 [REC-SYNC] ${meetings.length} meetings with recordings found`);
  return meetings;
}

// ── Auto-detect session type from meeting/webinar name ────────
function detectSessionType(sessionName: string): string {
  const name = sessionName.toLowerCase();

  if (name.includes("daily magic") || name.startsWith("dmp")) return "DMP";
  if (name.includes("chakra")) return "CHAKRA";
  if (name.includes("platinum")) return "PLATINUM";
  if (name.includes("wealth mastery") || name.includes("new wealth")) return "WEALTH_MASTERY";
  if (name.includes("relationship mastery")) return "RELATIONSHIP_MASTERY";
  if (name.includes("mind mastery")) return "MIND_MASTERY";
  if (name.includes("ho'oponopono") || name.includes("hooponopono") || name.includes("ho oponopono")) return "HOOPONOPONO";
  if (name.includes("advance loa") || name.includes("advance law of attraction")) return "ADVANCE_LOA";
  if (name.includes("nlp live") || name.startsWith("nlp")) return "NLP";
  if (name.includes("eft live") || name.startsWith("eft")) return "EFT";
  if (name.includes("life coaching")) return "LIFE_COACHING";
  if (name.includes("ai manifestation") || name.includes("manifestation method")) return "AI_MANIFESTATION";
  if (name.includes("manifest with")) return "MANIFESTATION";
  if (name.includes("brad yates")) return "BRAD_YATES";
  if (name.includes("orientation call")) return "ORIENTATION";
  if (name.includes("new year") || name.includes("celebration")) return "SPECIAL_EVENT";
  if (name.includes("masterclass") || name.includes("master class")) return "MASTERCLASS";
  if (name.includes("workshop")) return "WORKSHOP";
  if (name.includes("q&a") || name.includes("q & a")) return "QNA";
  if (name.includes("healing")) return "HEALING";
  if (name.includes("meditation")) return "MEDITATION";

  return "OTHER";
}

// ── Check if session is an internal/private meeting to skip ──
function isInternalMeeting(sessionName: string): boolean {
  const name = sessionName.toLowerCase();

  if (name.includes("personal meeting room")) return true;
  if (name.includes("test meeting")) return true;

  const internalPatterns = [
    "meeting with", "podcast with", "shoot with", "demo with", "coaching for mi",
    "meeting with raj shamani", "meeting with tw", "meeting with rhea",
    "meeting with kanishka", "meeting with winter", "meeting with geetanjali",
    "meeting with auditor", "meeting with insurance", "meeting with cashfree",
    "meeting with pr team", "meeting with brad yates",
  ];
  if (internalPatterns.some(p => name.includes(p))) return true;

  return false;
}

// ── Pick the best playable recording file from a meeting ──────
function pickBestFile(recordingFiles: any[]): any | null {
  const playable = (recordingFiles ?? []).filter(
    (f: any) => f.status === "completed" && f.file_type !== "TIMELINE" && f.file_type !== "CHAT"
  );
  if (playable.length === 0) return null;

  const priority = ["shared_screen_with_speaker_view", "shared_screen_with_gallery_view", "shared_screen", "active_speaker"];
  for (const type of priority) {
    const match = playable.find((f: any) => f.recording_type === type);
    if (match) return match;
  }
  return playable.find((f: any) => f.file_type === "MP4") ?? playable[0];
}

// ── Main handler ──────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? ""
  );

  const body = await req.json().catch(() => ({}));
  const { fromDate, toDate, dryRun = false } = body;

  const now    = new Date();
  const ago90d = new Date(now);
  ago90d.setDate(ago90d.getDate() - 90);

  const from = fromDate ?? ago90d.toISOString().split("T")[0];
  const to   = toDate   ?? now.toISOString().split("T")[0];

  console.log(`🔄 [REC-SYNC] from=${from} to=${to} dryRun=${dryRun}`);

  try {
    const accountId = Deno.env.get("ZOOM_ACCOUNT_ID")!;
    const token = await getZoomToken();
    const warnings: string[] = [];
    const meetings = await fetchAllRecordings(token, accountId, from, to, warnings);

    if (meetings.length === 0) {
      return new Response(JSON.stringify({
        success: true, message: "No recordings found in date range",
        recordingsFound: 0, recordingsSaved: 0, dateRange: { from, to }, warnings,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let saved = 0;
    let skippedInternal = 0;
    let skippedNoFile = 0;
    let errors = 0;
    const log: any[] = [];

    for (const meeting of meetings) {
      const sessionName = meeting.topic ?? "Zoom Session";
      const sessionDate = (meeting.start_time ?? "").split("T")[0];
      const meetingUuid = String(meeting.uuid ?? meeting.id);

      if (isInternalMeeting(sessionName)) {
        skippedInternal++;
        continue;
      }

      const bestFile = pickBestFile(meeting.recording_files ?? []);
      if (!bestFile) {
        skippedNoFile++;
        continue;
      }

      const sessionType = detectSessionType(sessionName);
      const recordingUrl = meeting.share_url ?? bestFile.play_url ?? bestFile.share_url;
      if (!recordingUrl) {
        skippedNoFile++;
        continue;
      }

      const row = {
        session_type:    sessionType,
        session_name:    sessionName,
        session_date:    sessionDate || new Date().toISOString().split("T")[0],
        recording_url:   recordingUrl,
        password:        meeting.password ?? meeting.recording_play_passcode ?? null,
        duration_mins:   meeting.duration ?? null,
        zoom_meeting_id: meetingUuid,
        source:          "zoom_api",
        updated_at:      new Date().toISOString(),
      };

      log.push({ sessionName, sessionDate, sessionType, meetingUuid });

      if (dryRun) { saved++; continue; }

      const { error } = await supabase
        .from("session_recordings")
        .upsert(row, { onConflict: "zoom_meeting_id" });

      if (error) {
        console.error(`❌ [REC-SYNC] Upsert error for "${sessionName}": ${error.message}`);
        errors++;
      } else {
        saved++;
      }
    }

    const summary = {
      success: true,
      dryRun,
      recordingsFound: meetings.length,
      recordingsSaved: saved,
      skippedInternal,
      skippedNoFile,
      errors,
      dateRange: { from, to },
      sample: log.slice(0, 20),
    };

    console.log("✅ [REC-SYNC] Complete:", { found: meetings.length, saved, skippedInternal, skippedNoFile, errors });

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("❌ [REC-SYNC] Fatal:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
