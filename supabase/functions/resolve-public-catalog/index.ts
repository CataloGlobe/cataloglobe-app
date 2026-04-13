// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveActivityCatalogs } from "../_shared/resolveActivityCatalogs.ts";
import { toRomeDateTime, getNowInRome } from "../_shared/schedulingNow.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { slug, simulate } = await req.json() as {
            slug?: string;
            simulate?: string;
        };

        if (!slug) {
            return new Response(
                JSON.stringify({ error: "Missing slug" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 1. Look up activity by slug (any status)
        const { data: activity, error: activityError } = await supabase
            .from("activities")
            .select(
                "id, tenant_id, name, slug, cover_image, status, inactive_reason, " +
                "address, city, " +
                "instagram, instagram_public, facebook, facebook_public, " +
                "whatsapp, whatsapp_public, website, website_public, " +
                "phone, phone_public, email_public, email_public_visible, " +
                "google_review_url"
            )
            .eq("slug", slug)
            .maybeSingle();

        if (activityError) throw activityError;

        if (!activity) {
            return new Response(
                JSON.stringify({ error: "Sede non trovata" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const business = {
            id: activity.id,
            tenant_id: activity.tenant_id,
            name: activity.name,
            slug: activity.slug,
            cover_image: activity.cover_image,
            status: activity.status,
            inactive_reason: activity.inactive_reason,
            address: activity.address ?? null,
            city: activity.city ?? null,
            instagram: activity.instagram ?? null,
            instagram_public: activity.instagram_public ?? false,
            facebook: activity.facebook ?? null,
            facebook_public: activity.facebook_public ?? false,
            whatsapp: activity.whatsapp ?? null,
            whatsapp_public: activity.whatsapp_public ?? false,
            website: activity.website ?? null,
            website_public: activity.website_public ?? false,
            phone: activity.phone ?? null,
            phone_public: activity.phone_public ?? false,
            email_public: activity.email_public ?? null,
            email_public_visible: activity.email_public_visible ?? false,
            google_review_url: activity.google_review_url ?? null
        };

        // For inactive venues, return early with business info only
        if (activity.status !== "active") {
            return new Response(
                JSON.stringify({
                    business,
                    tenantLogoUrl: null,
                    resolved: {
                        featured: { hero: [], before_catalog: [], after_catalog: [] }
                    }
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. Parse simulation time (if provided)
        let simulatedAt = undefined;
        if (simulate) {
            const parsed = new Date(simulate);
            if (!Number.isNaN(parsed.getTime())) {
                simulatedAt = toRomeDateTime(parsed);
            }
        }

        // 3. Resolve catalogs + tenant info in parallel
        const [resolved, tenantInfo] = await Promise.all([
            resolveActivityCatalogs(supabase, activity.id, simulatedAt),
            supabase.rpc("get_tenant_public_info", { p_tenant_id: activity.tenant_id }),
        ]);

        // 3b. Check subscription status — block if canceled or suspended
        const subscriptionStatus = tenantInfo.data?.subscription_status;
        if (subscriptionStatus === "canceled" || subscriptionStatus === "suspended") {
            return new Response(
                JSON.stringify({
                    business,
                    subscription_inactive: true,
                    tenantLogoUrl: null,
                    resolved: {
                        featured: { hero: [], before_catalog: [], after_catalog: [] }
                    }
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 4. Resolve tenant logo URL
        let tenantLogoUrl: string | null = null;
        if (tenantInfo.data?.logo_url) {
            const { data: urlData } = supabase.storage
                .from("tenant-assets")
                .getPublicUrl(tenantInfo.data.logo_url);
            tenantLogoUrl = urlData?.publicUrl ?? null;
        }

        return new Response(
            JSON.stringify({
                business,
                tenantLogoUrl,
                resolved,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("[resolve-public-catalog] error:", err);
        return new Response(
            JSON.stringify({ error: "Errore interno del server" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
