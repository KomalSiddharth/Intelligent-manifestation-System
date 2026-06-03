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

// ── Fetch past sessions from Dashboard API ────────────────────
// Zoom Dashboard API max range = 1 month per request, last 6 months only
// Tries both /metrics/webinars and /metrics/meetings
async function fetchPastWebinars(
  token: string,
  _zoomUserId: string,
  fromDate: string,
  toDate: string
): Promise<any[]> {
  const sessions: any[] = [];
  const chunks = getMonthChunks(fromDate, toDate);
  console.log(`📅 [ZOOM] ${chunks.length} month chunks to fetch`);

  for (const { from, to } of chunks) {
    // Try both webinars and meetings — DMP might be either type
    for (const endpoint of ["webinars", "meetings"]) {
      let nextPageToken = "";
      let pageCount = 0;

      do {
        const url = new URL(`https://api.zoom.us/v2/metrics/${endpoint}`);
        url.searchParams.set("type", "past");
        url.searchParams.set("from", from);
        url.searchParams.set("to", to);
        url.searchParams.set("page_size", "300");
        if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

        const res = await fetch(url.toString(), {
          headers: { "Authorization": `Bearer ${token}` },
        });

        if (!res.ok) {
          const body = await res.text();
          // 400 code=300 = date out of 6-month range — skip silently
          if (res.status === 400 && body.includes("300")) break;
          console.warn(`⚠️ [ZOOM] metrics/${endpoint} ${from}→${to}: ${res.status}`);
          break;
        }

        const data = await res.json();
        const items = data[endpoint] ?? [];
        // Tag each item with its type so we know which participant endpoint to call
        items.forEach((item: any) => { item._type = endpoint === "webinars" ? "webinar" : "meeting"; });
        sessions.push(...items);
        nextPageToken = data.next_page_token ?? "";
        pageCount++;
      } while (nextPageToken && pageCount < 20);
    }

    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`📅 [ZOOM] Total sessions found: ${sessions.length} (webinars+meetings combined)`);
  if (sessions.length > 0) {
    console.log(`📋 [ZOOM] Sample:`, JSON.stringify(sessions[0]).slice(0, 250));
  }
  return sessions;
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

// ── Fetch participants via Reports API ────────────────────────
// Works for both meetings and webinars
async function fetchWebinarParticipants(
  token: string,
  sessionId: string,
  sessionType: "webinar" | "meeting" = "webinar"
): Promise<any[]> {
  const participants: any[] = [];
  let nextPageToken = "";

  // Try both report endpoints — webinar first, then meeting as fallback
  const endpoints =
    sessionType === "webinar"
      ? [`report/webinars/${sessionId}/participants`, `report/meetings/${sessionId}/participants`]
      : [`report/meetings/${sessionId}/participants`, `report/webinars/${sessionId}/participants`];

  for (const endpoint of endpoints) {
    participants.length = 0; // reset between attempts
    nextPageToken = "";

    do {
      const url = new URL(`https://api.zoom.us/v2/${endpoint}`);
      url.searchParams.set("page_size", "300");
      if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

      const res = await fetch(url.toString(), {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 404 || res.status === 400) break; // try fallback
        console.warn(`⚠️ [ZOOM] ${endpoint}: ${res.status}`);
        break;
      }

      const data = await res.json();
      participants.push(...(data.participants ?? []));
      nextPageToken = data.next_page_token ?? "";
    } while (nextPageToken);

    if (participants.length > 0) break; // got data, no need to try fallback
  }

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

  // Default: last 6 months (Zoom Dashboard API hard limit)
  const now    = new Date();
  const ago6m  = new Date(now);
  ago6m.setMonth(ago6m.getMonth() - 6);

  const from = fromDate ?? ago6m.toISOString().split("T")[0];
  const to   = toDate   ?? now.toISOString().split("T")[0];

  console.log(`🔄 [ZOOM-SYNC] from=${from} to=${to} sessionType=${sessionType} dryRun=${dryRun}`);

  try {
    // ── Step 1: Zoom auth ──────────────────────────────────────
    const token = await getZoomToken();

    // ── Step 2: Get past webinars ──────────────────────────────
    const webinars = await fetchPastWebinars(token, zoomUserId, from, to);
    console.log(`📋 [ZOOM-SYNC] ${webinars.length} webinars in range`);
    if (webinars.length > 0) {
      console.log(`📋 [ZOOM-SYNC] Sample webinar:`, JSON.stringify(webinars[0]).slice(0, 300));
    }

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
      // metrics API returns both id (numeric) and uuid (string)
      // Reports API works best with the numeric id
      const webinarId   = String(webinar.id ?? webinar.uuid);
      const sessionDate = (webinar.start_time ?? webinar.created_at ?? "").split("T")[0];
      const sessionName = webinar.topic ?? webinar.subject ?? "Zoom Webinar";

      console.log(`🎯 [ZOOM-SYNC] "${sessionName}" — ${sessionDate} (ID: ${webinarId})`);

      // Fetch participants (pass session type for correct endpoint)
      const participants = await fetchWebinarParticipants(token, webinarId, webinar._type ?? "webinar");
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
