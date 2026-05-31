import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// kajabi-import  (v3 — batch mode, no per-row DB queries)
// POST /functions/v1/kajabi-import
// Body: { type: "members"|"courses", csv: "...", courseNameOverride: "..." }
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
  const { type = "members", csv, rows: preRows, courseNameOverride } = body;

  if (!csv && !preRows) {
    return new Response(
      JSON.stringify({ error: "Provide 'csv' (raw string) or 'rows' (parsed array)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const rows: Record<string, string>[] = preRows ?? parseCSV(csv);
  console.log(`📥 [KAJABI-IMPORT] type=${type}, rows=${rows.length}, course="${courseNameOverride ?? "from CSV"}"`);

  if (rows.length > 0) {
    console.log(`📋 CSV columns: ${Object.keys(rows[0]).join(" | ")}`);
    console.log(`📋 First row:   ${JSON.stringify(rows[0]).slice(0, 250)}`);
  }

  let imported = 0, updated = 0, errors = 0;

  try {
    if (type === "members") {
      const result = await batchImportMembers(supabase, rows);
      imported = result.imported;
      updated  = result.updated;
      errors   = result.errors;

    } else if (type === "courses") {
      const result = await batchImportCourses(supabase, rows, courseNameOverride);
      imported = result.imported;
      errors   = result.errors;

    } else {
      return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e: any) {
    console.error("❌ [KAJABI-IMPORT] Fatal error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase.from("kajabi_sync_log").insert({
    sync_type: "csv_import",
    event_type: type,
    kajabi_payload: { total: rows.length, imported, updated, errors, course: courseNameOverride },
    status: errors > 0 && imported === 0 ? "error" : "success",
    members_affected: imported + updated,
  }).catch(() => {});

  const summary = { type, total: rows.length, imported, updated, errors };
  console.log("✅ [KAJABI-IMPORT] Done:", summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// ═══════════════════════════════════════════════════════════════
// BATCH: Members import
// ═══════════════════════════════════════════════════════════════
async function batchImportMembers(
  supabase: any,
  rows: Record<string, string>[]
): Promise<{ imported: number; updated: number; errors: number }> {

  let imported = 0, updated = 0, errors = 0;

  // Parse all rows
  const parsed = rows.map(row => {
    const email = pick(row, "Email","email","Email Address").trim().toLowerCase();
    const name  = pick(row, "Name","Full Name","name","First Name").trim()
      || (row["First Name"] ? `${row["First Name"]} ${row["Last Name"] ?? ""}`.trim() : "");
    const phone    = pick(row, "Phone","phone","Mobile").trim();
    const kajabiId = pick(row, "ID","id","Member ID","User ID").trim();
    const joinDate = pick(row, "Created At","Join Date","Joined","created_at");
    const status   = pick(row, "Status","Subscription Status","status").trim().toLowerCase() || "active";
    const planTier = status.includes("active") ? "paid"
      : status.includes("cancel") ? "cancelled"
      : status.includes("trial")  ? "trial"
      : "free";
    return { email, name, phone, kajabiId, joinDate, planTier };
  }).filter(r => r.email);

  errors += rows.length - parsed.length;

  // Batch fetch existing by email (chunks of 500)
  const CHUNK = 500;
  const emailToId = new Map<string, string>();

  for (let i = 0; i < parsed.length; i += CHUNK) {
    const chunk = parsed.slice(i, i + CHUNK);
    const emails = chunk.map(r => r.email);
    const { data } = await supabase
      .from("audience_users")
      .select("id, email, kajabi_user_id")
      .in("email", emails);
    (data ?? []).forEach((u: any) => emailToId.set(u.email.toLowerCase(), u.id));
  }

  // Separate into new vs existing
  const toInsert = parsed.filter(r => !emailToId.has(r.email));
  const toUpdate = parsed.filter(r =>  emailToId.has(r.email));

  // Batch insert new members (chunks of 200)
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200);
    const { data, error } = await supabase
      .from("audience_users")
      .insert(chunk.map(r => ({
        name:             r.name || r.email,
        email:            r.email,
        kajabi_user_id:   r.kajabiId  || null,
        phone:            r.phone     || null,
        plan_tier:        r.planTier,
        status:           "active",
        tags:             [],
        message_count:    0,
        kajabi_joined_at: r.joinDate ? new Date(r.joinDate).toISOString() : null,
      })))
      .select("id, email");

    if (error) {
      console.error(`❌ [MEMBERS] Insert chunk ${i} failed:`, error.message);
      errors += chunk.length;
    } else {
      (data ?? []).forEach((u: any) => emailToId.set(u.email.toLowerCase(), u.id));
      imported += data?.length ?? 0;
    }
  }

  // Batch update existing members (one by one — updates need individual records)
  // Only update the Kajabi-specific fields; don't overwrite user-entered data
  let updateOk = 0;
  for (const r of toUpdate) {
    const id = emailToId.get(r.email);
    if (!id) continue;
    const { error } = await supabase
      .from("audience_users")
      .update({
        kajabi_user_id:   r.kajabiId  || undefined,
        phone:            r.phone     || undefined,
        plan_tier:        r.planTier  || undefined,
        kajabi_joined_at: r.joinDate ? new Date(r.joinDate).toISOString() : undefined,
      })
      .eq("id", id);
    if (error) errors++;
    else updateOk++;
  }
  updated = updateOk;

  console.log(`✅ [MEMBERS] inserted=${imported}, updated=${updated}, errors=${errors}`);
  return { imported, updated, errors };
}

// ═══════════════════════════════════════════════════════════════
// BATCH: Course progress import
// ═══════════════════════════════════════════════════════════════
async function batchImportCourses(
  supabase: any,
  rows: Record<string, string>[],
  courseNameOverride?: string
): Promise<{ imported: number; errors: number }> {

  // ── 1. Parse all rows ──────────────────────────────────────
  type ParsedRow = {
    email: string; memberName: string; courseName: string;
    pct: number; productId: string; lastLesson: string;
    purchasedAt: string; daysSinceActivity: number;
  };

  const parsed: ParsedRow[] = [];
  let parseErrors = 0;

  for (const row of rows) {
    const email = pick(row,
      "Email","email","Member Email","Email Address","Customer Email"
    ).trim().toLowerCase();

    // Kajabi course-member export uses "Product Progress"
    const rawPct = pick(row,
      "Product Progress","Progress","Completion","Completion %","progress"
    ) || "0";
    const pct = parseInt(String(rawPct).replace(/[^0-9]/g, "")) || 0;

    const courseName = (courseNameOverride ||
      pick(row, "Product","Course","Product Name","course_name")
    ).trim();

    if (!email || !courseName) { parseErrors++; continue; }

    const memberName   = pick(row, "Name","Full Name","Member Name").trim();
    const productId    = pick(row, "Product ID","product_id").trim();
    const lastLesson   = pick(row, "Last Completed Post","Last Lesson","Last Lesson Title").trim();
    const purchasedAt  = pick(row, "Enrolled At","Purchase Date","Start Date","start_date","purchased_at");

    const lastActivityRaw = pick(row, "Last Activity At","last_activity_at","Last Active");
    let daysSinceActivity = 0;
    if (lastActivityRaw) {
      const d = new Date(lastActivityRaw);
      if (!isNaN(d.getTime())) {
        daysSinceActivity = Math.floor((Date.now() - d.getTime()) / 86_400_000);
      }
    }

    parsed.push({ email, memberName, courseName, pct, productId, lastLesson, purchasedAt, daysSinceActivity });
  }

  if (parseErrors > 0) console.warn(`⚠️ [COURSES] ${parseErrors} rows skipped (no email/course)`);

  const allEmails = [...new Set(parsed.map(r => r.email))];
  console.log(`📧 [COURSES] Unique emails: ${allEmails.length}`);

  // ── 2. Batch-fetch existing audience_users ─────────────────
  const emailToId = new Map<string, string>();
  const CHUNK = 500;

  for (let i = 0; i < allEmails.length; i += CHUNK) {
    const chunk = allEmails.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("audience_users")
      .select("id, email")
      .in("email", chunk);
    if (error) console.error(`❌ [COURSES] Fetch chunk ${i} failed:`, error.message);
    (data ?? []).forEach((u: any) => emailToId.set(u.email.toLowerCase(), u.id));
  }

  console.log(`👥 [COURSES] Found ${emailToId.size} existing audience_users`);

  // ── 3. Batch-INSERT missing audience_users ─────────────────
  const missingEmails = allEmails.filter(e => !emailToId.has(e));
  console.log(`➕ [COURSES] Need to create ${missingEmails.length} new audience_users`);

  if (missingEmails.length > 0) {
    // Build insert payload, include member name where available
    const emailToName = new Map(parsed.map(r => [r.email, r.memberName]));

    for (let i = 0; i < missingEmails.length; i += 200) {
      const chunk = missingEmails.slice(i, i + 200);
      const { data, error } = await supabase
        .from("audience_users")
        .insert(chunk.map(e => ({
          name:          emailToName.get(e) || e,
          email:         e,
          status:        "active",
          tags:          [],
          message_count: 0,
          plan_tier:     "paid",
        })))
        .select("id, email");

      if (error) {
        console.error(`❌ [COURSES] Create audience_users chunk ${i} failed:`, error.message);
        // If insert fails, try to fetch — they might have been inserted by a parallel run
        const { data: retry } = await supabase
          .from("audience_users")
          .select("id, email")
          .in("email", chunk);
        (retry ?? []).forEach((u: any) => emailToId.set(u.email.toLowerCase(), u.id));
      } else {
        (data ?? []).forEach((u: any) => emailToId.set(u.email.toLowerCase(), u.id));
        console.log(`✅ [COURSES] Created ${data?.length ?? 0} audience_users (batch ${i})`);
      }
    }
  }

  // ── 4. Batch-UPSERT course progress ───────────────────────
  const progressRows = parsed
    .filter(r => emailToId.has(r.email))
    .map(r => {
      const audienceId = emailToId.get(r.email)!;
      const productKey = r.productId || r.courseName.toLowerCase().replace(/\s+/g, "_");
      const startedAt  = r.pct > 0 || r.purchasedAt
        ? (r.purchasedAt ? new Date(r.purchasedAt).toISOString() : new Date().toISOString())
        : null;
      return {
        audience_user_id:    audienceId,
        course_name:         r.courseName,
        kajabi_product_id:   productKey,
        completion_pct:      r.pct,
        has_access:          true,
        last_lesson_title:   r.lastLesson || null,
        days_since_activity: r.daysSinceActivity,
        purchased_at:        r.purchasedAt ? new Date(r.purchasedAt).toISOString() : null,
        started_at:          startedAt,
        completed_at:        r.pct >= 100 ? new Date().toISOString() : null,
      };
    });

  console.log(`📚 [COURSES] Upserting ${progressRows.length} course_progress rows`);

  let imported = 0, upsertErrors = 0;

  for (let i = 0; i < progressRows.length; i += 200) {
    const chunk = progressRows.slice(i, i + 200);
    const { data, error } = await supabase
      .from("member_course_progress")
      .upsert(chunk, { onConflict: "audience_user_id,kajabi_product_id" })
      .select("id");

    if (error) {
      console.error(`❌ [COURSES] Upsert chunk ${i} failed:`, error.message);
      upsertErrors += chunk.length;
    } else {
      imported += data?.length ?? chunk.length;
    }
  }

  const skipped = parsed.length - progressRows.length;
  console.log(`✅ [COURSES] imported=${imported}, skipped=${skipped + parseErrors}, errors=${upsertErrors}`);

  return { imported, errors: upsertErrors + parseErrors + skipped };
}

// ── Utility: pick first non-empty value from multiple column name variants ──
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// ── Member row import (used by batchImportMembers internally) ──
async function importMemberRow(
  supabase: any,
  row: Record<string, string>
): Promise<"created" | "updated" | "skipped"> {
  const email    = pick(row, "Email","email","Email Address").trim().toLowerCase();
  const name     = pick(row, "Name","Full Name","name","First Name").trim();
  const phone    = pick(row, "Phone","phone","Mobile").trim();
  const kajabiId = pick(row, "ID","id","Member ID","User ID").trim();
  const joinDate = pick(row, "Created At","Join Date","Joined","created_at");
  const status   = pick(row, "Status","Subscription Status","status").trim().toLowerCase() || "active";

  if (!email) return "skipped";

  const planTier = status.includes("active") ? "paid"
    : status.includes("cancel") ? "cancelled"
    : status.includes("trial")  ? "trial"
    : "free";

  const { data: existing } = await supabase
    .from("audience_users")
    .select("id, kajabi_user_id")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    await supabase.from("audience_users").update({
      kajabi_user_id:   kajabiId || existing.kajabi_user_id,
      name:             name     || undefined,
      phone:            phone    || undefined,
      plan_tier:        planTier,
      kajabi_joined_at: joinDate ? new Date(joinDate).toISOString() : undefined,
    }).eq("id", existing.id);
    return "updated";
  }

  await supabase.from("audience_users").insert({
    name:             name || email,
    email,
    kajabi_user_id:   kajabiId || null,
    phone:            phone    || null,
    plan_tier:        planTier,
    status:           "active",
    tags:             [],
    message_count:    0,
    kajabi_joined_at: joinDate ? new Date(joinDate).toISOString() : null,
  });
  return "created";
}

// ── Simple CSV parser ─────────────────────────────────────────
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
