import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageHead } from "@/hooks/usePageHead";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { trackEvent } from "@/services/analytics/publicAnalytics";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import CollectionView, {
    type CollectionViewSection,
    type CollectionViewSectionGroup,
    type CollectionViewSectionItem
} from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { HubTab } from "@/types/collectionStyle";
import FeaturedBlock from "@/components/PublicCollectionView/FeaturedBlock/FeaturedBlock";
import type { OpeningHoursEntry, UpcomingClosure } from "@/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
import type { ActivityFee } from "@/types/activity";
import { VERTICAL_CONFIG, type VerticalType } from "@/constants/verticalTypes";
import { listAllAllergens, type Allergen } from "@/services/supabase/allergens";

import { supabase } from "@/services/supabase/client";
import { fetchPublicCatalog, type CatalogSource, type PublicCatalogPayload } from "@/services/publicCatalog/fetchPublicCatalog";
import { getCached, setCached } from "@/services/publicCatalog/publicCatalogCache";
import StaleDataBanner from "@/components/StaleDataBanner/StaleDataBanner";
import type {
    ResolvedCharacteristic,
    ResolvedCollections,
    ResolvedProduct,
    ResolvedProductAttribute,
    ResolvedCategory
} from "@/types/resolvedCollections";
import { parseTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { DEFAULT_COLLECTION_STYLE } from "@/types/collectionStyle";
import { borderRadiusToPx } from "@/features/public/utils/mapStyleTokensToCssVars";

import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import NotFound from "../NotFound/NotFound";
import { getDisplayValue } from "@/utils/attributes";
import { loadPublicFonts } from "@utils/loadPublicFonts";
import { isValidLangFormat } from "@/utils/lang";
import { LanguageProvider } from "@context/Language/LanguageProvider";
import type { AvailableLanguage } from "@context/Language/LanguageContext";
import pageStyles from "./PublicCollectionPage.module.scss";
// reviews_summary and recent_reviews still returned by edge function — unused in frontend for now

/* ===============================================
   DATA MAPPING
   ResolvedCollections → CollectionViewSectionGroup[]
=============================================== */

/**
 * Flattens the structured attribute shape emitted by `resolve-public-catalog`
 * (see `ResolvedProductAttribute`) into the `{ label, value }` form consumed
 * by `CollectionView` / `ItemDetail`. The edge function already filters by
 * `show_in_public_channels !== false`; the strict check here is defensive.
 */
function mapAttributes(
    attrs: ResolvedProductAttribute[] | undefined
): { label: string; value: string }[] | undefined {
    const mapped = attrs
        ?.filter(a => a.definition?.show_in_public_channels === true)
        .map(a => {
            const raw = a.value_text ?? a.value_number ?? a.value_boolean ?? a.value_json;
            const value = getDisplayValue(raw);
            return value ? { label: a.definition?.label ?? "—", value } : null;
        })
        .filter((x): x is { label: string; value: string } => x !== null);
    return mapped && mapped.length > 0 ? mapped : undefined;
}

function mapProductToItem(p: ResolvedProduct): CollectionViewSectionItem {
    const attributes = mapAttributes(p.attributes);

    const variants = p.variants?.map(v => ({
        id: v.id,
        name: v.name,
        ...(typeof v.price === "number" ? { price: v.price } : {}),
        ...(typeof v.original_price === "number" ? { original_price: v.original_price } : {}),
        ...(typeof v.from_price === "number" ? { from_price: v.from_price } : {}),
        ...(v.image_url ? { image: v.image_url } : {}),
        ...(v.description ? { description: v.description } : {}),
        ...(v.optionGroups && v.optionGroups.length > 0
            ? {
                  optionGroups: v.optionGroups.map(g => ({
                      id: g.id,
                      name: g.name,
                      group_kind: g.group_kind,
                      pricing_mode: g.pricing_mode,
                      isRequired: g.is_required,
                      maxSelectable: g.max_selectable,
                      values: g.values.map(val => ({
                          id: val.id,
                          name: val.name,
                          absolutePrice: val.absolute_price,
                          priceModifier: val.price_modifier,
                          ...(typeof val.original_price === "number"
                              ? { originalPrice: val.original_price }
                              : {})
                      }))
                  }))
              }
            : {})
    }));

    return {
        id: p.id,
        name: p.name,
        parentSelected: p.parentSelected ?? true,
        description: p.description ?? null,
        price: p.price ?? null,
        effective_price: p.effective_price ?? null,
        original_price: p.original_price ?? null,
        from_price: p.from_price ?? null,
        image: p.image_url ?? null,
        optionGroups: p.optionGroups?.map(g => ({
            id: g.id,
            name: g.name,
            group_kind: g.group_kind,
            pricing_mode: g.pricing_mode,
            isRequired: g.is_required,
            maxSelectable: g.max_selectable,
            values: g.values.map(v => ({
                id: v.id,
                name: v.name,
                absolutePrice: v.absolute_price,
                priceModifier: v.price_modifier,
                ...(typeof v.original_price === "number" ? { originalPrice: v.original_price } : {})
            }))
        })),
        ...(attributes && attributes.length > 0 ? { attributes } : {}),
        ...(variants && variants.length > 0 ? { variants } : {}),
        ...(p.allergens && p.allergens.length > 0 ? { allergens: p.allergens } : {}),
        ...(p.characteristics && p.characteristics.length > 0
            ? { characteristics: p.characteristics }
            : {}),
        ...(p.ingredients && p.ingredients.length > 0 ? { ingredients: p.ingredients } : {}),
        ...(p.notes && p.notes.length > 0 ? { notes: p.notes } : {}),
        is_disabled: p.is_disabled ?? false
    };
}

/**
 * Collects the union of all characteristics referenced by visible products in
 * the catalog (parent products only — variants don't carry their own
 * assignments by design). Sorted by `sort_order` for stable legend rendering.
 *
 * Used by the public footer to populate the "Caratteristiche" sheet with
 * only the items actually used in this catalog (vs. the full pool, which
 * would be too long for legend display).
 */
function collectCatalogCharacteristics(
    catalog: ResolvedCollections["catalog"]
): ResolvedCharacteristic[] {
    if (!catalog?.categories) return [];
    const seen = new Map<string, ResolvedCharacteristic>();
    for (const category of catalog.categories) {
        for (const product of category.products) {
            for (const c of product.characteristics ?? []) {
                if (!seen.has(c.id)) seen.set(c.id, c);
            }
        }
    }
    return Array.from(seen.values()).sort((a, b) => a.sort_order - b.sort_order);
}

function mapCategoryToSection(cat: ResolvedCategory): CollectionViewSection {
    return {
        id: cat.id,
        name: cat.name,
        level: cat.level,
        parentCategoryId: cat.parent_category_id,
        items: cat.products.filter(p => p.is_visible).map(mapProductToItem)
    };
}

function mapCatalogToSectionGroups(resolved: ResolvedCollections): CollectionViewSectionGroup[] {
    if (!resolved.catalog?.categories) return [];

    const allSections = resolved.catalog.categories.map(mapCategoryToSection);

    // Raccoglie L1 — incluse quelle senza prodotti diretti ma con figli che ne hanno
    const l1Sections = allSections.filter(s => s.level === 1);

    const result = l1Sections
        .map(root => {
            const l3WithItems = allSections.filter(
                s => s.level === 3 && s.items.length > 0
            );
            const l2Children = allSections.filter(
                s =>
                    s.level === 2 &&
                    s.parentCategoryId === root.id &&
                    (s.items.length > 0 || l3WithItems.some(l3 => l3.parentCategoryId === s.id))
            );
            const l3Children = l3WithItems.filter(
                s => l2Children.some(l2 => l2.id === s.parentCategoryId)
            );

            // Ordine originale: intercala L3 dopo il loro L2 parent
            const orderedChildren: CollectionViewSection[] = [];
            for (const l2 of l2Children) {
                orderedChildren.push(l2);
                const l3ForThisL2 = l3Children.filter(l3 => l3.parentCategoryId === l2.id);
                orderedChildren.push(...l3ForThisL2);
            }

            return { root, children: orderedChildren };
        })
        .filter(g => g.root.items.length > 0 || g.children.length > 0);

    return result;
}

/* ===============================================
   PAGE
=============================================== */

type PublicBusiness = {
    id: string;
    tenant_id: string;
    name: string;
    slug: string;
    cover_image: string | null;
    status: "active" | "inactive";
    inactive_reason: "maintenance" | "closed" | "unavailable" | null;
    address: string | null;
    street_number: string | null;
    postal_code: string | null;
    city: string | null;
    province: string | null;
    instagram: string | null;
    instagram_public: boolean;
    facebook: string | null;
    facebook_public: boolean;
    whatsapp: string | null;
    whatsapp_public: boolean;
    website: string | null;
    website_public: boolean;
    phone: string | null;
    phone_public: boolean;
    email_public: string | null;
    email_public_visible: boolean;
    google_review_url: string | null;
    payment_methods: string[];
    services: string[];
    fees: ActivityFee[];
};

type PageState =
    | { status: "loading" }
    | { status: "error"; messageKey: string }
    | { status: "domain_error"; code: string }
    | { status: "inactive"; inactiveReason: string | null }
    | { status: "subscription_inactive" }
    | {
          status: "ready";
          business: PublicBusiness;
          resolved: ResolvedCollections;
          tenantLogoUrl: string | null;
          openingHours?: OpeningHoursEntry[];
          upcomingClosures?: UpcomingClosure[];
          allergens: Allergen[] | null;
          effectiveLanguage: string;
          baseLanguage: string;
          availableLanguages: AvailableLanguage[];
          isRefetching?: boolean;
          /** True quando il payload corrente è "stale":
              - proviene dalla cache localStorage (fallback offline), OPPURE
              - proviene da snapshot Redis lato server (header
                `x-cataloglobe-source: stale`).
              In entrambi i casi il banner ambra è mostrato. */
          isStale?: boolean;
      }
    | {
          status: "empty";
          business: PublicBusiness;
          tenantLogoUrl: string | null;
      };

type ResolvedPayloadShape = {
    business: PublicBusiness;
    tenantLogoUrl: string | null;
    resolved: ResolvedCollections;
    subscription_inactive?: boolean;
    canonical_slug?: string | null;
    base_language_code?: string | null;
    effective_language?: string | null;
    available_languages?: AvailableLanguage[];
    lang_unsupported?: boolean;
    opening_hours?: OpeningHoursEntry[];
    upcoming_closures?: UpcomingClosure[];
    vertical_type?: VerticalType | null;
};

export default function PublicCollectionPage() {
    const { slug, lang: langFromUrl } = useParams<{ slug: string; lang?: string }>();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation("public");
    const [searchParams] = useSearchParams();
    const simulateParam = searchParams.get("simulate");
    const [effectiveSimulate, setEffectiveSimulate] = useState<string | null>(null);
    const isSimulation = !!effectiveSimulate;
    const [state, setState] = useState<PageState>({ status: "loading" });
    const [retryToken, setRetryToken] = useState(0);
    const handleRetry = useCallback(() => {
        setRetryToken(t => t + 1);
    }, []);

    // Dinamic head tags (title, description, OG) — only when ready.
    const headBusiness = state.status === "ready" ? state.business : null;
    const headLang = state.status === "ready" ? state.effectiveLanguage : undefined;
    const menuLabel = t("page.menu_label", { defaultValue: "Menu" });
    const headTitle = headBusiness ? `${headBusiness.name} · ${menuLabel}` : undefined;
    const headDescription = headBusiness
        ? headBusiness.address
            ? `${headBusiness.name} · ${headBusiness.address}`
            : headBusiness.name
        : undefined;
    const headImage = headBusiness?.cover_image ?? undefined;
    usePageHead({
        title: headTitle,
        description: headDescription,
        lang: headLang,
        imageUrl: headImage
    });

    useEffect(() => {
        return loadPublicFonts();
    }, []);

    useEffect(() => {
        if (!slug) {
            setState({ status: "error", messageKey: "page.invalid_link" });
            return;
        }

        // Pre-fetch redirect 1: lang format invalido → /:slug
        if (langFromUrl && !isValidLangFormat(langFromUrl)) {
            navigate(`/${slug}`, { replace: true });
            return;
        }

        // Pre-fetch redirect 2: uppercase normalize → /:slug/:lang(lowercase)
        if (langFromUrl && langFromUrl !== langFromUrl.toLowerCase()) {
            navigate(`/${slug}/${langFromUrl.toLowerCase()}`, { replace: true });
            return;
        }

        const validatedLang = isValidLangFormat(langFromUrl) ? langFromUrl!.toLowerCase() : undefined;

        let cancelled = false;

        /**
         * Processa un payload (fresco o cachato) verso uno PageState. Eventuali
         * redirect (alias slug, lang non supportata) avvengono solo quando il
         * payload è fresco — su cache stale i redirect sono già stati risolti
         * al momento in cui il payload fu salvato.
         */
        async function processPayload(
            payload: PublicCatalogPayload,
            opts: { fromCache: boolean; isSimulate: boolean; source: CatalogSource }
        ): Promise<void> {
            const {
                business,
                tenantLogoUrl,
                resolved,
                subscription_inactive,
                canonical_slug,
                base_language_code,
                effective_language,
                available_languages,
                lang_unsupported,
                opening_hours,
                upcoming_closures,
                vertical_type
            } = payload as unknown as ResolvedPayloadShape;

            if (!opts.fromCache) {
                if (canonical_slug && canonical_slug !== slug) {
                    navigate(`/${canonical_slug}`, { replace: true });
                    return;
                }
                if (lang_unsupported) {
                    navigate(`/${slug}`, { replace: true });
                    return;
                }
                if (validatedLang && base_language_code && validatedLang === base_language_code) {
                    navigate(`/${slug}`, { replace: true });
                    return;
                }
            }

            if (subscription_inactive) {
                setState({ status: "subscription_inactive" });
                return;
            }

            if (business.status !== "active") {
                setState({
                    status: "inactive",
                    inactiveReason: business.inactive_reason ?? null
                });
                return;
            }

            if (
                !resolved.catalog &&
                (!resolved.featured?.before_catalog || resolved.featured.before_catalog.length === 0) &&
                (!resolved.featured?.after_catalog || resolved.featured.after_catalog.length === 0)
            ) {
                setState({ status: "empty", business, tenantLogoUrl });
                return;
            }

            const showAllergens = vertical_type
                ? VERTICAL_CONFIG[vertical_type]?.productSections.allergens === true
                : false;
            let allergens: Allergen[] | null = null;
            if (showAllergens) {
                try {
                    allergens = await listAllAllergens();
                } catch (e) {
                    console.error("[PublicCollectionPage] allergens load error:", e);
                    allergens = null;
                }
                if (cancelled) return;
            }

            const baseLang = base_language_code ?? "it";
            const effectiveLang = effective_language ?? baseLang;
            const availLangs: AvailableLanguage[] = available_languages && available_languages.length > 0
                ? available_languages
                : [{ code: baseLang, name_native: "Italiano", flag_emoji: null }];

            const isStale = opts.fromCache || opts.source === "stale";

            setState({
                status: "ready",
                business,
                resolved,
                tenantLogoUrl,
                openingHours: opening_hours,
                upcomingClosures: upcoming_closures,
                allergens,
                effectiveLanguage: effectiveLang,
                baseLanguage: baseLang,
                availableLanguages: availLangs,
                isRefetching: false,
                isStale
            });

            // Cache solo payload "healthy" provenienti da risposta LIVE (non stale).
            // Skip per:
            //   - opts.fromCache: il payload viene già dalla cache localStorage, riscriverlo
            //     come "savedAt: now" falsa la freschezza dello snapshot.
            //   - opts.isSimulate: i payload simulati sono time-shifted.
            //   - opts.source === "stale": il server ha servito uno snapshot Redis
            //     vecchio (Supabase down). Salvarlo in localStorage con savedAt=now
            //     falsa la freschezza locale.
            if (!opts.fromCache && !opts.isSimulate && opts.source !== "stale") {
                setCached(slug!, validatedLang, payload);
            }
        }

        async function load() {
            try {
                setState(prev => {
                    if (prev.status === "ready") {
                        return { ...prev, isRefetching: true };
                    }
                    return { status: "loading" };
                });

                let simulate: string | undefined = undefined;
                if (simulateParam) {
                    const {
                        data: { session }
                    } = await supabase.auth.getSession();
                    if (session) {
                        const parsed = new Date(simulateParam);
                        if (!Number.isNaN(parsed.getTime())) {
                            simulate = simulateParam;
                        }
                    }
                }
                if (cancelled) return;
                setEffectiveSimulate(simulate ?? null);

                const result = await fetchPublicCatalog({
                    slug: slug!,
                    lang: validatedLang,
                    simulate
                });

                if (cancelled) return;

                if (result.kind === "success") {
                    await processPayload(result.payload, {
                        fromCache: false,
                        isSimulate: !!simulate,
                        source: result.source
                    });
                    return;
                }

                if (result.kind === "domain_error") {
                    console.warn("[PublicCollectionPage] domain error:", result.code);
                    // Codici domain definitivi (link rotto, sede inesistente) →
                    // NotFound. Nessun retry possibile.
                    setState({ status: "domain_error", code: result.code });
                    return;
                }

                // network_error → tenta fallback da cache locale
                console.error("[PublicCollectionPage] network error after retries:", result.cause);
                const cached = simulate ? null : getCached(slug!, validatedLang);
                if (cached) {
                    console.debug("[PublicCollectionPage] using cached snapshot from", cached.savedAt.toISOString());
                    await processPayload(cached.payload, {
                        fromCache: true,
                        isSimulate: false,
                        source: "unknown"
                    });
                    return;
                }

                setState({ status: "error", messageKey: "page.loading_error" });
            } catch (err) {
                if (cancelled) return;
                console.error("[PublicCollectionPage] loading error:", err);
                setState({ status: "error", messageKey: "page.loading_error" });
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [slug, langFromUrl, simulateParam, navigate, retryToken]);

    const [activeTab, setActiveTab] = useState<HubTab>("menu");
    const handleTabChange = useCallback(
        (tab: HubTab) => {
            const prevTab = activeTab;
            setActiveTab(tab);
            if (state.status === "ready" && prevTab !== tab) {
                trackEvent(state.business.id, "tab_switch", {
                    from_tab: prevTab,
                    to_tab: tab
                });
            }
        },
        [activeTab, state]
    );
    const sessionId = useMemo(() => crypto.randomUUID(), []);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

    // ── Language change toast ──────────────────────────────────────────────
    type ToastPhase = "idle" | "loading" | "done";
    const [toastPhase, setToastPhase] = useState<ToastPhase>("idle");
    const [toastLabel, setToastLabel] = useState<string>("");
    const prevIsRefetchingRef = useRef(false);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (state.status !== "ready") return;
        const isRefetching = state.isRefetching ?? false;

        if (isRefetching && !prevIsRefetchingRef.current) {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            setToastPhase("loading");
        } else if (!isRefetching && prevIsRefetchingRef.current) {
            const lang = state.availableLanguages.find(l => l.code === state.effectiveLanguage);
            setToastLabel(lang?.name_native ?? state.effectiveLanguage.toUpperCase());
            setToastPhase("done");
            toastTimerRef.current = setTimeout(() => setToastPhase("idle"), 1200);
        }

        prevIsRefetchingRef.current = isRefetching;
    }, [state]);

    useEffect(() => {
        return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
    }, []);

    // ── Preload cover image (LCP) as soon as Edge Function resolves ──────
    useEffect(() => {
        if (state.status !== "ready") return;
        const { business, resolved } = state;
        if (!business.cover_image) return;
        const tokens = parseTokens(resolved.style?.config ?? null);
        if (!tokens.header.showCoverImage) return;

        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.href = business.cover_image;
        link.setAttribute("fetchpriority", "high");
        document.head.appendChild(link);

        return () => {
            if (document.head.contains(link)) document.head.removeChild(link);
        };
    }, [state]);

    // ── Analytics: page_view (una sola volta quando la pagina è pronta) ──
    const pageViewTracked = useRef(false);
    useEffect(() => {
        if (state.status !== "ready" || pageViewTracked.current) return;
        pageViewTracked.current = true;
        trackEvent(state.business.id, "page_view", {
            slug,
            referrer: document.referrer || undefined
        });
    }, [state, slug]);

    /* ============================
       RENDER
    ============================ */

    if (state.status === "loading") {
        return <AppLoader intent="public" />;
    }

    if (state.status === "error") {
        return (
            <div className={pageStyles.errorRoot} role="alert">
                <div className={pageStyles.errorCard}>
                    <h1 className={pageStyles.errorTitle}>{t("error.title")}</h1>
                    <p className={pageStyles.errorDescription}>{t("error.description")}</p>
                    <button type="button" className={pageStyles.errorButton} onClick={handleRetry}>
                        {t("error.retry")}
                    </button>
                </div>
            </div>
        );
    }

    if (state.status === "domain_error") {
        // not_found / invalid_link / invalid_lang / missing_slug / domain_error
        // → link rotto o sede inesistente. NotFound senza retry — il retry
        // non risolverebbe il problema (deterministico server-side).
        return <NotFound variant="business" />;
    }

    if (state.status === "inactive") {
        return (
            <NotFound
                variant="business-inactive"
                inactiveReason={
                    state.inactiveReason as "maintenance" | "closed" | "unavailable" | null
                }
            />
        );
    }

    if (state.status === "subscription_inactive") {
        return <NotFound variant="subscription-inactive" />;
    }

    if (state.status === "empty") {
        return <NotFound variant="business-empty" />;
    }

    const { business, resolved, tenantLogoUrl, openingHours, upcomingClosures, allergens, effectiveLanguage, baseLanguage, availableLanguages } = state;

    // Derive CollectionStyle from stored tokens so runtime matches preview
    const tokens = parseTokens(resolved.style?.config ?? null);
    const navStyle = tokens.navigation.style; // "filled" | "outline" | "tabs" | "dot" | "minimal"
    const cardTemplate: "no-image" | "left" | "right" =
        tokens.card.image.mode === "hide"
            ? "no-image"
            : tokens.card.image.position === "right"
              ? "right"
              : "left";

    const collectionStyle = {
        ...DEFAULT_COLLECTION_STYLE,
        sectionNavStyle: navStyle,
        cardTemplate,
        cardLayout: tokens.card.layout,
        productStyle: tokens.card.productStyle,
        showLogo: tokens.header.showLogo,
        showCoverImage: tokens.header.showCoverImage,
        showActivityName: tokens.header.showActivityName,
        showCatalogName: tokens.header.showCatalogName,
        showAddress: tokens.header.showAddress,
        featuredStyle: tokens.appearance.featuredStyle,
        appearanceRadius: borderRadiusToPx(tokens.appearance.borderRadius)
    } as const;

    const sectionGroups = mapCatalogToSectionGroups(resolved);
    const catalogCharacteristics = collectCatalogCharacteristics(resolved.catalog);
    const emptyState =
        sectionGroups.length === 0
            ? { title: t("page.empty_catalog") }
            : undefined;

    const allFeaturedContents = [
        ...(resolved.featured?.before_catalog ?? []),
        ...(resolved.featured?.after_catalog ?? [])
    ];

    const isRefetchingNow = state.status === "ready" && (state.isRefetching ?? false);
    // Lingua di destinazione: già nell'URL quando il refetch inizia.
    // Fallback a baseLanguage se si torna alla lingua base (URL senza /lang).
    const toastTargetLang = langFromUrl ?? (state.status === "ready" ? state.baseLanguage : "it");

    return (
        <LanguageProvider
            slug={slug!}
            currentLang={effectiveLanguage}
            availableLanguages={availableLanguages}
            baseLanguage={baseLanguage}
        >
        <PublicThemeScope style={resolved.style}>
            <div
                className={pageStyles.contentWrapper}
                data-refetching={isRefetchingNow ? "true" : undefined}
            >
            {state.status === "ready" && state.isStale && (
                <StaleDataBanner onRetry={handleRetry} />
            )}
            {isSimulation && (
                <div
                    style={{
                        position: "relative",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.5rem 1rem",
                        background: "#fef3c7",
                        color: "#92400e",
                        fontSize: "0.8rem",
                        fontWeight: 500,
                        borderBottom: "1px solid #fde68a"
                    }}
                >
                    <span>{t("page.simulation_banner")}</span>
                    <span>
                        {new Date(effectiveSimulate!).toLocaleString("it-IT", {
                            timeZone: "Europe/Rome"
                        })}
                    </span>
                </div>
            )}
            <CollectionView
                businessName={business.name}
                businessImage={business.cover_image}
                collectionTitle={resolved.catalog?.name ?? ""}
                sectionGroups={sectionGroups}
                style={collectionStyle}
                mode="public"
                activityId={business.id}
                tenantLogoUrl={tenantLogoUrl}
                activityAddress={(() => {
                    const street = [business.address, business.street_number]
                        .filter(Boolean)
                        .join(", ");
                    const location = [business.postal_code, business.city]
                        .filter(Boolean)
                        .join(" ");
                    return [street, location].filter(Boolean).join(" — ") || null;
                })()}
                socialLinks={{
                    instagram: business.instagram,
                    instagram_public: business.instagram_public,
                    facebook: business.facebook,
                    facebook_public: business.facebook_public,
                    whatsapp: business.whatsapp,
                    whatsapp_public: business.whatsapp_public,
                    website: business.website,
                    website_public: business.website_public,
                    phone: business.phone,
                    phone_public: business.phone_public,
                    email_public: business.email_public,
                    email_public_visible: business.email_public_visible
                }}
                openingHours={openingHours}
                upcomingClosures={upcomingClosures}
                emptyState={emptyState}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                featuredContents={allFeaturedContents}
                featuredBeforeCatalogSlot={
                    resolved.featured?.before_catalog &&
                    resolved.featured.before_catalog.length > 0 ? (
                        <FeaturedBlock blocks={resolved.featured.before_catalog} activityId={business.id} slot="before_catalog" layout={tokens.appearance.featuredStyle} />
                    ) : null
                }
                featuredAfterCatalogSlot={
                    resolved.featured?.after_catalog &&
                    resolved.featured.after_catalog.length > 0 ? (
                        <FeaturedBlock blocks={resolved.featured.after_catalog} activityId={business.id} slot="after_catalog" layout={tokens.appearance.featuredStyle} />
                    ) : null
                }
                reviewsProps={{
                    googleReviewUrl: business.google_review_url,
                    activityId: business.id,
                    sessionId,
                    supabaseUrl
                }}
                paymentMethods={business.payment_methods}
                activityServices={business.services}
                fees={business.fees}
                allergens={allergens}
                catalogCharacteristics={catalogCharacteristics}
            />
            </div>
            {/* Toast cambio lingua — sempre nel DOM, CSS transitions */}
            <div
                className={pageStyles.languageToast}
                data-phase={toastPhase}
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {toastPhase === "loading" && (
                    <span className={pageStyles.languageToastSpinner} />
                )}
                {toastPhase === "done" && (
                    <span className={pageStyles.languageToastCheck}>✓</span>
                )}
                <span>
                    {toastPhase === "loading"
                        ? i18n.t("toast.translating", { lng: toastTargetLang, ns: "public" })
                        : toastPhase === "done"
                          ? toastLabel
                          : ""}
                </span>
            </div>
        </PublicThemeScope>
        </LanguageProvider>
    );
}
