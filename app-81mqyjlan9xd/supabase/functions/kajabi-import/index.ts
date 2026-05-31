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
  courseNameOverride?: string   // pass when exporting from within a specific course
): Promise<boolean> {

  const email = (
    row["Email"] || row["email"] || row["Member Email"] || row["Email Address"] || ""
  ).trim().toLowerCase();

  // Course name: from CSV column OR override param (for single-course exports)
  const courseName = courseNameOverride || (
    row["Product"] || row["Course"] || row["Product Name"] ||
    row["course_name"] || row["Name"] || ""   // Kajabi sometimes uses "Name" for course
  ).trim();

  // Progress: Kajabi exports "20%" string or plain "20"
  const rawPct    = row["Progress"] || row["Completion"] || row["Completion %"] || row["progress"] || "0";
  const completePct = parseInt(rawPct.replace("%", ""));

  const productId   = (row["Product ID"] || row["product_id"] || "").trim();
  const lastLesson  = (row["Last Completed Post"] || row["Last Lesson"] || row["Last Lesson Title"] || "").trim();
  const memberName  = (row["Name"] || row["Full Name"] || row["Member Name"] || "").trim();

  // Kajabi's single-course export uses "Start Date"; bulk uses "Enrolled At" / "Purchase Date"
  const purchasedAt =
    row["Enrolled At"] || row["Purchase Date"] || row["Start Date"] ||
    row["start_date"]  || row["purchased_at"]  || "";

  // Last activity (for days_since_activity calculation)
  const lastActivityRaw =
    row["Last Activity At"] || row["last_activity_at"] || row["Last Active"] || "";
  let daysSinceActivity = 0;
  if (lastActivityRaw) {
    const lastActivityDate = new Date(lastActivityRaw);
    if (!isNaN(lastActivityDate.getTime())) {
      daysSinceActivity = Math.floor(
        (Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }
  }

  if (!email || !courseName) {
    console.warn(`⚠️ [IMPORT] Skipping row — missing email or course name. Email="${email}" Course="${courseName}"`);
    return false;
  }

  // Find or auto-create audience user (so course import works standalone)
  let { data: au } = await supabase
    .from("audience_users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (!au) {
    console.log(`➕ [IMPORT] Auto-creating member: ${email}`);
    const { data: created } = await supabase
      .from("audience_users")
      .insert({
        name:          memberName || email,
        email,
        status:        "active",
        tags:          [],
        message_count: 0,
        plan_tier:     "paid",   // if they're in a course they're a paying member
      })
      .select("id")
      .single();
    au = created;
  }

  if (!au?.id) return false;

  const pct = isNaN(completePct) ? 0 : completePct;
  const productKey = productId || courseName.toLowerCase().replace(/\s+/g, "_");
  const startedAt  = pct > 0 || purchasedAt
    ? (purchasedAt ? new Date(purchasedAt).toISOString() : new Date().toISOString())
    : null;

  await supabase.from("member_course_progress").upsert(
    {
      audience_user_id:    au.id,
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
