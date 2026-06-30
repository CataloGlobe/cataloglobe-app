import { useEffect, useMemo, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import CollectionView, {
    type CollectionViewSection,
    type CollectionViewSectionGroup,
    type CollectionViewSectionItem
} from "@/components/PublicCollectionView/CollectionView/CollectionView";
import FeaturedBlock from "@/components/PublicCollectionView/FeaturedBlock/FeaturedBlock";
import StaleDataBanner from "@/components/StaleDataBanner/StaleDataBanner";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import { LanguageProvider } from "@context/Language/LanguageProvider";
import {
    CustomerSessionProvider,
    useCustomerSession
} from "@/context/CustomerSession/CustomerSessionContext";
import { parseTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { DEFAULT_COLLECTION_STYLE } from "@/types/collectionStyle";
import type { HubTab } from "@/types/collectionStyle";
import { borderRadiusToPx } from "@/features/public/utils/mapStyleTokensToCssVars";
import { getDisplayValue } from "@/utils/attributes";
import type { OrderingStateReason } from "@/types/orders";
import type {
    ResolvedCategory,
    ResolvedCharacteristic,
    ResolvedCollections,
    ResolvedProduct,
    ResolvedProductAttribute
} from "@/types/resolvedCollections";

import type { ReadyPageData } from "./derivePageState";
import pageStyles from "./PublicCollectionPage.module.scss";

/**
 * Render PURO del ramo "ready" della pagina pubblica (SSR stage 3, step 2).
 *
 * Prop-driven: riceve lo stato ready prodotto da derivePageState e compone
 * l'albero provider attorno a CollectionView (CustomerSession → Language →
 * Theme). Nessun fetch, nessun effect proprio: l'orchestrazione dati e i
 * side-effect page-level (head, font, preload, analytics, toast) restano in
 * PublicCollectionPage. È il componente che l'entry SSR monterà server-side
 * nello stage 4.
 *
 * Slot page-level (devono vivere DENTRO PublicThemeScope per ereditare le
 * CSS vars --pub-*):
 *   - `bannerSlot`: dentro il contentWrapper, sopra CollectionView
 *     (banner simulazione).
 *   - `children`: dopo il contentWrapper (toast cambio lingua).
 */

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

/**
 * Wrapper interno: vive DENTRO CustomerSessionProvider e legge isActive
 * dal context per propagarlo come prop a CollectionView. Tiene CollectionView
 * "dumb" (prop-driven) senza farle conoscere il context customer.
 */
function CollectionViewWithCustomerSession(
    props: Omit<ComponentProps<typeof CollectionView>, "orderingActive">
) {
    const { isActive } = useCustomerSession();
    return <CollectionView {...props} orderingActive={isActive} />;
}

/* ===============================================
   COMPONENT
=============================================== */

export type PublicCatalogReadyProps = {
    slug: string;
    data: ReadyPageData;
    /** Derivato page-level (router state / URL param / payload), iniettato. */
    orderingMaintenance: { reason: OrderingStateReason; message: string } | null;
    /** Per StaleDataBanner (richiesto dal suo contratto props). */
    onRetry: () => void;
    activeTab: HubTab;
    onTabChange: (tab: HubTab) => void;
    /** Reset della tab attiva senza analytics (setter raw). Invocato quando la
     *  tab "events" e' attiva ma non ci sono piu featured da mostrare. Opzionale:
     *  l'SSR monta con activeTab="menu" fisso → il fallback non scatta mai. */
    onTabAutoReset?: () => void;
    /** Banner page-level dentro il contentWrapper (es. banner simulazione). */
    bannerSlot?: ReactNode;
    /** Overlay page-level dopo il contentWrapper (es. toast cambio lingua). */
    children?: ReactNode;
};

export default function PublicCatalogReady({
    slug,
    data,
    orderingMaintenance,
    onRetry,
    activeTab,
    onTabChange,
    onTabAutoReset,
    bannerSlot,
    children
}: PublicCatalogReadyProps) {
    const { t } = useTranslation("public");
    const {
        business,
        resolved,
        tenantLogoUrl,
        openingHours,
        upcomingClosures,
        allergens,
        effectiveLanguage,
        baseLanguage,
        availableLanguages
    } = data;

    // NOTA SSR (stage 4): randomUUID a render-time diverge server↔client.
    // Innocuo in SPA (solo prop, non markup); da rendere client-only allo
    // stage 4.
    const sessionId = useMemo(() => crypto.randomUUID(), []);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

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
        cardTreatment: tokens.appearance.cardTreatment,
        surfaceMaterial: tokens.appearance.surfaceMaterial,
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

    // Fallback: se la tab "events" e' attiva ma non ci sono piu featured da
    // mostrare (mount diretto o svuotamento da refetch/scheduling mid-sessione),
    // riporta la tab a "menu" via setter raw (niente analytics tab_switch).
    useEffect(() => {
        if (activeTab === "events" && allFeaturedContents.length === 0) {
            onTabAutoReset?.();
        }
    }, [activeTab, allFeaturedContents.length, onTabAutoReset]);

    const isRefetchingNow = data.isRefetching ?? false;

    return (
        <CustomerSessionProvider activityId={business.id}>
        <LanguageProvider
            slug={slug}
            currentLang={effectiveLanguage}
            availableLanguages={availableLanguages}
            baseLanguage={baseLanguage}
        >
        <PublicThemeScope style={resolved.style}>
            <div
                className={pageStyles.contentWrapper}
                data-refetching={isRefetchingNow ? "true" : undefined}
            >
            {data.isStale && (
                <StaleDataBanner onRetry={onRetry} />
            )}
            {bannerSlot}
            <CollectionViewWithCustomerSession
                businessName={business.name}
                businessImage={business.cover_image}
                collectionTitle={resolved.catalog?.name ?? ""}
                sectionGroups={sectionGroups}
                style={collectionStyle}
                mode="public"
                activityId={business.id}
                slug={business.slug}
                enableReservations={business.enable_reservations}
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
                onTabChange={onTabChange}
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
                orderingMaintenance={orderingMaintenance}
            />
            </div>
            {children}
        </PublicThemeScope>
        </LanguageProvider>
        </CustomerSessionProvider>
    );
}
