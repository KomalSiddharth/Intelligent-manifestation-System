import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const mode = url.searchParams.get('mode'); // 'generate' (default) or 'token'

        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // --- MODE: ACCESS TOKEN FOR STREAMING ---
        if (mode === 'token') {
            const apiKey = Deno.env.get("HEYGEN_API_KEY");
            if (!apiKey) throw new Error("HeyGen API Key missing");

            const tokenResponse = await fetch("https://api.heygen.com/v1/streaming.create_token", {
                method: "POST",
                headers: {
                    "X-Api-Key": apiKey,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({})
            });

            if (!tokenResponse.ok) {
                const err = await tokenResponse.text();
                throw new Error(`Failed to generate token: ${err}`);
            }

            const data = await tokenResponse.json();
            return new Response(JSON.stringify({
                ...data,
                defaultAvatarId: Deno.env.get("HEYGEN_AVATAR_ID")
            }), { // data.data.token
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // --- MODE: VIDEO GENERATION (Default) ---
        const { text, avatarId, profileId } = await req.json();
        if (!text) throw new Error("Text is required for video generation");


        // 1. Fetch Profile for Credentials
        let dynamicApiKey = Deno.env.get("HEYGEN_API_KEY");
        let dynamicAvatarId = avatarId || Deno.env.get("HEYGEN_AVATAR_ID");

        if (profileId) {
            const { data: profile } = await supabaseClient
                .from('mind_profile')
                .select('experience_settings')
                .eq('id', profileId)
                .single();

            if (profile?.experience_settings) {
                const settings = profile.experience_settings;
                if (settings.heyGenApiKey) dynamicApiKey = settings.heyGenApiKey;
                if (settings.heyGenAvatarId && !avatarId) dynamicAvatarId = settings.heyGenAvatarId;
            }
        }

        if (!dynamicApiKey || !dynamicAvatarId) {
            throw new Error("HeyGen credentials not configured for this profile");
        }

        console.log(`Generating HeyGen video for avatar: ${dynamicAvatarId}`);

        // 2. Call HeyGen API
        const response = await fetch("https://api.heygen.com/v2/video/generate", {
            method: "POST",
            headers: {
                "X-Api-Key": dynamicApiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                video_inputs: [
                    {
                        character: {
                            type: "avatar",
                            avatar_id: dynamicAvatarId,
                            avatar_style: "normal"
                        },
                        input_text: text,
                        voice: {
                            type: "text",
                            input_text: text,
                            voice_id: "21m00Tcm4TlvDq8ikWAM" // Default, can be improved
                        }
                    }
                ],
                dimension: {
                    width: 1280,
                    height: 720
                }
            })
        });

        if (!response.ok) {
            const errorDetail = await response.text();
            throw new Error(`HeyGen API error: ${response.statusText} - ${errorDetail}`);
        }

        const result = await response.json();
        const videoId = result.data?.video_id;

        return new Response(JSON.stringify({
            success: true,
            videoId,
            status: 'processing',
            message: "Video generation started"
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("Video Engine Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});
