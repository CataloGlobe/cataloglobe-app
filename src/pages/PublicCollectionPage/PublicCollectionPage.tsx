import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import CollectionView, {
    type CollectionViewSection,
    type CollectionViewSectionItem
} from "@/components/PublicCollectionView/CollectionView/CollectionView";
import FeaturedBlock from "@/components/PublicCollectionView/FeaturedBlock/FeaturedBlock";

import { getActivityBySlug } from "@/services/supabase/activities";
import {
    resolveActivityCatalogs,
    type ResolvedCollections,
    type ResolvedProduct,
    type ResolvedCategory
} from "@/services/supabase/resolveActivityCatalogs";
import { getTenantLogoPublicUrl, getTenantPublicInfo } from "@/services/supabase/tenants";
import { parseTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { DEFAULT_COLLECTION_STYLE } from "@/types/collectionStyle";

import type { V2Activity } from "@/types/activity";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import NotFound from "../NotFound/NotFound";

/* ===============================================
   DATA MAPPING
   ResolvedCollections → CollectionViewSection[]
=============================================== */

function mapProductToItem(p: ResolvedProduct): CollectionViewSectionItem {
    return {
        id: p.id,
        name: p.name,
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
                priceModifier: v.price_modifier
            }))
        }))
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
    return resolved.catalog.categories
        .map(mapCategoryToSection)
        .filter(s => s.items.length > 0);
}

/* ===============================================
   PAGE
=============================================== */

type PageState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
          status: "ready";
          business: V2Activity;
          resolved: ResolvedCollections;
          tenantLogoUrl: string | null;
      }
    | {
          status: "empty";
          business: V2Activity;
          tenantLogoUrl: string | null;
      };

export default function PublicCollectionPage() {
    const { slug } = useParams<{ slug: string }>();
    const [state, setState] = useState<PageState>({ status: "loading" });

    useEffect(() => {
        if (!slug) {
            setState({ status: "error", message: "Link non valido." });
            return;
        }

        const businessSlug = slug;
        let cancelled = false;

        async function load() {
            try {
                setState({ status: "loading" });

                const business = await getActivityBySlug(businessSlug);
                if (!business) throw new Error("Attività non trovata.");

                const [resolved, tenantInfo] = await Promise.all([
                    resolveActivityCatalogs(business.id),
                    getTenantPublicInfo(business.tenant_id)
                ]);

                const tenantLogoUrl = tenantInfo?.logo_url
                    ? getTenantLogoPublicUrl(tenantInfo.logo_url)
                    : null;

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

                if (cancelled) return;

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
        return () => { cancelled = true; };
    }, [slug]);

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
                <p>Nessun menu disponibile al momento.</p>
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
        cardLayout: tokens.card.layout
    } as const;

    const sections = mapCatalogToSections(resolved);
    const emptyState =
        sections.length === 0
            ? { title: "Nessun prodotto disponibile al momento" }
            : undefined;

    return (
        <PublicThemeScope style={resolved.style}>
            <CollectionView
                businessName={business.name}
                businessImage={business.cover_image}
                collectionTitle={resolved.catalog?.name ?? ""}
                sections={sections}
                style={collectionStyle}
                mode="public"
                tenantLogoUrl={tenantLogoUrl}
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

            {resolved.featured?.after_catalog &&
                resolved.featured.after_catalog.length > 0 && (
                    <FeaturedBlock blocks={resolved.featured.after_catalog} />
                )}
        </PublicThemeScope>
    );
}
