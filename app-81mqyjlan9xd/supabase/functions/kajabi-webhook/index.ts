import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// kajabi-webhook
// Receives real-time events from Kajabi and writes to Supabase.
//
// Setup (Kajabi Admin → Settings → Integrations → Webhooks):
//   URL: https://axfxldgynmlwdsidklun.supabase.co/functions/v1/kajabi-webhook
//   Events: member.created, member.updated, purchase.created,
//           product_registration.created, lesson_completed
//
// After setup: add the Kajabi Webhook Secret to Supabase Secrets:
//   Key: KAJABI_WEBHOOK_SECRET
//   Value: (the secret Kajabi shows after saving the webhook)
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kajabi-secret, x-webhook-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? ""
  );

  // ── Verify webhook secret (once Mitesh adds it to Supabase Secrets) ──
  const webhookSecret = Deno.env.get("KAJABI_WEBHOOK_SECRET");
  if (webhookSecret) {
    const incoming =
      req.headers.get("x-kajabi-secret") ||
      req.headers.get("x-webhook-secret") ||
      req.headers.get("x-kajabi-token");
    if (incoming !== webhookSecret) {
      console.warn("⚠️ [KAJABI-WEBHOOK] Invalid secret — rejecting");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Kajabi sends event in different keys depending on webhook version
  const eventType: string =
    payload.event || payload.type || payload.event_type || "unknown";
  const data: any = payload.data || payload.member || payload.purchase || payload;

  console.log(`📥 [KAJABI-WEBHOOK] Event: ${eventType}`);

  // Log raw event for audit / debugging
  await supabase.from("kajabi_sync_log").insert({
    sync_type: "webhook",
    event_type: eventType,
    kajabi_payload: payload,
    status: "processing",
  });

  try {
    let affected = 0;

    // ── Route by event type ──────────────────────────────────
    if (eventType === "member.created" || eventType === "member_created") {
      affected = await handleMemberCreated(supabase, data);

    } else if (eventType === "member.updated" || eventType === "member_updated") {
      affected = await handleMemberUpdated(supabase, data);

    } else if (
      eventType === "purchase.created" ||
      eventType === "purchase_created" ||
      eventType === "order.created"
    ) {
      affected = await handlePurchase(supabase, data);

    } else if (
      eventType === "product_registration.created" ||
      eventType === "product_registration_created" ||
      eventType === "membership.created"
    ) {
      affected = await handleProductRegistration(supabase, data);

    } else if (
      eventType === "lesson_completed" ||
      eventType === "lesson.completed" ||
      eventType === "post_completed"
    ) {
      affected = await handleLessonCompleted(supabase, data);

    } else {
      console.log(`ℹ️ [KAJABI-WEBHOOK] Unhandled event type: ${eventType} — logged only`);
    }

    // Update log to success
    await supabase
      .from("kajabi_sync_log")
      .update({ status: "success", members_affected: affected })
      .eq("event_type", eventType)
      .order("created_at", { ascending: false })
      .limit(1);

    return new Response(JSON.stringify({ success: true, event: eventType, affected }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("❌ [KAJABI-WEBHOOK] Error:", e.message);
    await supabase
      .from("kajabi_sync_log")
      .update({ status: "error", error_message: e.message })
      .eq("event_type", eventType)
      .order("created_at", { ascending: false })
      .limit(1);

    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Helpers ─────────────────────────────────────────────────

/** Find or create audience_user by email, returns row id */
async function upsertAudienceUser(
  supabase: any,
  email: string,
  name: string,
  kajabiId: string,
  extra: Record<string, any> = {}
): Promise<string | null> {
  if (!email) {
    console.warn("⚠️ [KAJABI] No email in payload — cannot upsert member");
    return null;
  }

  const { data: existing } = await supabase
    .from("audience_users")
    .select("id")
    .ilike("email", email.trim())
    .maybeSingle();

  if (existing) {
    // Update Kajabi fields on existing row
    await supabase
      .from("audience_users")
      .update({
        kajabi_user_id: kajabiId,
        name: name || existing.name,
        ...extra,
      })
      .eq("id", existing.id);
    return existing.id;
  }

  // Create new audience_user from Kajabi data
  const { data: created, error } = await supabase
    .from("audience_users")
    .insert({
      name: name || email,
      email: email.trim().toLowerCase(),
      kajabi_user_id: kajabiId,
      status: "active",
      tags: [],
      message_count: 0,
      ...extra,
    })
    .select("id")
    .single();

  if (error) {
    console.error("❌ [KAJABI] upsertAudienceUser error:", error.message);
    return null;
  }
  return created?.id ?? null;
}

// ── Event Handlers ───────────────────────────────────────────

async function handleMemberCreated(supabase: any, data: any): Promise<number> {
  const email    = data.email || data.member_email;
  const name     = data.name  || data.member_name || email;
  const kajabiId = String(data.id || data.member_id || "");

  const audienceId = await upsertAudienceUser(supabase, email, name, kajabiId, {
    kajabi_joined_at: data.created_at || new Date().toISOString(),
    plan_tier: data.subscription_status || "free",
    phone: data.phone || null,
  });

  if (audienceId) {
    console.log(`✅ [KAJABI] New member: ${email}`);
    return 1;
  }
  return 0;
}

async function handleMemberUpdated(supabase: any, data: any): Promise<number> {
  const email    = data.email || data.member_email;
  const name     = data.name  || data.member_name || "";
  const kajabiId = String(data.id || data.member_id || "");

  const audienceId = await upsertAudienceUser(supabase, email, name, kajabiId, {
    phone: data.phone || undefined,
    plan_tier: data.subscription_status || undefined,
  });

  return audienceId ? 1 : 0;
}

async function handlePurchase(supabase: any, data: any): Promise<number> {
  const email       = data.email || data.member_email || data.customer_email;
  const name        = data.name  || data.member_name  || "";
  const kajabiId    = String(data.member_id || data.id || "");
  const productName = data.product_name || data.offer_name || data.title || "Unknown Course";
  const productId   = String(data.product_id || data.offer_id || "");
  const amount      = parseFloat(data.amount || data.price || "0");

  const audienceId = await upsertAudienceUser(supabase, email, name, kajabiId);
  if (!audienceId) return 0;

  // Update lifetime value
  await supabase.rpc("increment_lifetime_value", {
    p_audience_id: audienceId,
    p_amount: amount,
  }).catch(() => {
    // RPC might not exist yet — direct update fallback
    supabase
      .from("audience_users")
      .update({ lifetime_value: amount })
      .eq("id", audienceId);
  });

  // Upsert course progress row
  await supabase.from("member_course_progress").upsert(
    {
      audience_user_id:  audienceId,
      course_name:       productName,
      kajabi_product_id: productId,
      has_access:        true,
      completion_pct:    0,
      purchased_at:      data.created_at || new Date().toISOString(),
    },
    { onConflict: "audience_user_id,kajabi_product_id" }
  );

  console.log(`✅ [KAJABI] Purchase: ${email} → ${productName}`);
  return 1;
}

async function handleProductRegistration(supabase: any, data: any): Promise<number> {
  const email       = data.email || data.member_email;
  const name        = data.name  || data.member_name || "";
  const kajabiId    = String(data.member_id || data.id || "");
  const productName = data.product_name || data.title || "Unknown Course";
  const productId   = String(data.product_id || "");

  const audienceId = await upsertAudienceUser(supabase, email, name, kajabiId);
  if (!audienceId) return 0;

  await supabase.from("member_course_progress").upsert(
    {
      audience_user_id:  audienceId,
      course_name:       productName,
      kajabi_product_id: productId,
      has_access:        true,
      completion_pct:    0,
      purchased_at:      data.created_at || new Date().toISOString(),
    },
    { onConflict: "audience_user_id,kajabi_product_id" }
  );

  console.log(`✅ [KAJABI] Product access: ${email} → ${productName}`);
  return 1;
}

async function handleLessonCompleted(supabase: any, data: any): Promise<number> {
  const email       = data.email || data.member_email;
  const kajabiId    = String(data.member_id || "");
  const productName = data.product_name || data.course_name || "Unknown Course";
  const productId   = String(data.product_id || "");
  const lessonTitle = data.lesson_title || data.post_title || "";
  const completionPct = parseInt(data.completion_percentage || data.progress || "0");

  if (!email && !kajabiId) return 0;

  // Find audience_user
  let audienceId: string | null = null;
  if (email) {
    const { data: au } = await supabase
      .from("audience_users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    audienceId = au?.id ?? null;
  }
  if (!audienceId && kajabiId) {
    const { data: au } = await supabase
      .from("audience_users")
      .select("id")
      .eq("kajabi_user_id", kajabiId)
      .maybeSingle();
    audienceId = au?.id ?? null;
  }
  if (!audienceId) return 0;

  // Update course progress
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("member_course_progress")
    .select("id, lessons_completed, completion_pct, started_at")
    .eq("audience_user_id", audienceId)
    .eq("kajabi_product_id", productId)
    .maybeSingle();

  if (existing) {
    const newCompletion = Math.max(existing.completion_pct, completionPct);
    await supabase
      .from("member_course_progress")
      .update({
        completion_pct:     newCompletion,
        last_lesson_title:  lessonTitle,
        lessons_completed:  (existing.lessons_completed || 0) + 1,
        days_since_activity: 0,
        started_at:         existing.started_at || now,
        completed_at:       newCompletion >= 100 ? now : null,
        updated_at:         now,
      })
      .eq("id", existing.id);
  } else {
    // No row yet — create it
    await supabase.from("member_course_progress").insert({
      audience_user_id:  audienceId,
      course_name:       productName,
      kajabi_product_id: productId,
      has_access:        true,
      completion_pct:    completionPct,
      last_lesson_title: lessonTitle,
      lessons_completed: 1,
      days_since_activity: 0,
      started_at:        now,
    });
  }

  console.log(`✅ [KAJABI] Lesson done: ${email} → ${lessonTitle} (${completionPct}%)`);
  return 1;
}
