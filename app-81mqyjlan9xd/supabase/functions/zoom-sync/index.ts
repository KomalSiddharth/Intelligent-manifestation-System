import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// zoom-sync — Fetch Zoom webinar attendance → member_attendance
//
// POST /functions/v1/zoom-sync
// Body: {
//   fromDate?: "YYYY-MM-DD",   default: 12 months ago
//   toDate?:   "YYYY-MM-DD",   default: today
//   sessionType?: "DMP",       label stored in session_type column
//   zoomUserId?: "me"          Zoom user whose webinars to fetch
//   dryRun?: true              preview without saving
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
  console.log("✅ [ZOOM] Token obtained");
  return data.access_token;
}

// ── Fetch all past webinars in date range ─────────────────────
async function fetchPastWebinars(
  token: string,
  zoomUserId: string,
  fromDate: string,
  toDate: string
): Promise<any[]> {
  const webinars: any[] = [];
  let nextPageToken = "";

  do {
    const url = new URL(`https://api.zoom.us/v2/users/${zoomUserId}/webinars`);
    url.searchParams.set("type", "past");
    url.searchParams.set("page_size", "300");
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error(`❌ [ZOOM] List webinars failed: ${res.status} ${await res.text()}`);
      break;
    }

    const data = await res.json();
    const batch = (data.webinars ?? []).filter((w: any) => {
      if (!w.start_time) return false;
      const date = w.start_time.split("T")[0];
      return date >= fromDate && date <= toDate;
    });

    webinars.push(...batch);
    nextPageToken = data.next_page_token ?? "";
    console.log(`📅 [ZOOM] Fetched ${webinars.length} webinars so far…`);
  } while (nextPageToken);

  return webinars;
}

// ── Fetch participants for one webinar (Reports API) ──────────
async function fetchWebinarParticipants(
  token: string,
  webinarId: string
): Promise<any[]> {
  const participants: any[] = [];
  let nextPageToken = "";

  do {
    const url = new URL(`https://api.zoom.us/v2/report/webinars/${webinarId}/participants`);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!res.ok) {
      // 400/404 = webinar not eligible for Reports API (too old or wrong type)
      if (res.status !== 404 && res.status !== 400) {
        console.warn(`⚠️ [ZOOM] Participants ${webinarId}: ${res.status}`);
      }
      break;
    }

    const data = await res.json();
    participants.push(...(data.participants ?? []));
    nextPageToken = data.next_page_token ?? "";
  } while (nextPageToken);

  return participants;
}

// ── Main handler ──────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? ""
  );

  const body = await req.json().catch(() => ({}));
  const {
    fromDate,
    toDate,
    sessionType = "DMP",
    zoomUserId  = "me",
    dryRun      = false,
  } = body;

  // Default: last 12 months
  const now     = new Date();
  const ago12m  = new Date(now);
  ago12m.setFullYear(ago12m.getFullYear() - 1);

  const from = fromDate ?? ago12m.toISOString().split("T")[0];
  const to   = toDate   ?? now.toISOString().split("T")[0];

  console.log(`🔄 [ZOOM-SYNC] from=${from} to=${to} sessionType=${sessionType} dryRun=${dryRun}`);

  try {
    // ── Step 1: Zoom auth ──────────────────────────────────────
    const token = await getZoomToken();

    // ── Step 2: Get past webinars ──────────────────────────────
    const webinars = await fetchPastWebinars(token, zoomUserId, from, to);
    console.log(`📋 [ZOOM-SYNC] ${webinars.length} webinars in range`);

    if (webinars.length === 0) {
      return new Response(JSON.stringify({
        success: true, message: "No webinars found in date range",
        webinarsProcessed: 0, attendanceRecords: 0, dateRange: { from, to }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let totalAttendance = 0;
    let totalErrors     = 0;
    let totalSkipped    = 0;   // emails not in audience_users
    const webinarLog: any[] = [];

    // ── Step 3: Process each webinar ──────────────────────────
    for (const webinar of webinars) {
      const webinarId   = String(webinar.id);
      const sessionDate = webinar.start_time.split("T")[0];
      const sessionName = webinar.topic ?? "Zoom Webinar";

      console.log(`🎯 [ZOOM-SYNC] "${sessionName}" — ${sessionDate} (ID: ${webinarId})`);

      // Fetch participants
      const participants = await fetchWebinarParticipants(token, webinarId);
      console.log(`   👥 ${participants.length} participants`);

      if (participants.length === 0) {
        webinarLog.push({ webinarId, sessionName, sessionDate, participants: 0, synced: 0 });
        continue;
      }

      // Deduplicate — Zoom sometimes lists same person multiple times (rejoins)
      // Keep the record with the longest duration
      const byEmail = new Map<string, any>();
      for (const p of participants) {
        const email = (p.user_email ?? "").trim().toLowerCase();
        if (!email) continue;
        const existing = byEmail.get(email);
        if (!existing || (p.duration ?? 0) > (existing.duration ?? 0)) {
          byEmail.set(email, p);
        }
      }

      const uniqueParticipants = [...byEmail.values()];
      const emails = [...byEmail.keys()];

      // Batch lookup audience_users
      const emailToId = new Map<string, string>();
      for (let i = 0; i < emails.length; i += 500) {
        const chunk = emails.slice(i, i + 500);
        const { data } = await supabase
          .from("audience_users")
          .select("id, email")
          .in("email", chunk);
        (data ?? []).forEach((u: any) => emailToId.set(u.email.toLowerCase(), u.id));
      }

      totalSkipped += emails.length - emailToId.size;

      // Build attendance rows
      const rows = uniqueParticipants
        .filter(p => {
          const email = (p.user_email ?? "").trim().toLowerCase();
          return email && emailToId.has(email);
        })
        .map(p => {
          const email       = p.user_email.trim().toLowerCase();
          const durationMin = Math.round(p.duration ?? 0); // Zoom Reports gives minutes
          return {
            audience_user_id:  emailToId.get(email)!,
            session_type:      sessionType,
            session_name:      sessionName,
            session_date:      sessionDate,
            attended:          true,
            watch_duration_mins: durationMin,
            source:            "zoom_api",
            zoom_webinar_id:   webinarId,
          };
        });

      if (dryRun) {
        webinarLog.push({ webinarId, sessionName, sessionDate, participants: participants.length, wouldSync: rows.length });
        totalAttendance += rows.length;
        continue;
      }

      // Batch upsert into member_attendance
      let synced = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { data, error } = await supabase
          .from("member_attendance")
          .upsert(chunk, { onConflict: "audience_user_id,zoom_webinar_id" })
          .select("id");

        if (error) {
          console.error(`❌ [ZOOM-SYNC] Upsert error:`, error.message);
          totalErrors += chunk.length;
        } else {
          synced += data?.length ?? chunk.length;
        }
      }

      totalAttendance += synced;
      webinarLog.push({ webinarId, sessionName, sessionDate, participants: participants.length, synced });
      console.log(`   ✅ Synced ${synced}/${rows.length} attendance records`);

      // Polite rate-limit pause between webinars (Reports API: 1 req/sec)
      await new Promise(r => setTimeout(r, 300));
    }

    // ── Step 4: Log sync ───────────────────────────────────────
    if (!dryRun) {
      try {
        await supabase.from("kajabi_sync_log").insert({
          sync_type:        "zoom_sync",
          event_type:       "webinar_attendance",
          kajabi_payload:   { webinarsProcessed: webinars.length, totalAttendance, totalSkipped, totalErrors, dateRange: { from, to } },
          status:           totalErrors > 0 ? "partial" : "success",
          members_affected: totalAttendance,
        });
      } catch (_) {}
    }

    const summary = {
      success:           true,
      dryRun,
      webinarsProcessed: webinars.length,
      attendanceRecords: totalAttendance,
      skipped:           totalSkipped,
      errors:            totalErrors,
      dateRange:         { from, to },
      webinars:          webinarLog,
    };

    console.log("✅ [ZOOM-SYNC] Complete:", {
      webinars: webinars.length,
      attendance: totalAttendance,
      skipped: totalSkipped,
      errors: totalErrors,
    });

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("❌ [ZOOM-SYNC] Fatal:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
