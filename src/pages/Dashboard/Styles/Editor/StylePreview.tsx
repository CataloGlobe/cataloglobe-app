import { useState } from "react";
import { StyleTokenModel } from "./StyleTokenModel";
import CollectionView, {
    type CollectionViewSection
} from "@/components/PublicCollectionView/CollectionView/CollectionView";
import FeaturedBlock from "@/components/PublicCollectionView/FeaturedBlock/FeaturedBlock";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import {
    DEFAULT_COLLECTION_STYLE,
    type SectionNavShape
} from "@/types/collectionStyle";
import { useTenant } from "@/context/useTenant";
import type { V2FeaturedContent } from "@/services/supabase/resolveActivityCatalogs";

type StylePreviewProps = {
    model: StyleTokenModel;
    scrollContainerEl?: HTMLElement | null;
};

const MOCK_FEATURED: V2FeaturedContent[] = [
    {
        id: "f1",
        internal_name: "preview-featured",
        title: "In evidenza",
        subtitle: "Una selezione pensata per te",
        description: null,
        media_id: null,
        cta_text: null,
        cta_url: null,
        status: "published",
        layout_style: null,
        pricing_mode: "per_item",
        bundle_price: null,
        show_original_total: false,
        products: [
            {
                sort_order: 0,
                note: null,
                product: { id: "fp1", name: "Elemento in evidenza", description: null, base_price: 14.0 }
            },
            {
                sort_order: 1,
                note: null,
                product: { id: "fp2", name: "Offerta speciale", description: null, base_price: 9.5 }
            },
            {
                sort_order: 2,
                note: null,
                product: { id: "fp3", name: "Selezione del mese", description: null, base_price: 18.0 }
            }
        ],
        created_at: "",
        updated_at: ""
    }
];

const MOCK_SECTIONS: CollectionViewSection[] = [
    {
        id: "s1",
        name: "Categoria 1",
        items: [
            {
                id: "i1",
                name: "Elemento Base",
                description: "Descrizione breve del prodotto o servizio.",
                price: 12.0,
                image: null,
                parentSelected: true
            },
            {
                id: "i2",
                name: "Prodotto Premium",
                description: "Versione avanzata con caratteristiche aggiuntive.",
                price: 24.0,
                image: null,
                parentSelected: true
            },
            {
                id: "i3",
                name: "Articolo Standard",
                description: "Adatto a diversi contesti e necessità.",
                price: 9.0,
                image: null,
                parentSelected: true
            }
        ]
    },
    {
        id: "s2",
        name: "Categoria 2",
        items: [
            {
                id: "i4",
                name: "Offerta Speciale",
                description: "Disponibile per un periodo limitato.",
                price: 15.0,
                original_price: 22.0,
                effective_price: 15.0,
                image: null,
                parentSelected: true
            },
            {
                id: "i5",
                name: "Versione Compatta",
                description: "Ideale per un utilizzo quotidiano.",
                price: 8.0,
                image: null,
                parentSelected: true
            },
            {
                id: "i6",
                name: "Proposta Stagionale",
                description: "Disponibilità limitata alla stagione in corso.",
                price: 11.0,
                image: null,
                parentSelected: true
            }
        ]
    },
    {
        id: "s3",
        name: "Categoria 3",
        items: [
            {
                id: "i7",
                name: "Confezione Speciale",
                description: "Formato pensato per più persone.",
                price: 32.0,
                image: null,
                parentSelected: true
            },
            {
                id: "i8",
                name: "Articolo Esclusivo",
                description: "Produzione limitata, disponibile su richiesta.",
                price: 45.0,
                image: null,
                parentSelected: true
            }
        ]
    }
];

const NAV_SHAPE_MAP: Record<string, SectionNavShape> = {
    pill: "pill",
    tabs: "square",
    minimal: "rounded"
};

export const StylePreview = ({ model, scrollContainerEl }: StylePreviewProps) => {
    const { selectedTenant } = useTenant();
    const [viewMode, setViewMode] = useState<"mobile" | "desktop">("mobile");

    const businessName = selectedTenant?.name ?? "Nome attività";

    const sectionNavShape: SectionNavShape =
        NAV_SHAPE_MAP[model.navigation.style] ?? "pill";

    const cardTemplate: "no-image" | "left" | "right" =
        model.card.image.mode === "hide"
            ? "no-image"
            : model.card.image.position === "right"
              ? "right"
              : "left";

    const collectionStyle = {
        ...DEFAULT_COLLECTION_STYLE,
        sectionNavShape,
        sectionNavStyle: model.navigation.style,
        cardTemplate,
        cardLayout: model.card.layout
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "32px",
                margin: "0 auto",
                width: "100%"
            }}
        >
            {/* View Mode Toggle */}
            <div
                style={{
                    marginBottom: "24px",
                    display: "flex",
                    gap: "8px",
                    backgroundColor: "var(--color-surface)",
                    borderRadius: "8px",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}
            >
                <button
                    onClick={() => setViewMode("mobile")}
                    style={{
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "none",
                        background:
                            viewMode === "mobile" ? "var(--color-bg-subtle)" : "transparent",
                        fontWeight: viewMode === "mobile" ? 600 : 400,
                        color:
                            viewMode === "mobile"
                                ? "var(--color-text)"
                                : "var(--color-text-muted)",
                        cursor: "pointer",
                        fontSize: "14px"
                    }}
                >
                    Mobile
                </button>
                <button
                    onClick={() => setViewMode("desktop")}
                    style={{
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "none",
                        background:
                            viewMode === "desktop" ? "var(--color-bg-subtle)" : "transparent",
                        fontWeight: viewMode === "desktop" ? 600 : 400,
                        color:
                            viewMode === "desktop"
                                ? "var(--color-text)"
                                : "var(--color-text-muted)",
                        cursor: "pointer",
                        fontSize: "14px"
                    }}
                >
                    Desktop
                </button>
            </div>

            {/* Themed Canvas */}
            <PublicThemeScope tokens={model}>
                <div
                    className={
                        viewMode === "mobile" ? "preview-mobile" : "preview-desktop"
                    }
                    style={{
                        width: "100%",
                        maxWidth: viewMode === "mobile" ? "390px" : "900px",
                        borderRadius: "16px",
                        boxShadow:
                            "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)",
                        overflow: "clip",
                        transition: "max-width 0.3s ease-in-out"
                    }}
                >
                    <CollectionView
                        businessName={businessName}
                        businessImage={null}
                        collectionTitle="Catalogo digitale"
                        sections={MOCK_SECTIONS}
                        style={collectionStyle}
                        mode="preview"
                        scrollContainerEl={scrollContainerEl}
                        featuredBeforeCatalogSlot={
                            <FeaturedBlock blocks={MOCK_FEATURED} />
                        }
                    />
                </div>
            </PublicThemeScope>
        </div>
    );
};
