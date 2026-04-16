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

        const ACTIVITY_SELECT =
            "id, tenant_id, name, slug, cover_image, status, inactive_reason, " +
            "address, street_number, postal_code, city, " +
            "instagram, instagram_public, facebook, facebook_public, " +
            "whatsapp, whatsapp_public, website, website_public, " +
            "phone, phone_public, email_public, email_public_visible, " +
            "google_review_url, hours_public";

        // 1. Lookup primario: activities.slug
        const { data: activityDirect, error: activityError } = await supabase
            .from("activities")
            .select(ACTIVITY_SELECT)
            .eq("slug", slug)
            .maybeSingle();

        if (activityError) throw activityError;

        // 1b. Fallback alias: se non trovato, cerca in activity_slug_aliases
        let activity = activityDirect;
        let isAliasMatch = false;

        if (!activity) {
            const { data: alias, error: aliasError } = await supabase
                .from("activity_slug_aliases")
                .select("activity_id")
                .eq("slug", slug)
                .maybeSingle();

            if (aliasError) throw aliasError;

            if (alias) {
                const { data: aliasActivity, error: aliasActivityError } = await supabase
                    .from("activities")
                    .select(ACTIVITY_SELECT)
                    .eq("id", alias.activity_id)
                    .maybeSingle();

                if (aliasActivityError) throw aliasActivityError;

                activity = aliasActivity;
                isAliasMatch = true;
            }
        }

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
            street_number: activity.street_number ?? null,
            postal_code: activity.postal_code ?? null,
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
            google_review_url: activity.google_review_url ?? null,
            hours_public: activity.hours_public ?? false
        };

        // For inactive venues, return early with business info only
        if (activity.status !== "active") {
            return new Response(
                JSON.stringify({
                    business,
                    tenantLogoUrl: null,
                    resolved: {
                        featured: { hero: [], before_catalog: [], after_catalog: [] }
                    },
                    canonical_slug: isAliasMatch ? activity.slug : null
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
        const [resolved, tenantInfo, hoursResult, closuresResult] = await Promise.all([
            resolveActivityCatalogs(supabase, activity.id, simulatedAt),
            supabase.rpc("get_tenant_public_info", { p_tenant_id: activity.tenant_id }),
            activity.hours_public
                ? supabase
                      .from("activity_hours")
                      .select("day_of_week, slot_index, opens_at, closes_at, is_closed")
                      .eq("activity_id", activity.id)
                      .order("day_of_week", { ascending: true })
                      .order("slot_index", { ascending: true })
                : Promise.resolve({ data: null, error: null }),
            activity.hours_public
                ? (() => {
                      const now = new Date();
                      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
                      const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
                      const futureStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(future);
                      return supabase
                          .from("activity_closures")
                          .select("closure_date, label, is_closed, opens_at, closes_at")
                          .eq("activity_id", activity.id)
                          .gte("closure_date", todayStr)
                          .lte("closure_date", futureStr)
                          .order("closure_date", { ascending: true });
                  })()
                : Promise.resolve({ data: null, error: null }),
        ]);

        const opening_hours = hoursResult.data ?? undefined;
        const upcoming_closures = closuresResult.data ?? undefined;

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
                    },
                    canonical_slug: isAliasMatch ? activity.slug : null
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
                canonical_slug: isAliasMatch ? activity.slug : null,
                ...(opening_hours ? { opening_hours } : {}),
                ...(upcoming_closures ? { upcoming_closures } : {})
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
