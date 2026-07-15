// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { VALID_SUBSCRIPTION_STATUSES } from "../_shared/checkOrderingState.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type StoryTextBlock = { id: string; type: "text"; content: string };
type StoryBlock = StoryTextBlock | { id: string; type: string; [k: string]: unknown };

function deriveExcerpt(bodyBlocks: StoryBlock[] | null | undefined): string | null {
    const blocks = bodyBlocks ?? [];
    const firstText = blocks.find((b): b is StoryTextBlock => b?.type === "text" && typeof (b as StoryTextBlock).content === "string");
    if (!firstText) return null;
    // ⚠️ SYNC con parseInlineEmphasis.ts: rimuove i marcatori di enfasi ristretta
    // (**grassetto** / *corsivo*) prima dello slice, così l'excerpt della card è
    // testo pulito. Duplicazione voluta — l'edge Deno non può importare il parser
    // frontend (stesso pattern di scheduleResolver.ts FE/edge). Se cambiano le
    // regole del parser, aggiornare anche questa regex.
    const content = firstText.content
        .replace(/\*\*(.+?)\*\*|\*(.+?)\*/gs, (_m, bold, italic) => bold ?? italic)
        .trim();
    if (content.length <= 160) return content;
    return `${content.slice(0, 160).trimEnd()}…`;
}

const CARD_SELECT = "id, eyebrow, title, cover_media, body_blocks, product:product_id (id, name)";
const DETAIL_SELECT = "id, tenant_id, activity_id, eyebrow, title, cover_media, body_blocks, sort_order, status, created_at, updated_at, product:product_id (id, name)";

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { slug, story_id } = await req.json() as { slug?: string; story_id?: string };

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

        // 1. Risoluzione slug → activity (stessa logica di resolve-public-catalog:
        // lookup diretto + fallback activity_slug_aliases).
        const ACTIVITY_SELECT = "id, tenant_id, status";

        const { data: activityDirect, error: activityError } = await supabase
            .from("activities")
            .select(ACTIVITY_SELECT)
            .eq("slug", slug)
            .maybeSingle();

        if (activityError) throw activityError;

        let activity = activityDirect;

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
            }
        }

        if (!activity) {
            return new Response(
                JSON.stringify({ error: "Sede non trovata" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Stesso gating di resolve-public-catalog: sede non pubblica → niente storie.
        if (activity.status !== "active") {
            return new Response(
                JSON.stringify(story_id ? { error: "Storia non trovata" } : { cappello: null, stories: [] }),
                { status: story_id ? 404 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { data: tenantInfo, error: tenantInfoError } = await supabase
            .from("tenants")
            .select("subscription_status, story_cover, story_title, story_intro, website")
            .eq("id", activity.tenant_id)
            .single();

        if (tenantInfoError) throw tenantInfoError;

        // Stesso set servibile del menu/ordini, incluso past_due — fonte di
        // verità condivisa (_shared/checkOrderingState.ts).
        if (!VALID_SUBSCRIPTION_STATUSES.has(tenantInfo.subscription_status)) {
            return new Response(
                JSON.stringify(story_id ? { error: "Storia non trovata" } : { cappello: null, stories: [] }),
                { status: story_id ? 404 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. Modalità DETTAGLIO: story_id presente.
        if (story_id) {
            const { data: story, error: storyError } = await supabase
                .from("stories")
                .select(DETAIL_SELECT)
                .eq("id", story_id)
                .eq("tenant_id", activity.tenant_id)
                .eq("status", "published")
                .or(`activity_id.is.null,activity_id.eq.${activity.id}`)
                .maybeSingle();

            if (storyError) throw storyError;

            if (!story) {
                return new Response(
                    JSON.stringify({ error: "Storia non trovata" }),
                    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return new Response(
                JSON.stringify({ story }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300" } }
            );
        }

        // 3. Modalità LISTA.
        const { data: stories, error: storiesError } = await supabase
            .from("stories")
            .select(CARD_SELECT)
            .eq("tenant_id", activity.tenant_id)
            .eq("status", "published")
            .or(`activity_id.is.null,activity_id.eq.${activity.id}`)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });

        if (storiesError) throw storiesError;

        const cards = (stories ?? []).map(s => ({
            id: s.id,
            eyebrow: s.eyebrow,
            title: s.title,
            cover_media: s.cover_media,
            excerpt: deriveExcerpt(s.body_blocks as StoryBlock[]),
            product: s.product ?? null
        }));

        return new Response(
            JSON.stringify({
                cappello: {
                    cover: tenantInfo.story_cover,
                    title: tenantInfo.story_title,
                    intro: tenantInfo.story_intro,
                    website: tenantInfo.website
                },
                stories: cards
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300" } }
        );
    } catch (err) {
        console.error("[resolve-public-story] error:", err);
        return new Response(
            JSON.stringify({ error: "Errore interno del server" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
