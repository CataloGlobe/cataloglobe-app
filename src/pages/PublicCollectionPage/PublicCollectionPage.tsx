import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import CollectionView, {
    type CollectionViewSection,
    type CollectionViewSectionItem
} from "@/components/PublicCollectionView/CollectionView/CollectionView";
import FeaturedBlock from "@/components/PublicCollectionView/FeaturedBlock/FeaturedBlock";

import { supabase } from "@/services/supabase/client";
import type {
    ResolvedCollections,
    ResolvedProduct,
    ResolvedCategory
} from "@/types/resolvedCollections";
import { parseTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { DEFAULT_COLLECTION_STYLE } from "@/types/collectionStyle";

import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import NotFound from "../NotFound/NotFound";
import { getDisplayValue } from "@/utils/attributes";

/* ===============================================
   DATA MAPPING
   ResolvedCollections → CollectionViewSection[]
=============================================== */

type RawAttr = {
    value_text?: string | null;
    value_number?: number | null;
    value_boolean?: boolean | null;
    value_json?: unknown;
    definition?: { label?: string | null; show_in_public_channels?: boolean | null } | null;
};

function mapProductToItem(p: ResolvedProduct): CollectionViewSectionItem {
    const attributes = (p.attributes as RawAttr[] | undefined)
        ?.filter(a => a.definition?.show_in_public_channels === true)
        .map(a => {
            const value = getDisplayValue(
                a.value_text ?? a.value_number ?? a.value_boolean ?? a.value_json
            );
            return value ? { label: a.definition?.label ?? "—", value } : null;
        })
        .filter((x): x is { label: string; value: string } => x !== null);

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
        ...(p.ingredients && p.ingredients.length > 0 ? { ingredients: p.ingredients } : {}),
        is_disabled: p.is_disabled ?? false
    };
}

function mapCategoryToSection(cat: ResolvedCategory): CollectionViewSection {
    return {
        id: cat.id,
        name: cat.name,
        items: cat.products.filter(p => p.is_visible).map(mapProductToItem)
    };
}

function mapCatalogToSections(resolved: ResolvedCollections): CollectionViewSection[] {
    if (!resolved.catalog?.categories) return [];
    return resolved.catalog.categories.map(mapCategoryToSection).filter(s => s.items.length > 0);
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
    city: string | null;
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
};

type PageState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "inactive"; inactiveReason: string | null }
    | {
          status: "ready";
          business: PublicBusiness;
          resolved: ResolvedCollections;
          tenantLogoUrl: string | null;
      }
    | {
          status: "empty";
          business: PublicBusiness;
          tenantLogoUrl: string | null;
      };

export default function PublicCollectionPage() {
    const { slug } = useParams<{ slug: string }>();
    const [searchParams] = useSearchParams();
    const simulateParam = searchParams.get("simulate");
    const [effectiveSimulate, setEffectiveSimulate] = useState<string | null>(null);
    const isSimulation = !!effectiveSimulate;
    const [state, setState] = useState<PageState>({ status: "loading" });

    useEffect(() => {
        if (!slug) {
            setState({ status: "error", message: "Link non valido." });
            return;
        }

        let cancelled = false;

        async function load() {
            try {
                setState({ status: "loading" });

                // Gate simulation behind authentication
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
                setEffectiveSimulate(simulate ?? null);

                const { data, error } = await supabase.functions.invoke(
                    "resolve-public-catalog",
                    { body: { slug, simulate } }
                );

                if (cancelled) return;

                if (error) throw error;

                const { business, tenantLogoUrl, resolved } = data as {
                    business: PublicBusiness;
                    tenantLogoUrl: string | null;
                    resolved: ResolvedCollections;
                };
                // TODO: rimuovere dopo diagnosi social
                console.log("[PublicCollectionPage] business ricevuto:", JSON.stringify(business, null, 2));

                // Inactive venue
                if (business.status !== "active") {
                    setState({
                        status: "inactive",
                        inactiveReason: business.inactive_reason ?? null
                    });
                    return;
                }

                // Empty state (no catalog, no featured)
                if (
                    !resolved.catalog &&
                    (!resolved.featured?.hero || resolved.featured.hero.length === 0) &&
                    (!resolved.featured?.before_catalog ||
                        resolved.featured.before_catalog.length === 0) &&
                    (!resolved.featured?.after_catalog ||
                        resolved.featured.after_catalog.length === 0)
                ) {
                    setState({ status: "empty", business, tenantLogoUrl });
                    return;
                }

                setState({ status: "ready", business, resolved, tenantLogoUrl });
            } catch (err) {
                if (cancelled) return;
                console.error("[PublicCollectionPage] loading error:", err);
                setState({
                    status: "error",
                    message: err instanceof Error ? err.message : "Errore di caricamento."
                });
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [slug, simulateParam]);

    useEffect(() => {
        if (state.status === "ready") {
            document.title = `${state.business.name} | CataloGlobe`;
        }
    }, [state]);

    /* ============================
       RENDER
    ============================ */

    if (state.status === "loading") {
        return <AppLoader message="Stiamo caricando il catalogo" />;
    }

    if (state.status === "error") {
        return <NotFound variant="business" />;
    }

    if (state.status === "inactive") {
        return (
            <NotFound
                variant="business-inactive"
                inactiveReason={state.inactiveReason as "maintenance" | "closed" | "unavailable" | null}
            />
        );
    }

    if (state.status === "empty") {
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100vh",
                    padding: "24px",
                    textAlign: "center"
                }}
            >
                <h2>{state.business.name}</h2>
                <p>
                    {isSimulation
                        ? "Nessun contenuto attivo per la data e l'ora simulata."
                        : "Nessun contenuto disponibile al momento."}
                </p>
            </div>
        );
    }

    const { business, resolved, tenantLogoUrl } = state;

    // Derive CollectionStyle from stored tokens so runtime matches preview
    const tokens = parseTokens(resolved.style?.config ?? null);
    const navStyle = tokens.navigation.style; // "pill" | "tabs" | "minimal"
    const sectionNavShape =
        navStyle === "tabs" ? "square" : navStyle === "minimal" ? "rounded" : "pill";
    const cardTemplate: "no-image" | "left" | "right" =
        tokens.card.image.mode === "hide"
            ? "no-image"
            : tokens.card.image.position === "right"
              ? "right"
              : "left";

    const collectionStyle = {
        ...DEFAULT_COLLECTION_STYLE,
        sectionNavShape,
        sectionNavStyle: navStyle,
        cardTemplate,
        cardLayout: tokens.card.layout,
        productStyle: tokens.card.productStyle,
        showLogo: tokens.header.showLogo,
        showCoverImage: tokens.header.showCoverImage,
        showActivityName: tokens.header.showActivityName,
        showCatalogName: tokens.header.showCatalogName
    } as const;

    const sections = mapCatalogToSections(resolved);
    const emptyState =
        sections.length === 0 ? { title: "Nessun prodotto disponibile al momento" } : undefined;

    return (
        <PublicThemeScope style={resolved.style}>
            {isSimulation && (
                <div
                    style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 9999,
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
                    <span>Anteprima simulazione</span>
                    <span>{new Date(effectiveSimulate!).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</span>
                </div>
            )}
            <CollectionView
                businessName={business.name}
                businessImage={business.cover_image}
                collectionTitle={resolved.catalog?.name ?? ""}
                sections={sections}
                style={collectionStyle}
                mode="public"
                tenantLogoUrl={tenantLogoUrl}
                activityAddress={[business.address, business.city].filter(Boolean).join(", ") || null}
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
                emptyState={emptyState}
                featuredHeroSlot={
                    resolved.featured?.hero && resolved.featured.hero.length > 0 ? (
                        <FeaturedBlock blocks={resolved.featured.hero} />
                    ) : null
                }
                featuredBeforeCatalogSlot={
                    resolved.featured?.before_catalog &&
                    resolved.featured.before_catalog.length > 0 ? (
                        <FeaturedBlock blocks={resolved.featured.before_catalog} />
                    ) : null
                }
            />

            {resolved.featured?.after_catalog && resolved.featured.after_catalog.length > 0 && (
                <FeaturedBlock blocks={resolved.featured.after_catalog} />
            )}
        </PublicThemeScope>
    );
}
