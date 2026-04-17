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
import type { OpeningHoursEntry, UpcomingClosure } from "@/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
import previewStyles from "./StylePreview.module.scss";

type StylePreviewProps = {
    model: StyleTokenModel;
};

const MOCK_FEATURED: V2FeaturedContent[] = [
    {
        id: "f1",
        internal_name: "happy-hour",
        title: "Happy Hour Estivo",
        subtitle: "Ogni giorno dalle 17 alle 19",
        description: null,
        media_id: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=200&fit=crop",
        cta_text: null,
        cta_url: null,
        status: "published",
        layout_style: null,
        pricing_mode: "none",
        bundle_price: null,
        show_original_total: false,
        products: [],
        created_at: "",
        updated_at: ""
    },
    {
        id: "f2",
        internal_name: "brunch-weekend",
        title: "Menu Brunch Weekend",
        subtitle: "Sabato e Domenica",
        description: null,
        media_id: null,
        cta_text: null,
        cta_url: null,
        status: "published",
        layout_style: null,
        pricing_mode: "bundle",
        bundle_price: 9.9,
        show_original_total: false,
        products: [
            {
                sort_order: 0,
                note: null,
                product: { id: "fp1", name: "Spremuta fresca", description: null, base_price: 4.0, image_url: null, fromPrice: null, is_from_price: false, price_variants: [] }
            },
            {
                sort_order: 1,
                note: null,
                product: { id: "fp2", name: "Toast misto", description: null, base_price: 6.0, image_url: null, fromPrice: null, is_from_price: false, price_variants: [] }
            }
        ],
        created_at: "",
        updated_at: ""
    },
    {
        id: "f3",
        internal_name: "degustazione",
        title: "Serata Degustazione",
        subtitle: "15 Maggio 2026",
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
                product: { id: "fp3", name: "Calice rosso riserva", description: null, base_price: 12.0, image_url: null, fromPrice: null, is_from_price: false, price_variants: [] }
            },
            {
                sort_order: 1,
                note: null,
                product: { id: "fp4", name: "Tagliere salumi", description: null, base_price: 18.0, image_url: null, fromPrice: null, is_from_price: false, price_variants: [] }
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
            },
            {
                id: "s1-sub-sub",
                name: "Dettaglio",
                level: 3,
                parentCategoryId: "s1-sub",
                items: [
                    {
                        id: "i3b",
                        name: "Variante Specifica",
                        description: "Un esempio di sotto-sottocategoria.",
                        price: 7.5,
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

const MOCK_OPENING_HOURS: OpeningHoursEntry[] = [
    { day_of_week: 0, slot_index: 0, opens_at: "09:00", closes_at: "13:00", is_closed: false },
    { day_of_week: 0, slot_index: 1, opens_at: "19:00", closes_at: "23:00", is_closed: false },
    { day_of_week: 1, slot_index: 0, opens_at: "09:00", closes_at: "13:00", is_closed: false },
    { day_of_week: 1, slot_index: 1, opens_at: "19:00", closes_at: "23:00", is_closed: false },
    { day_of_week: 2, slot_index: 0, opens_at: "09:00", closes_at: "13:00", is_closed: false },
    { day_of_week: 2, slot_index: 1, opens_at: "19:00", closes_at: "23:00", is_closed: false },
    { day_of_week: 3, slot_index: 0, opens_at: "09:00", closes_at: "13:00", is_closed: false },
    { day_of_week: 3, slot_index: 1, opens_at: "19:00", closes_at: "23:00", is_closed: false },
    { day_of_week: 4, slot_index: 0, opens_at: "09:00", closes_at: "13:00", is_closed: false },
    { day_of_week: 4, slot_index: 1, opens_at: "19:00", closes_at: "23:00", is_closed: false },
    { day_of_week: 5, slot_index: 0, opens_at: "12:00", closes_at: "15:00", is_closed: false },
    { day_of_week: 5, slot_index: 1, opens_at: "19:00", closes_at: "23:30", is_closed: false },
    { day_of_week: 6, slot_index: 0, opens_at: null, closes_at: null, is_closed: true },
];

const MOCK_UPCOMING_CLOSURES: UpcomingClosure[] = [
    {
        closure_date: "2026-12-25",
        end_date: null,
        label: "Natale",
        is_closed: true,
        slots: null,
    },
    {
        closure_date: "2026-12-24",
        end_date: null,
        label: "Vigilia",
        is_closed: false,
        slots: [
            { opens_at: "09:00", closes_at: "13:00" },
            { opens_at: "18:00", closes_at: "20:00" },
        ],
    },
    {
        closure_date: "2026-08-10",
        end_date: "2026-08-25",
        label: "Ferie estive",
        is_closed: true,
        slots: null,
    },
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
                            openingHours={MOCK_OPENING_HOURS}
                            upcomingClosures={MOCK_UPCOMING_CLOSURES}
                            featuredBeforeCatalogSlot={
                                <FeaturedBlock blocks={MOCK_FEATURED} />
                            }
                            featuredAfterCatalogSlot={
                                <FeaturedBlock blocks={MOCK_FEATURED} />
                            }
                        />
                    </div>
                </div>
            </PublicThemeScope>
        </div>
    );
};
