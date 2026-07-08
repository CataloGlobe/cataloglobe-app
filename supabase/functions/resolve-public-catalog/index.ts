// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    resolveActivityCatalogs,
    type ResolvedProduct
} from "../_shared/resolveActivityCatalogs.ts";
import { toRomeDateTime, getNowInRome } from "../_shared/schedulingNow.ts";

interface ActivityFee { key: string; value: string; }

// =============================================================================
// Translation helpers (Prompt 13a + 13b)
// =============================================================================
//
// Scope read-side: traduzione di tutti i campi pubblici nei payload `resolved`
// + `upcoming_closures` per `lang` diversa dal base_language del tenant.
// Coperti: products (description, notes), variants (description, notes),
// categories (name), ingredients (name), optionGroups (name), optionValues
// (name), allergens (label_it legacy, refactor a label al Prompt 14),
// characteristics (label_it legacy idem), featured_contents (title, subtitle,
// description, cta_text), activity_closures (label).
//
// Skip noti:
// - featured_content_products.note → fcp.id non esposto nel payload (vedi
//   TODO commento in applyFeatured).
// - attr_def/attr_def_option/attr_value → niente in payload F&B (vertical skip
//   gestito centralmente lato write-side; lato read i campi non sono
//   serializzati nel response per F&B → no-op).
// - variant_dim/variant_dim_value → Prompt 10c (refactor stable-id pendente).
//
// Fallback chain:
//   1. lang = base_language → resolver salta la chiamata RPC.
//   2. lang != base → RPC get_public_translations filtra SOLO per la lingua
//      richiesta (NO fallback automatico al base). Per ogni campo:
//        - translation row trovata → translated_text mostrato.
//        - mancante → fallback a source row originale (già presente nel
//          payload resolved).

type EntityIdSet = {
    productIds: Set<string>;
    categoryIds: Set<string>;
    ingredientIds: Set<string>;
    optionGroupIds: Set<string>;
    optionValueIds: Set<string>;
    allergenIds: Set<string>;
    characteristicIds: Set<string>;
    featuredIds: Set<string>;
    closureIds: Set<string>;
};

function emptyIdSet(): EntityIdSet {
    return {
        productIds: new Set(),
        categoryIds: new Set(),
        ingredientIds: new Set(),
        optionGroupIds: new Set(),
        optionValueIds: new Set(),
        allergenIds: new Set(),
        characteristicIds: new Set(),
        featuredIds: new Set(),
        closureIds: new Set()
    };
}

function collectProductIds(p: any, ids: EntityIdSet): void {
    if (!p?.id) return;
    ids.productIds.add(p.id);
    for (const a of p.allergens ?? []) if (a?.id !== undefined && a?.id !== null) ids.allergenIds.add(String(a.id));
    for (const c of p.characteristics ?? []) if (c?.id) ids.characteristicIds.add(c.id);
    for (const i of p.ingredients ?? []) if (i?.id) ids.ingredientIds.add(i.id);
    for (const og of p.optionGroups ?? []) {
        if (og?.id) ids.optionGroupIds.add(og.id);
        for (const ov of og.values ?? []) if (ov?.id) ids.optionValueIds.add(ov.id);
    }
}

function collectIds(resolved: any, closures: any[] | null | undefined): EntityIdSet {
    const ids = emptyIdSet();

    for (const cat of resolved?.catalog?.categories ?? []) {
        if (cat?.id) ids.categoryIds.add(cat.id);
        for (const p of cat.products ?? []) {
            collectProductIds(p, ids);
            for (const v of p.variants ?? []) collectProductIds(v, ids);
        }
    }

    for (const f of resolved?.featured?.before_catalog ?? []) {
        if (f?.id) ids.featuredIds.add(f.id);
    }
    for (const f of resolved?.featured?.after_catalog ?? []) {
        if (f?.id) ids.featuredIds.add(f.id);
    }

    for (const c of closures ?? []) {
        if (c?.id) ids.closureIds.add(c.id);
    }

    return ids;
}

function buildEntitiesArray(ids: EntityIdSet): Array<{ type: string; ids: string[] }> {
    const entities: Array<{ type: string; ids: string[] }> = [];
    if (ids.productIds.size > 0) {
        const productIdArr = [...ids.productIds];
        entities.push({ type: "product", ids: productIdArr });
        entities.push({ type: "product_notes", ids: productIdArr });
    }
    if (ids.categoryIds.size > 0) entities.push({ type: "category", ids: [...ids.categoryIds] });
    if (ids.ingredientIds.size > 0) entities.push({ type: "ingredient", ids: [...ids.ingredientIds] });
    if (ids.optionGroupIds.size > 0) entities.push({ type: "option_group", ids: [...ids.optionGroupIds] });
    if (ids.optionValueIds.size > 0) entities.push({ type: "option_value", ids: [...ids.optionValueIds] });
    if (ids.allergenIds.size > 0) entities.push({ type: "allergen", ids: [...ids.allergenIds] });
    if (ids.characteristicIds.size > 0) entities.push({ type: "characteristic", ids: [...ids.characteristicIds] });
    if (ids.featuredIds.size > 0) {
        const fIds = [...ids.featuredIds];
        entities.push({ type: "featured", ids: fIds });
        // Featured ha 4 field tradotti (title/subtitle/description/cta_text);
        // la RPC ritorna la riga per ogni field disponibile in DB. Niente da
        // fare di speciale lato build entities.
    }
    if (ids.closureIds.size > 0) entities.push({ type: "closure", ids: [...ids.closureIds] });
    return entities;
}

function setIfPresent(obj: any, field: string, key: string, map: Map<string, string>): void {
    if (obj && map.has(key)) obj[field] = map.get(key);
}

function applyProduct(p: any, map: Map<string, string>): void {
    if (!p?.id) return;

    setIfPresent(p, "description", `product:${p.id}:description`, map);

    // notes: deserialize JSON canonical (parallelo a serializeNotes write-side).
    const notesKey = `product_notes:${p.id}:notes`;
    if (map.has(notesKey)) {
        try {
            const parsed = JSON.parse(map.get(notesKey)!);
            if (Array.isArray(parsed)) p.notes = parsed;
        } catch (err) {
            console.error(`[resolver] notes deserialize failed for product ${p.id}:`, err);
        }
    }

    // Prompt 14 transition: scriviamo sia label_it (legacy) sia label (nuovo).
    // label_it sarà rimosso al Prompt 15 dopo drop columns DB.
    // Allergen.id è SMALLINT → cast a string per chiave map.
    for (const a of p.allergens ?? []) {
        if (a?.id === undefined || a?.id === null) continue;
        setIfPresent(a, "label_it", `allergen:${String(a.id)}:label`, map);
        setIfPresent(a, "label", `allergen:${String(a.id)}:label`, map);
    }
    for (const c of p.characteristics ?? []) {
        if (!c?.id) continue;
        setIfPresent(c, "label_it", `characteristic:${c.id}:label`, map);
        setIfPresent(c, "label", `characteristic:${c.id}:label`, map);
    }
    for (const i of p.ingredients ?? []) {
        if (!i?.id) continue;
        setIfPresent(i, "name", `ingredient:${i.id}:name`, map);
    }
    for (const og of p.optionGroups ?? []) {
        if (!og?.id) continue;
        setIfPresent(og, "name", `option_group:${og.id}:name`, map);
        for (const ov of og.values ?? []) {
            if (!ov?.id) continue;
            setIfPresent(ov, "name", `option_value:${ov.id}:name`, map);
        }
    }
}

function applyFeatured(f: any, map: Map<string, string>): void {
    if (!f?.id) return;
    setIfPresent(f, "title", `featured:${f.id}:title`, map);
    setIfPresent(f, "subtitle", `featured:${f.id}:subtitle`, map);
    setIfPresent(f, "description", `featured:${f.id}:description`, map);
    setIfPresent(f, "cta_text", `featured:${f.id}:cta_text`, map);

    // TODO follow-up Prompt 13c: tradurre featured_content_products.note.
    // Bloccato: get_schedule_featured_contents non espone l'id della row di join,
    // quindi impossibile lookup translations[entity_id]. Fix richiede:
    //   1. UPDATE mapper get_schedule_featured_contents per includere row.id
    //   2. UPDATE _shared/resolveActivityCatalogs.ts per propagare l'id nel payload
    //   3. UPDATE V2FeaturedContent.products[] type
    // Niente impatto immediato per MVP — pochi tenant usano `note` su featured products.
}

function applyCategory(cat: any, map: Map<string, string>): void {
    if (!cat?.id) return;
    setIfPresent(cat, "name", `category:${cat.id}:name`, map);
    for (const p of cat.products ?? []) {
        applyProduct(p, map);
        for (const v of p.variants ?? []) applyProduct(v, map);
    }
}

function applyClosure(c: any, map: Map<string, string>): void {
    if (!c?.id) return;
    setIfPresent(c, "label", `closure:${c.id}:label`, map);
}

async function applyAllTranslations(
    supabase: ReturnType<typeof createClient>,
    resolved: any,
    closures: any[] | null | undefined,
    tenantId: string,
    requestedLang: string
): Promise<void> {
    if (!resolved && (!closures || closures.length === 0)) return;

    const ids = collectIds(resolved, closures);
    const entities = buildEntitiesArray(ids);
    if (entities.length === 0) return;

    const { data, error } = await supabase.rpc("get_public_translations", {
        p_tenant_id: tenantId,
        p_lang: requestedLang,
        p_entities: entities
    });

    if (error) {
        // Fallback graceful: errore RPC → niente translation, render in source.
        console.error("[resolver] get_public_translations failed:", error);
        return;
    }

    const map = new Map<string, string>();
    for (const t of (data ?? []) as Array<{ entity_type: string; entity_id: string; field: string; translated_text: string }>) {
        map.set(`${t.entity_type}:${t.entity_id}:${t.field}`, t.translated_text);
    }

    // Walk + mutate in-place.
    for (const cat of resolved?.catalog?.categories ?? []) applyCategory(cat, map);
    for (const f of resolved?.featured?.before_catalog ?? []) applyFeatured(f, map);
    for (const f of resolved?.featured?.after_catalog ?? []) applyFeatured(f, map);
    for (const c of closures ?? []) applyClosure(c, map);
}

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // Keep-warm probe. Header `x-warmup: 1` triggers an early-return that
    // exercises Deno module load plus the Supabase client constructor
    // without any DB call. The structured log lets get_logs separate
    // warmup pings from real invocations during pre-post analysis.
    if (req.headers.get("x-warmup") === "1") {
        const _warm = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        console.log(JSON.stringify({ event: "resolve_invocation", mode: "warmup" }));
        return new Response(
            JSON.stringify({ warmup: "ok" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
        );
    }

    try {
        console.log(JSON.stringify({ event: "resolve_invocation", mode: "live" }));
        const { slug, simulate, lang } = await req.json() as {
            slug?: string;
            simulate?: string;
            lang?: string;
        };

        if (!slug) {
            return new Response(
                JSON.stringify({ error: "Missing slug" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // simulate requests must never be cached (they return time-specific data)
        const cacheControl = simulate
            ? "no-store"
            : "public, max-age=0, s-maxage=30, stale-while-revalidate=300";

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const ACTIVITY_SELECT =
            "id, tenant_id, name, slug, cover_image, status, inactive_reason, " +
            "ordering_enabled, enable_reservations, " +
            "address, street_number, postal_code, city, province, " +
            "instagram, instagram_public, facebook, facebook_public, " +
            "whatsapp, whatsapp_public, website, website_public, " +
            "phone, phone_public, email_public, email_public_visible, " +
            "google_review_url, hours_public, " +
            "payment_methods, payment_methods_public, services, services_public, " +
            "fees, fees_public";

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

        // Feature gate: override display flags fail-closed based on plan.
        // Errors or null from the RPC are treated as false (feature unavailable).
        const [orderingRpc, reservationRpc, hasStoryRes] = await Promise.allSettled([
            supabase.rpc("activity_has_feature", { p_activity_id: activity.id, p_feature_id: "table_ordering" }),
            supabase.rpc("activity_has_feature", { p_activity_id: activity.id, p_feature_id: "table_reservation" }),
            supabase
                .from("stories")
                .select("id", { count: "exact", head: true })
                .eq("tenant_id", activity.tenant_id)
                .eq("status", "published")
                .or(`activity_id.is.null,activity_id.eq.${activity.id}`)
        ]);
        const hasStory = hasStoryRes.status === "fulfilled" && (hasStoryRes.value.count ?? 0) > 0;
        const hasOrdering    = orderingRpc.status    === "fulfilled" && orderingRpc.value.data    === true;
        const hasReservation = reservationRpc.status === "fulfilled" && reservationRpc.value.data === true;
        const orderingEnabledResolved     = Boolean(activity.ordering_enabled)    && hasOrdering;
        const reservationsEnabledResolved = Boolean(activity.enable_reservations) && hasReservation;

        const business = {
            id: activity.id,
            tenant_id: activity.tenant_id,
            name: activity.name,
            slug: activity.slug,
            cover_image: activity.cover_image,
            status: activity.status,
            inactive_reason: activity.inactive_reason,
            ordering_enabled: orderingEnabledResolved,
            enable_reservations: reservationsEnabledResolved,
            address: activity.address ?? null,
            street_number: activity.street_number ?? null,
            postal_code: activity.postal_code ?? null,
            city: activity.city ?? null,
            province: activity.province ?? null,
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
            hours_public: activity.hours_public ?? false,
            payment_methods: activity.payment_methods_public ? (activity.payment_methods ?? []) : [],
            services: activity.services_public ? (activity.services ?? []) : [],
            fees: activity.fees_public
                ? ((activity.fees ?? []) as ActivityFee[])
                : ([] as ActivityFee[])
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
                    has_story: hasStory,
                    canonical_slug: isAliasMatch ? activity.slug : null
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": cacheControl } }
            );
        }

        // 2. Parse simulation time (if provided, only for authenticated users)
        let simulatedAt = undefined;
        if (simulate) {
            const authHeader = req.headers.get("Authorization");
            let isAuthenticated = false;
            if (authHeader) {
                const token = authHeader.replace("Bearer ", "");
                const { data: { user }, error } = await supabase.auth.getUser(token);
                isAuthenticated = !!user && !error;
            }
            if (isAuthenticated) {
                const parsed = new Date(simulate);
                if (!Number.isNaN(parsed.getTime())) {
                    simulatedAt = toRomeDateTime(parsed);
                }
            }
            // Non autenticato: simulatedAt resta undefined → catalogo normale
        }

        // 3. Resolve catalogs + tenant info in parallel
        const [resolved, tenantInfo, hoursResult, closuresResult, tenantBaseResult] = await Promise.all([
            resolveActivityCatalogs(supabase, activity.id, simulatedAt, activity.tenant_id),
            supabase.rpc("get_tenant_public_info", { p_tenant_id: activity.tenant_id }),
            (activity.hours_public || activity.enable_reservations)
                ? supabase
                      .from("activity_hours")
                      .select("day_of_week, slot_index, opens_at, closes_at, closes_next_day, is_closed")
                      .eq("activity_id", activity.id)
                      .order("day_of_week", { ascending: true })
                      .order("slot_index", { ascending: true })
                : Promise.resolve({ data: null, error: null }),
            (activity.hours_public || activity.enable_reservations)
                ? (() => {
                      const now = new Date();
                      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
                      return supabase
                          .from("activity_closures")
                          .select("id, closure_date, end_date, label, is_closed, slots")
                          .eq("activity_id", activity.id)
                          .or(`closure_date.gte.${todayStr},end_date.gte.${todayStr}`)
                          .order("closure_date", { ascending: true })
                          .limit(10);
                  })()
                : Promise.resolve({ data: null, error: null }),
            // base_language_code NON è esposto da get_tenant_public_info → fetch
            // diretto. Una sola SELECT extra in parallelo: nessun overhead seriale.
            supabase
                .from("tenants")
                .select("base_language_code")
                .eq("id", activity.tenant_id)
                .single()
        ]);

        // 3c. Abbinamenti (product_pairings) — riferimenti leggeri per prodotto.
        // Stesso-catalogo: attacchiamo un ref { paired_product_id, note,
        // sort_order } ai prodotti sorgente presenti-e-visibili nel catalogo
        // risolto, e SOLO quando anche l'abbinato è presente-e-visibile qui.
        // Questo: (a) garantisce che ogni ref sia renderizzabile (hydration
        // frontend troverà sempre l'abbinato), (b) realizza la degradazione
        // silenziosa dell'abbinato nascosto/assente, (c) evita di esporre nel
        // payload id/note di prodotti nascosti da regola visibilità.
        {
            const productsById = new Map<string, ResolvedProduct>();
            for (const category of resolved.catalog?.categories ?? []) {
                for (const product of category.products) {
                    if (product.is_visible) productsById.set(product.id, product);
                }
            }
            const activeIds = [...productsById.keys()];
            if (activeIds.length > 0) {
                const { data: pairingData, error: pairingErr } = await supabase
                    .from("product_pairings")
                    .select("product_id, paired_product_id, note, sort_order")
                    .eq("tenant_id", activity.tenant_id)
                    .in("product_id", activeIds)
                    .order("sort_order", { ascending: true });

                if (pairingErr) {
                    console.error("[resolver] product_pairings fetch failed:", pairingErr);
                } else {
                    type RawPairingRow = {
                        product_id: string;
                        paired_product_id: string;
                        note: string | null;
                        sort_order: number;
                    };
                    const rows = (pairingData ?? []) as RawPairingRow[];
                    type PairingRef = { paired_product_id: string; note: string | null; sort_order: number };
                    const byProduct = new Map<string, PairingRef[]>();
                    for (const row of rows) {
                        // Attach solo se l'abbinato è presente-e-visibile nel catalogo attivo.
                        if (!productsById.has(row.paired_product_id)) continue;
                        const list = byProduct.get(row.product_id) ?? [];
                        list.push({
                            paired_product_id: row.paired_product_id,
                            note: row.note ?? null,
                            sort_order: row.sort_order
                        });
                        byProduct.set(row.product_id, list);
                    }
                    for (const [productId, refs] of byProduct) {
                        const product = productsById.get(productId);
                        if (product) product.pairings = refs;
                    }
                }
            }

            // 3d. Reverse-link storia → prodotto (sub-fase 6). Query piccola e
            // sparsa: solo storie pubblicate/risolvibili per questa sede con
            // product_id valorizzato, stesso clamp del feed storie (tenant +
            // status='published' + activity_id NULL o = sede). Se più storie
            // puntano allo stesso prodotto vince la prima per sort_order poi
            // created_at (stesso ordinamento del feed) — deterministico.
            if (activeIds.length > 0) {
                const { data: storyData, error: storyErr } = await supabase
                    .from("stories")
                    .select("id, title, cover_media, product_id")
                    .eq("tenant_id", activity.tenant_id)
                    .eq("status", "published")
                    .or(`activity_id.is.null,activity_id.eq.${activity.id}`)
                    .not("product_id", "is", null)
                    .in("product_id", activeIds)
                    .order("sort_order", { ascending: true })
                    .order("created_at", { ascending: true });

                if (storyErr) {
                    console.error("[resolver] stories reverse-link fetch failed:", storyErr);
                } else {
                    type RawStoryRow = {
                        id: string;
                        title: string;
                        cover_media: string | null;
                        product_id: string;
                    };
                    const rows = (storyData ?? []) as RawStoryRow[];
                    const storyByProductId = new Map<string, RawStoryRow>();
                    for (const row of rows) {
                        // Già ordinate per sort_order/created_at: prima occorrenza vince.
                        if (!storyByProductId.has(row.product_id)) {
                            storyByProductId.set(row.product_id, row);
                        }
                    }
                    for (const [productId, story] of storyByProductId) {
                        const product = productsById.get(productId);
                        if (product) {
                            product.story_ref = { id: story.id, title: story.title, cover: story.cover_media };
                        }
                    }
                }
            }
        }

        const opening_hours = hoursResult.data ?? undefined;
        const upcoming_closures = closuresResult.data ?? undefined;
        // vertical_type added to RPC by migration 20260430130000.
        // `?? null` keeps the response shape stable if the edge function is
        // deployed before the migration is applied (defensive fallback).
        const vertical_type = tenantInfo.data?.vertical_type ?? null;
        const baseLanguage: string = (tenantBaseResult.data?.base_language_code ?? "it") as string;
        const requestedLang = (lang ?? "").toLowerCase().trim();
        const needsTranslation = requestedLang.length > 0 && requestedLang !== baseLanguage;

        // Fetch sempre (anche senza needsTranslation): serve al LanguageSelector
        // frontend per popolare la lista lingue selezionabili. JOIN con
        // supported_languages per name_native + flag_emoji.
        const [activeLangsRes, baseLangRes] = await Promise.all([
            supabase
                .from("tenant_languages")
                .select("language_code, supported_languages!inner(name_native, name_en, flag_emoji)")
                .eq("tenant_id", activity.tenant_id)
                .eq("is_active", true),
            // Base lang NON è in tenant_languages per design (vive su tenants.base_language_code).
            // Fetch separato dal catalogo supported_languages per esporre name_native + flag.
            supabase
                .from("supported_languages")
                .select("name_native, name_en, flag_emoji")
                .eq("code", baseLanguage)
                .single()
        ]);

        type RawActiveLangRow = {
            language_code: string;
            supported_languages: { name_native: string; name_en: string; flag_emoji: string | null };
        };
        const activeRows = (activeLangsRes.data ?? []) as unknown as RawActiveLangRow[];

        // Verifica che la lingua richiesta sia attiva per il tenant. Se non lo è,
        // skippiamo applyAllTranslations (sprecato) e segnaliamo lang_unsupported
        // al frontend per redirect canonico verso /:slug.
        let isLangSupported = true;
        if (needsTranslation) {
            if (activeLangsRes.error) {
                console.error("[resolver] tenant_languages fetch failed:", activeLangsRes.error);
                // graceful: assume supported, fallback a source faccia il resto
            } else {
                const activeCodes = activeRows.map(r => r.language_code);
                isLangSupported = activeCodes.includes(requestedLang);
            }
        }

        const effectiveLang = needsTranslation && isLangSupported ? requestedLang : baseLanguage;

        // Build available_languages: base lang prima (sempre), poi attive escluso duplicato.
        const baseLangRow = baseLangRes.data;
        type AvailableLanguage = {
            code: string;
            name_native: string;
            name_en: string;
            flag_emoji: string | null;
        };
        const availableLanguages: AvailableLanguage[] = [
            ...(baseLangRow
                ? [{
                      code: baseLanguage,
                      name_native: baseLangRow.name_native,
                      name_en: baseLangRow.name_en,
                      flag_emoji: baseLangRow.flag_emoji ?? null
                  }]
                : []),
            ...activeRows
                .filter(r => r.language_code !== baseLanguage)
                .map(r => ({
                    code: r.language_code,
                    name_native: r.supported_languages.name_native,
                    name_en: r.supported_languages.name_en,
                    flag_emoji: r.supported_languages.flag_emoji ?? null
                }))
        ];

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
                    has_story: hasStory,
                    canonical_slug: isAliasMatch ? activity.slug : null
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": cacheControl } }
            );
        }

        // 4. Resolve tenant logo URL.
        // Il valore in DB puo' contenere un suffisso `?v=<ts>` per cache-busting
        // (vedi `uploadTenantLogo`). Strippiamo il query prima di chiamare
        // getPublicUrl (altrimenti `?` viene URL-encoded) e lo riappendiamo.
        let tenantLogoUrl: string | null = null;
        if (tenantInfo.data?.logo_url) {
            const rawPath = tenantInfo.data.logo_url;
            const queryIdx = rawPath.indexOf("?");
            const purePath = queryIdx === -1 ? rawPath : rawPath.slice(0, queryIdx);
            const query = queryIdx === -1 ? "" : rawPath.slice(queryIdx + 1);

            const { data: urlData } = supabase.storage
                .from("tenant-assets")
                .getPublicUrl(purePath);
            const baseUrl = urlData?.publicUrl ?? null;
            if (baseUrl && query) {
                const sep = baseUrl.includes("?") ? "&" : "?";
                tenantLogoUrl = `${baseUrl}${sep}${query}`;
            } else {
                tenantLogoUrl = baseUrl;
            }
        }

        // Apply translations (mutate in-place) PRIMA del return. Skip totale
        // se needsTranslation=false → response identica al pre-translations.
        // Copre: products (+ variants), categories, ingredients, optionGroups,
        // optionValues, allergens, characteristics, featured_contents, closures.
        if (needsTranslation && isLangSupported) {
            await applyAllTranslations(
                supabase,
                resolved,
                upcoming_closures ?? null,
                activity.tenant_id,
                requestedLang
            );
        }

        return new Response(
            JSON.stringify({
                business,
                tenantLogoUrl,
                resolved,
                vertical_type,
                has_story: hasStory,
                canonical_slug: isAliasMatch ? activity.slug : null,
                effective_language: effectiveLang,
                base_language_code: baseLanguage,
                available_languages: availableLanguages,
                ...(needsTranslation && !isLangSupported ? { lang_unsupported: true } : {}),
                ...(opening_hours ? { opening_hours } : {}),
                ...(upcoming_closures ? { upcoming_closures } : {})
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": cacheControl } }
        );
    } catch (err) {
        console.error("[resolve-public-catalog] error:", err);
        return new Response(
            JSON.stringify({ error: "Errore interno del server" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
