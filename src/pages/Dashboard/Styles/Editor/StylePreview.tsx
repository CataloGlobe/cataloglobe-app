import { useState, useCallback } from "react";
import { IconDeviceMobile, IconDeviceDesktop } from "@tabler/icons-react";
import { StyleTokenModel } from "./StyleTokenModel";
import CollectionView, {
    type CollectionViewSectionGroup
} from "@/components/PublicCollectionView/CollectionView/CollectionView";
import FeaturedBlock from "@/components/PublicCollectionView/FeaturedBlock/FeaturedBlock";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import {
    DEFAULT_COLLECTION_STYLE,
    type SectionNavShape
} from "@/types/collectionStyle";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import previewStyles from "./StylePreview.module.scss";

type StylePreviewProps = {
    model: StyleTokenModel;
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
                product: { id: "fp1", name: "Elemento in evidenza", description: null, base_price: 14.0, image_url: null, fromPrice: null, is_from_price: false, price_variants: [] }
            },
            {
                sort_order: 1,
                note: null,
                product: { id: "fp2", name: "Offerta speciale", description: null, base_price: 9.5, image_url: null, fromPrice: null, is_from_price: false, price_variants: [] }
            },
            {
                sort_order: 2,
                note: null,
                product: { id: "fp3", name: "Selezione del mese", description: null, base_price: 18.0, image_url: null, fromPrice: null, is_from_price: false, price_variants: [] }
            }
        ],
        created_at: "",
        updated_at: ""
    }
];

const MOCK_SECTION_GROUPS: CollectionViewSectionGroup[] = [
    {
        root: {
            id: "s1",
            name: "Categoria 1",
            level: 1,
            parentCategoryId: null,
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
                }
            ]
        },
        children: [
            {
                id: "s1-sub",
                name: "Sottocategoria",
                level: 2,
                parentCategoryId: "s1",
                items: [
                    {
                        id: "i3",
                        name: "Articolo Standard",
                        description: "Adatto a diversi contesti e necessità.",
                        price: 9.0,
                        image: null,
                        parentSelected: true
                    }
                ]
            }
        ]
    },
    {
        root: {
            id: "s2",
            name: "Categoria 2",
            level: 1,
            parentCategoryId: null,
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
                }
            ]
        },
        children: []
    },
    {
        root: {
            id: "s3",
            name: "Categoria 3",
            level: 1,
            parentCategoryId: null,
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
        },
        children: []
    }
];

const NAV_SHAPE_MAP: Record<string, SectionNavShape> = {
    pill: "pill",
    chip: "pill",
    outline: "pill",
    tabs: "square",
    minimal: "rounded",
    dot: "pill"
};

export const StylePreview = ({ model }: StylePreviewProps) => {
    const [viewMode, setViewMode] = useState<"mobile" | "desktop">("mobile");
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [screenEl, setScreenEl] = useState<HTMLDivElement | null>(null);

    const handleViewModeChange = useCallback((mode: "mobile" | "desktop") => {
        if (mode === viewMode) return;
        setIsTransitioning(true);
        setTimeout(() => {
            setViewMode(mode);
            requestAnimationFrame(() => {
                setIsTransitioning(false);
            });
        }, 250);
    }, [viewMode]);

    const businessName = "Nome Sede";

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
        cardLayout: model.card.layout,
        productStyle: model.card.productStyle,
        showLogo: model.header.showLogo,
        showCoverImage: model.header.showCoverImage,
        showActivityName: model.header.showActivityName,
        showCatalogName: model.header.showCatalogName
    };

    return (
        <div className={previewStyles.previewRoot}>
            {/* Toggle */}
            <div className={previewStyles.toggleBar}>
                <div
                    className={`${previewStyles.toggleIndicator} ${
                        viewMode === "desktop" ? previewStyles.toggleIndicatorDesktop : ""
                    }`}
                />
                <button
                    type="button"
                    className={`${previewStyles.toggleBtn} ${
                        viewMode === "mobile" ? previewStyles.toggleBtnActive : ""
                    }`}
                    onClick={() => handleViewModeChange("mobile")}
                >
                    <IconDeviceMobile size={14} stroke={2} />
                    Mobile
                </button>
                <button
                    type="button"
                    className={`${previewStyles.toggleBtn} ${
                        viewMode === "desktop" ? previewStyles.toggleBtnActive : ""
                    }`}
                    onClick={() => handleViewModeChange("desktop")}
                >
                    <IconDeviceDesktop size={14} stroke={2} />
                    Desktop
                </button>
            </div>

            {/* Device Frame */}
            <PublicThemeScope tokens={model}>
                <div
                    className={`${previewStyles.deviceFrame} ${
                        viewMode === "mobile"
                            ? previewStyles.deviceMobile
                            : previewStyles.deviceDesktop
                    } ${viewMode === "mobile" ? "preview-mobile" : "preview-desktop"} ${
                        isTransitioning ? previewStyles.deviceFrameTransitioning : ""
                    }`}
                >
                    <div className={previewStyles.deviceScreen} ref={setScreenEl}>
                        <CollectionView
                            businessName={businessName}
                            businessImage={null}
                            collectionTitle="Nome Catalogo"
                            sectionGroups={MOCK_SECTION_GROUPS}
                            style={collectionStyle}
                            mode="preview"
                            scrollContainerEl={screenEl}
                            activityAddress="Via Example, 1 - Città"
                            featuredBeforeCatalogSlot={
                                <FeaturedBlock blocks={MOCK_FEATURED} flush />
                            }
                            featuredAfterCatalogSlot={
                                <FeaturedBlock blocks={MOCK_FEATURED} flush />
                            }
                        />
                    </div>
                </div>
            </PublicThemeScope>
        </div>
    );
};
