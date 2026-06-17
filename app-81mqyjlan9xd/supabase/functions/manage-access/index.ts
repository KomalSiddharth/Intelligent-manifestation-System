import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const adminSecret = Deno.env.get("MANAGE_ACCESS_SECRET");
    const providedKey = req.headers.get("x-admin-key");

    if (!adminSecret || providedKey !== adminSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, name, code, id } = await req.json();

    try {
        if (action === "list") {
            const { data, error } = await supabase
                .from("site_access_codes")
                .select("id, name, code, is_active, created_at")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify({ data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (action === "add") {
            if (!name || !code) {
                return new Response(JSON.stringify({ error: "name and code required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            const { data, error } = await supabase
                .from("site_access_codes")
                .insert({ name: name.trim(), code: code.trim(), is_active: true })
                .select()
                .single();

            if (error) throw error;
            return new Response(JSON.stringify({ data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (action === "revoke") {
            if (!id) {
                return new Response(JSON.stringify({ error: "id required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            const { error } = await supabase
                .from("site_access_codes")
                .update({ is_active: false })
                .eq("id", id);

            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (action === "restore") {
            if (!id) {
                return new Response(JSON.stringify({ error: "id required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            const { error } = await supabase
                .from("site_access_codes")
                .update({ is_active: true })
                .eq("id", id);

            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (action === "delete") {
            if (!id) {
                return new Response(JSON.stringify({ error: "id required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            const { error } = await supabase
                .from("site_access_codes")
                .delete()
                .eq("id", id);

            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Unknown action" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err: any) {
        console.error("❌ [MANAGE-ACCESS]", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
