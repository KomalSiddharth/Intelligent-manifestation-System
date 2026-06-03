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

// ── Fetch past sessions — tries 3 different API paths ─────────
//  Path A: Dashboard API /metrics/webinars  (needs dashboard scope)
//  Path B: Dashboard API /metrics/meetings  (needs dashboard scope)
//  Path C: Reports API   /report/users/me/meetings (different scope — fallback)
async function fetchPastWebinars(
  token: string,
  zoomUserId: string,
  fromDate: string,
  toDate: string
): Promise<any[]> {
  const sessions: any[] = [];
  const chunks = getMonthChunks(fromDate, toDate);
  console.log(`📅 [ZOOM] ${chunks.length} month chunks | paths: metrics/webinars, metrics/meetings, report/users/meetings`);

  // ── PATH A & B: Dashboard/Metrics API ─────────────────────
  for (const { from, to } of chunks) {
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
          if (res.status === 400 && body.includes("300")) break; // date out of range — silent
          console.warn(`⚠️ [ZOOM] metrics/${endpoint} ${from}→${to}: ${res.status} — ${body.slice(0,100)}`);
          break;
        }

        const data = await res.json();
        const items = (data[endpoint] ?? []) as any[];
        items.forEach(item => { item._type = endpoint === "webinars" ? "webinar" : "meeting"; });
        sessions.push(...items);
        nextPageToken = data.next_page_token ?? "";
        pageCount++;
      } while (nextPageToken && pageCount < 20);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`📊 [ZOOM] Path A+B (metrics): ${sessions.length} sessions found`);

  // ── PATH C: Reports API (fallback if metrics returns 0) ────
  // Uses different scopes: report:read:meeting:admin
  if (sessions.length === 0) {
    console.log(`🔄 [ZOOM] Trying fallback: report/users/${zoomUserId}/meetings`);

    for (const { from, to } of chunks) {
      let nextPageToken = "";
      let pageCount = 0;

      do {
        const url = new URL(`https://api.zoom.us/v2/report/users/${zoomUserId}/meetings`);
        url.searchParams.set("from", from);
        url.searchParams.set("to", to);
        url.searchParams.set("page_size", "300");
        url.searchParams.set("type", "past");
        if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

        const res = await fetch(url.toString(), {
          headers: { "Authorization": `Bearer ${token}` },
        });

        if (!res.ok) {
          const body = await res.text();
          if (res.status === 400 && body.includes("300")) break;
          console.warn(`⚠️ [ZOOM] report/users/meetings ${from}→${to}: ${res.status} ${body.slice(0,100)}`);
          break;
        }

        const data = await res.json();
        const items = (data.meetings ?? []) as any[];
        items.forEach(item => { item._type = "meeting"; });
        sessions.push(...items);
        nextPageToken = data.next_page_token ?? "";
        pageCount++;
      } while (nextPageToken && pageCount < 20);

      await new Promise(r => setTimeout(r, 150));
    }

    console.log(`📊 [ZOOM] Path C (report/users): ${sessions.length} sessions found`);
  }

  if (sessions.length > 0) {
    console.log(`✅ [ZOOM] Total: ${sessions.length} sessions | Sample: ${JSON.stringify(sessions[0]).slice(0, 200)}`);
  } else {
    console.warn(`⚠️ [ZOOM] ALL 3 paths returned 0 sessions. Check scopes or confirm account has past meetings/webinars.`);
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

// ── Check if session is an internal/private meeting to skip ──
function isInternalMeeting(sessionName: string, participantCount: number): boolean {
  const name = sessionName.toLowerCase();

  // Skip Mitesh's personal meeting room
  if (name.includes("personal meeting room")) return true;
  if (name.includes("zoom meeting") && participantCount < 10) return true;

  // Skip clearly internal meetings (low participant count + meeting name pattern)
  const internalPatterns = [
    "meeting with", "podcast with", "shoot with", "demo with",
    "coaching for mi", "advance law of attraction" // single entry with 1 participant
  ];
  if (participantCount <= 5 && internalPatterns.some(p => name.includes(p))) return true;

  // Skip test meetings
  if (name.includes("test meeting")) return true;

  // Skip meetings where it's clearly a business/personal call
  const businessPatterns = [
    "meeting with raj shamani", "meeting with tw", "meeting with rhea",
    "meeting with kanishka", "meeting with winter", "meeting with geetanjali",
    "meeting with auditor", "meeting with insurance", "meeting with cashfree",
    "meeting with pr team", "meeting with brad yates"
  ];
  if (businessPatterns.some(p => name.includes(p))) return true;

  return false;
}

// ── Auto-detect session type from meeting/webinar name ────────
function detectSessionType(sessionName: string, fallback: string): string {
  const name = sessionName.toLowerCase();

  // Daily Magic Practice
  if (name.includes("daily magic") || name.startsWith("dmp"))
    return "DMP";

  // Chakra
  if (name.includes("chakra"))
    return "CHAKRA";

  // Platinum (all platinum sub-types stay as PLATINUM)
  if (name.includes("platinum"))
    return "PLATINUM";

  // Wealth Mastery
  if (name.includes("wealth mastery") || name.includes("new wealth"))
    return "WEALTH_MASTERY";

  // Relationship Mastery
  if (name.includes("relationship mastery"))
    return "RELATIONSHIP_MASTERY";

  // Mind Mastery
  if (name.includes("mind mastery"))
    return "MIND_MASTERY";

  // Ho'Oponopono
  if (name.includes("ho'oponopono") || name.includes("hooponopono") || name.includes("ho oponopono"))
    return "HOOPONOPONO";

  // Advance LOA / Law of Attraction
  if (name.includes("advance loa") || name.includes("advance law of attraction"))
    return "ADVANCE_LOA";

  // NLP
  if (name.includes("nlp live") || name.startsWith("nlp"))
    return "NLP";

  // EFT
  if (name.includes("eft live") || name.startsWith("eft"))
    return "EFT";

  // Life Coaching
  if (name.includes("life coaching"))
    return "LIFE_COACHING";

  // AI / Manifestation Method
  if (name.includes("ai manifestation") || name.includes("manifestation method"))
    return "AI_MANIFESTATION";

  // Manifest with IMK
  if (name.includes("manifest with"))
    return "MANIFESTATION";

  // Brad Yates
  if (name.includes("brad yates"))
    return "BRAD_YATES";

  // Orientation
  if (name.includes("orientation call"))
    return "ORIENTATION";

  // Special Events
  if (name.includes("new year") || name.includes("celebration"))
    return "SPECIAL_EVENT";

  // Masterclass / Workshop / Q&A
  if (name.includes("masterclass") || name.includes("master class")) return "MASTERCLASS";
  if (name.includes("workshop")) return "WORKSHOP";
  if (name.includes("q&a") || name.includes("q & a")) return "QNA";

  // Healing / Meditation
  if (name.includes("healing")) return "HEALING";
  if (name.includes("meditation")) return "MEDITATION";

  return fallback;
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
    sessionType   = "DMP",
    zoomUserId    = "me",
    dryRun        = false,
    maxSessions   = 10,
    sessionFilter = "",
    listOnly      = false,
    offset        = 0,
    // ── Direct session mode — skip fetchPastWebinars entirely ──
    sessionId     = null,   // Zoom meeting/webinar ID
    sessionZoomType = "meeting", // "meeting" or "webinar"
    sessionName   = null,
    sessionDate   = null,
    detectedLabel = null,
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

    // ── DIRECT SESSION MODE — one page of participants at a time ──
    if (sessionId) {
      const sName     = sessionName ?? "Zoom Session";
      const sDate     = sessionDate ?? new Date().toISOString().split("T")[0];
      const sType     = detectedLabel ?? detectSessionType(sName, sessionType);
      const sZoomType = sessionZoomType === "webinar" ? "webinar" : "meeting";
      const pageToken = body.pageToken ?? "";   // empty = first page
      const isFirstPage = !pageToken;

      console.log(`🎯 [ZOOM-SYNC] "${sName}" page=${pageToken ? "next" : "first"} (ID: ${sessionId})`);

      // On first page — clear old records for this session
      if (isFirstPage && !dryRun) {
        await supabase.from("member_attendance").delete().eq("zoom_webinar_id", sessionId);
        console.log(`   🗑️  Cleared old records for session ${sessionId}`);
      }

      // Fetch ONE page of participants (300 max)
      const endpoint1 = sZoomType === "webinar"
        ? `report/webinars/${sessionId}/participants`
        : `report/meetings/${sessionId}/participants`;
      const endpoint2 = sZoomType === "webinar"
        ? `report/meetings/${sessionId}/participants`
        : `report/webinars/${sessionId}/participants`;

      let participants: any[] = [];
      let nextPageToken = "";

      for (const endpoint of [endpoint1, endpoint2]) {
        const url = new URL(`https://api.zoom.us/v2/${endpoint}`);
        url.searchParams.set("page_size", "300");
        if (pageToken) url.searchParams.set("next_page_token", pageToken);

        const res = await fetch(url.toString(), {
          headers: { "Authorization": `Bearer ${token}` },
        });

        if (!res.ok) {
          if (res.status === 404 || res.status === 400) continue;
          throw new Error(`Zoom API ${endpoint}: ${res.status}`);
        }

        const data = await res.json();
        participants = data.participants ?? [];
        nextPageToken = data.next_page_token ?? "";
        if (participants.length > 0) break;
      }

      console.log(`   👥 ${participants.length} participants this page, nextToken=${nextPageToken ? "yes" : "done"}`);

      // Match emails to audience_users
      const emails = [...new Set(
        participants.map((p: any) => (p.user_email ?? "").trim().toLowerCase()).filter(Boolean)
      )];

      const emailToId = new Map<string, string>();
      for (let i = 0; i < emails.length; i += 500) {
        const { data } = await supabase.from("audience_users").select("id, email").in("email", emails.slice(i, i + 500));
        (data ?? []).forEach((u: any) => emailToId.set(u.email.toLowerCase(), u.id));
      }

      const rows = participants
        .filter((p: any) => emailToId.has((p.user_email ?? "").trim().toLowerCase()))
        .map((p: any) => ({
          audience_user_id:    emailToId.get(p.user_email.trim().toLowerCase())!,
          session_type:        sType,
          session_name:        sName,
          session_date:        sDate,
          attended:            true,
          watch_duration_mins: Math.round((p.duration ?? 0) / 60),
          source:              "zoom_api",
          zoom_webinar_id:     sessionId,
        }));

      let synced = 0;
      if (!dryRun && rows.length > 0) {
        const { data, error } = await supabase.from("member_attendance").insert(rows).select("id");
        if (error) console.error(`❌ Insert error: ${error.message}`);
        else synced = data?.length ?? rows.length;
      }

      return new Response(JSON.stringify({
        success:        true,
        attendanceRecords: synced,
        skipped:        emails.length - emailToId.size,
        nextPageToken,          // empty = all pages done
        done:           !nextPageToken,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Step 2: Get past webinars ──────────────────────────────
    const webinars = await fetchPastWebinars(token, zoomUserId, from, to);
    console.log(`📋 [ZOOM-SYNC] ${webinars.length} total sessions found`);

    if (webinars.length === 0) {
      return new Response(JSON.stringify({
        success: true, message: "No sessions found in date range",
        webinarsProcessed: 0, attendanceRecords: 0, dateRange: { from, to }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── listOnly mode: just return all session names, no participant fetch ──
    if (listOnly) {
      const allSessions = webinars.map((w: any) => {
        const name    = w.topic ?? w.subject ?? "Unknown";
        const pCount  = w.participants_count ?? w.participants ?? 0;
        const skip    = isInternalMeeting(name, pCount);
        const label   = skip ? "SKIP" : detectSessionType(name, sessionType);
        return {
          id:    String(w.id ?? w.uuid),
          name,
          date:  (w.start_time ?? "").split("T")[0],
          type:  w._type,
          participants: pCount,
          detectedLabel: label,
          skip,
        };
      });
      const toSync   = allSessions.filter(s => !s.skip);
      const skipped  = allSessions.filter(s => s.skip);
      return new Response(JSON.stringify({
        success: true,
        total:        allSessions.length,
        toSync:       toSync.length,
        skippedInternal: skipped.length,
        sessions:     allSessions,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Apply optional name filter
    let toProcess = sessionFilter
      ? webinars.filter((w: any) =>
          (w.topic ?? w.subject ?? "").toLowerCase().includes(sessionFilter.toLowerCase()))
      : webinars;

    // Apply offset + limit for pagination (process batches without re-fetching from beginning)
    const totalFound = toProcess.length;
    toProcess = toProcess.slice(offset, offset + maxSessions);
    console.log(`🔢 [ZOOM-SYNC] Processing ${toProcess.length}/${totalFound} sessions (maxSessions=${maxSessions})`);

    let totalAttendance = 0;
    let totalErrors     = 0;
    let totalSkipped    = 0;
    const webinarLog: any[] = [];

    // ── Step 3: Process each session ──────────────────────────
    for (const webinar of toProcess) {
      const webinarId   = String(webinar.id ?? webinar.uuid);
      const sessionDate = (webinar.start_time ?? webinar.created_at ?? "").split("T")[0];
      const sessionName = webinar.topic ?? webinar.subject ?? "Zoom Webinar";
      const pCount      = webinar.participants_count ?? webinar.participants ?? 0;

      // Skip internal/personal meetings
      if (isInternalMeeting(sessionName, pCount)) {
        console.log(`⏭️  [ZOOM-SYNC] Skipping internal: "${sessionName}"`);
        continue;
      }

      console.log(`🎯 [ZOOM-SYNC] "${sessionName}" — ${sessionDate} (ID: ${webinarId})`);

      // Fetch participants (pass session type for correct endpoint)
      const participants = await fetchWebinarParticipants(token, webinarId, webinar._type ?? "webinar");
      console.log(`   👥 ${participants.length} participants`);

      if (participants.length === 0) {
        webinarLog.push({ webinarId, sessionName, sessionDate, participants: 0, synced: 0 });
        continue;
      }

      // Debug: show sample participant to confirm email field name
      if (participants.length > 0) {
        const sample = participants[0];
        console.log(`🔍 [ZOOM-SYNC] Sample participant fields: ${Object.keys(sample).join(", ")}`);
        console.log(`🔍 [ZOOM-SYNC] Sample participant: name="${sample.name}" email="${sample.user_email}" duration=${sample.duration}`);
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

      // Auto-detect session type from session name
      // Falls back to the manually provided sessionType label
      const detectedType = detectSessionType(sessionName, sessionType);

      // Build attendance rows
      const rows = uniqueParticipants
        .filter(p => {
          const email = (p.user_email ?? "").trim().toLowerCase();
          return email && emailToId.has(email);
        })
        .map(p => {
          const email          = p.user_email.trim().toLowerCase();
          // Zoom Reports API returns duration in SECONDS — convert to minutes
          const durationMin    = Math.round((p.duration ?? 0) / 60);
          return {
            audience_user_id:    emailToId.get(email)!,
            session_type:        detectedType,
            session_name:        sessionName,
            session_date:        sessionDate,
            attended:            true,
            watch_duration_mins: durationMin,
            source:              "zoom_api",
            zoom_webinar_id:     webinarId,
          };
        });

      if (dryRun) {
        webinarLog.push({ webinarId, sessionName, sessionDate, participants: participants.length, wouldSync: rows.length });
        totalAttendance += rows.length;
        continue;
      }

      // ── DELETE existing records for this session, then INSERT fresh ──
      let synced = 0;

      // Step A: Delete by zoom_webinar_id (most precise — works even if label changed)
      // Also fallback delete by session_name+date in case zoom_webinar_id column is null
      const deleteById = await supabase
        .from("member_attendance")
        .delete()
        .eq("zoom_webinar_id", webinarId);

      const deleteByName = await supabase
        .from("member_attendance")
        .delete()
        .eq("session_name", sessionName)
        .eq("session_date", sessionDate)
        .is("zoom_webinar_id", null);  // only delete old rows that have no webinar_id

      if (deleteById.error) {
        console.warn(`⚠️ [ZOOM-SYNC] Delete by ID failed: ${deleteById.error.message}`);
      } else {
        console.log(`   🗑️  Cleared old records for "${sessionName}" (ID: ${webinarId})`);
      }

      // Step B: Insert fresh rows in batches of 200
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { data, error } = await supabase
          .from("member_attendance")
          .insert(chunk)
          .select("id");

        if (error) {
          console.error(`❌ [ZOOM-SYNC] Insert chunk ${i} error:`, error.message);
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

    const remaining = totalFound - toProcess.length;
    const summary = {
      success:           true,
      dryRun,
      webinarsProcessed: toProcess.length,
      totalFound,
      remaining,           // how many sessions still need to be synced
      attendanceRecords:   totalAttendance,
      skipped:             totalSkipped,
      errors:              totalErrors,
      dateRange:           { from, to },
      webinars:            webinarLog,
      note: remaining > 0
        ? `${remaining} more sessions remaining — run sync again to continue`
        : "All sessions in range synced",
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
