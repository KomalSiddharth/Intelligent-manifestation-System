import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// kajabi-import
// One-time (and re-runnable) bulk import from Kajabi CSV exports.
//
// How to use:
//   POST /functions/v1/kajabi-import
//   Body: { type: "members", csv: "<raw CSV string>" }
//   OR:   { type: "members", rows: [...parsed array] }
//
// Supported types:
//   "members"  — from Kajabi People → Members → Export
//   "courses"  — from Kajabi Products → Members/Progress export
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? ""
  );

  const body = await req.json().catch(() => ({}));
  // courseNameOverride: pass the course name when exporting from within a specific
  // Kajabi course page (those CSVs don't include a product/course name column)
  const { type = "members", csv, rows: preRows, courseNameOverride } = body;

  if (!csv && !preRows) {
    return new Response(JSON.stringify({ error: "Provide 'csv' (raw string) or 'rows' (parsed array)" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse CSV if raw string provided
  const rows: Record<string, string>[] = preRows ?? parseCSV(csv);

  console.log(`📥 [KAJABI-IMPORT] type=${type}, rows=${rows.length}, courseOverride=${courseNameOverride ?? "none"}`);
  // Debug: log column names from first row so we can verify CSV header mapping
  if (rows.length > 0) {
    console.log(`📋 [KAJABI-IMPORT] CSV columns found: ${Object.keys(rows[0]).join(" | ")}`);
    console.log(`📋 [KAJABI-IMPORT] First row sample: ${JSON.stringify(rows[0]).slice(0, 200)}`);
  }

  let imported = 0, updated = 0, errors = 0;

  if (type === "members") {
    for (const row of rows) {
      try {
        const result = await importMemberRow(supabase, row);
        if (result === "created") imported++;
        else if (result === "updated") updated++;
      } catch (e: any) {
        errors++;
        console.error("❌ [IMPORT] Row error:", e.message, JSON.stringify(row).slice(0, 100));
      }
    }
  } else if (type === "courses") {
    for (const row of rows) {
      try {
        const result = await importCourseProgressRow(supabase, row, courseNameOverride);
        if (result) imported++;
      } catch (e: any) {
        errors++;
        console.error("❌ [IMPORT] Course row error:", e.message);
      }
    }
  } else {
    return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Log the import
  await supabase.from("kajabi_sync_log").insert({
    sync_type: "csv_import",
    event_type: type,
    kajabi_payload: { total: rows.length, imported, updated, errors },
    status: errors === rows.length ? "error" : "success",
    members_affected: imported + updated,
  });

  const summary = { type, total: rows.length, imported, updated, errors };
  console.log("✅ [KAJABI-IMPORT] Done:", summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// ── Member row import ─────────────────────────────────────────
async function importMemberRow(
  supabase: any,
  row: Record<string, string>
): Promise<"created" | "updated" | "skipped"> {

  // Kajabi CSV headers vary — handle common variations
  const email    = (row["Email"] || row["email"] || row["Email Address"] || "").trim().toLowerCase();
  const name     = (row["Name"] || row["Full Name"] || row["name"] || row["First Name"] + " " + row["Last Name"] || "").trim();
  const phone    = (row["Phone"] || row["phone"] || row["Mobile"] || "").trim();
  const kajabiId = (row["ID"] || row["id"] || row["Member ID"] || row["User ID"] || "").trim();
  const joinDate = row["Created At"] || row["Join Date"] || row["Joined"] || row["created_at"] || "";
  const status   = (row["Status"] || row["Subscription Status"] || "active").trim().toLowerCase();

  if (!email) return "skipped";

  const planTier = status.includes("active") ? "paid"
    : status.includes("cancel") ? "cancelled"
    : status.includes("trial")  ? "trial"
    : "free";

  // Check existing
  const { data: existing } = await supabase
    .from("audience_users")
    .select("id, kajabi_user_id")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("audience_users")
      .update({
        kajabi_user_id:   kajabiId || existing.kajabi_user_id,
        name:             name || undefined,
        phone:            phone || undefined,
        plan_tier:        planTier,
        kajabi_joined_at: joinDate ? new Date(joinDate).toISOString() : undefined,
      })
      .eq("id", existing.id);
    return "updated";
  }

  // New member
  await supabase.from("audience_users").insert({
    name:             name || email,
    email,
    kajabi_user_id:   kajabiId || null,
    phone:            phone || null,
    plan_tier:        planTier,
    status:           "active",
    tags:             [],
    message_count:    0,
    kajabi_joined_at: joinDate ? new Date(joinDate).toISOString() : null,
  });

  return "created";
}

// ── Course progress row import ────────────────────────────────
async function importCourseProgressRow(
  supabase: any,
  row: Record<string, string>,
  courseNameOverride?: string
): Promise<boolean> {

  // ── Parse fields — handle every known Kajabi header variant ──
  // Email: try all known column names (Kajabi uses "Email" in product member exports)
  const email = (
    row["Email"] ?? row["email"] ?? row["Member Email"] ??
    row["Email Address"] ?? row["Customer Email"] ?? ""
  ).trim().toLowerCase();

  // Course name from override (always provided for single-course exports) or CSV column
  const courseName = (courseNameOverride ?? (
    row["Product"] ?? row["Course"] ?? row["Product Name"] ?? row["course_name"] ?? ""
  )).trim();

  // Progress: Kajabi exports "20%" string or plain "20"
  const rawPct      = (row["Progress"] ?? row["Completion"] ?? row["Completion %"] ?? row["progress"] ?? "0");
  const completePct = parseInt(String(rawPct).replace(/[^0-9]/g, "")) || 0;

  const productId  = (row["Product ID"] ?? row["product_id"] ?? "").trim();
  const lastLesson = (row["Last Completed Post"] ?? row["Last Lesson"] ?? row["Last Lesson Title"] ?? "").trim();
  const memberName = (row["Name"] ?? row["Full Name"] ?? row["Member Name"] ?? "").trim();

  // Dates — Kajabi single-course export uses "Start Date"
  const purchasedAt =
    row["Enrolled At"] ?? row["Purchase Date"] ?? row["Start Date"] ??
    row["start_date"]  ?? row["purchased_at"]  ?? "";

  // Days since activity
  const lastActivityRaw = row["Last Activity At"] ?? row["last_activity_at"] ?? row["Last Active"] ?? "";
  let daysSinceActivity = 0;
  if (lastActivityRaw) {
    const d = new Date(lastActivityRaw);
    if (!isNaN(d.getTime())) {
      daysSinceActivity = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    }
  }

  if (!email) {
    console.warn(`⚠️ [IMPORT] Skipping — no email. Row keys: ${Object.keys(row).join(", ")}`);
    return false;
  }
  if (!courseName) {
    console.warn(`⚠️ [IMPORT] Skipping — no course name. Pass courseNameOverride in request body.`);
    return false;
  }

  // ── Find or create audience_user ──────────────────────────────
  let audienceId: string | null = null;

  const { data: existing, error: findErr } = await supabase
    .from("audience_users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (findErr) {
    console.error(`❌ [IMPORT] Find audience_user failed for ${email}:`, findErr.message);
  }

  if (existing?.id) {
    audienceId = existing.id;
  } else {
    // Plain INSERT — we already confirmed this email doesn't exist above
    const { data: created, error: insertErr } = await supabase
      .from("audience_users")
      .insert({
        name:          memberName || email,
        email,
        status:        "active",
        tags:          [],
        message_count: 0,
        plan_tier:     "paid",
      })
      .select("id")
      .single();

    if (insertErr) {
      // Duplicate email from a concurrent run — try to fetch the now-existing row
      if (insertErr.code === "23505") {
        const { data: retry } = await supabase
          .from("audience_users")
          .select("id")
          .ilike("email", email)
          .maybeSingle();
        audienceId = retry?.id ?? null;
      } else {
        console.error(`❌ [IMPORT] Create audience_user failed for ${email}:`, insertErr.message);
      }
    } else {
      audienceId = created?.id ?? null;
    }
  }

  if (!audienceId) {
    console.warn(`⚠️ [IMPORT] No audience_id for ${email} — skipping course upsert`);
    return false;
  }

  // ── Upsert course progress ────────────────────────────────────
  const productKey = productId || courseName.toLowerCase().replace(/\s+/g, "_");
  const pct        = completePct;
  const startedAt  = pct > 0 || purchasedAt
    ? (purchasedAt ? new Date(purchasedAt).toISOString() : new Date().toISOString())
    : null;

  const { error: upsertErr } = await supabase
    .from("member_course_progress")
    .upsert(
      {
        audience_user_id:    audienceId,
        course_name:         courseName,
        kajabi_product_id:   productKey,
        completion_pct:      pct,
        has_access:          true,
        last_lesson_title:   lastLesson || null,
        days_since_activity: daysSinceActivity,
        purchased_at:        purchasedAt ? new Date(purchasedAt).toISOString() : null,
        started_at:          startedAt,
        completed_at:        pct >= 100 ? new Date().toISOString() : null,
      },
      { onConflict: "audience_user_id,kajabi_product_id" }
    );

  if (upsertErr) {
    console.error(`❌ [IMPORT] course_progress upsert failed for ${email}:`, upsertErr.message);
    return false;
  }

  return true;
}

// ── Simple CSV parser ─────────────────────────────────────────
// Handles quoted fields, commas inside quotes, CRLF line endings
function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]);
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim().replace(/^"|"$/g, "")] = (values[idx] || "").trim().replace(/^"|"$/g, "");
    });
    result.push(row);
  }

  return result;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
