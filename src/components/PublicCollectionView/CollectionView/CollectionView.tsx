import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Facebook, Globe, Instagram, Mail, MapPin, MessageCircle, MessageSquareHeart, Package, Phone, Plus, Search } from "lucide-react";
import type {
    ResolvedAllergen,
    ResolvedIngredient,
    V2FeaturedContent
} from "@/types/resolvedCollections";
import type { HubTab } from "@/types/collectionStyle";
import Text from "@/components/ui/Text/Text";
import { trackEvent } from "@/services/analytics/publicAnalytics";
// NOTE: CollectionHero e PublicBrandHeader sono sostituiti da PublicCollectionHeader.
// I file originali restano nel progetto come fallback potenziale.
// import CollectionHero from "../CollectionHero/CollectionHero";
// import PublicBrandHeader from "../PublicBrandHeader/PublicBrandHeader";
import PublicCollectionHeader from "../PublicCollectionHeader/PublicCollectionHeader";
import PublicFooter from "../PublicFooter/PublicFooter";
import SearchOverlay from "../SearchOverlay/SearchOverlay";
import CollectionSectionNav from "../CollectionSectionNav/CollectionSectionNav";
import type { CollectionStyle } from "@/types/collectionStyle";
import styles from "./CollectionView.module.scss";
import ItemDetail from "../ItemDetail/ItemDetail";
import SelectionSheet, {
    type SelectionItem,
    type SelectedFormat,
    type SelectedAddon
} from "../SelectionSheet/SelectionSheet";
import EventsView from "../EventsView/EventsView";
import ReviewsView, { type ReviewsViewProps } from "../ReviewsView/ReviewsView";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import LanguageSelector from "@components/PublicCollectionView/LanguageSelector/LanguageSelector";
import type { OpeningHoursEntry, UpcomingClosure } from "../PublicOpeningHours/PublicOpeningHours";
import PublicSheet from "../PublicSheet/PublicSheet";
import PublicOpeningHours from "../PublicOpeningHours/PublicOpeningHours";

// ─── Selection helpers ────────────────────────────────────────────────────────

function generateSelectionKey(
    productId: string,
    format: SelectedFormat | null | undefined,
    addons: SelectedAddon[]
): string {
    const formatPart = format ? format.id : "no-format";
    const addonPart = addons.map(a => a.id).sort().join(",") || "no-addons";
    return `${productId}__${formatPart}__${addonPart}`;
}

function migrateSelectionItem(item: Record<string, unknown>): SelectionItem {
    if ("unitPrice" in item) return item as unknown as SelectionItem;
    const price = typeof item.price === "number" ? item.price : 0;
    return {
        id: item.id as string,
        name: item.name as string,
        basePrice: price,
        qty: typeof item.qty === "number" ? item.qty : 1,
        selectedFormat: null,
        selectedAddons: [],
        unitPrice: price,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

type SectionNavItem = {
    id: string;
    name: string;
    children?: { id: string; name: string; level: number }[];
};

export type CollectionViewSectionItem = {
    id: string;
    name: string;
    description?: string | null;
    price?: number | null;
    effective_price?: number | null;
    original_price?: number | null;
    /** Min format price. When set, show "da X€" on card. */
    from_price?: number | null;
    image?: string | null;
    optionGroups?: {
        id: string;
        name: string;
        group_kind: "PRIMARY_PRICE" | "ADDON";
        pricing_mode: "ABSOLUTE" | "DELTA";
        isRequired: boolean;
        maxSelectable: number | null;
        values: {
            id: string;
            name: string;
            absolutePrice: number | null;
            priceModifier: number | null;
            /** Set when a value-level price override is active with show_original_price = true. */
            originalPrice?: number;
        }[];
    }[];
    /** Pre-computed attribute label/value pairs — only those with a value. */
    attributes?: { label: string; value: string }[];
    allergens?: ResolvedAllergen[];
    ingredients?: ResolvedIngredient[];
    /** Child variants (products with parent_product_id = this.id). */
    variants?: {
        id: string;
        name: string;
        price?: number;
        original_price?: number;
        from_price?: number;
        image?: string;
        description?: string;
        optionGroups?: CollectionViewSectionItem["optionGroups"];
    }[];
    parentSelected: boolean;
    is_disabled?: boolean;
};

export type CollectionViewSection = {
    id: string;
    name: string;
    items: CollectionViewSectionItem[];
    level: number;
    parentCategoryId: string | null;
};

export type CollectionViewSectionGroup = {
    root: CollectionViewSection;
    children: CollectionViewSection[];
};

// ─── getDisplayPrice — single pricing rule for all product types ─────────────
// If a product has more than one active price (from_price set) → "da €MIN"
// If it has exactly one active price → "€PRICE"
// Handles both parent products and variants identically.

type DisplayPrice =
    | { type: "from"; price: number; originalPrice?: number }
    | { type: "single"; price: number; originalPrice?: number }
    | { type: "none" };

function getDisplayPrice(opts: {
    fromPrice?: number | null;
    price?: number | null;
    effectivePrice?: number | null;
    originalPrice?: number | null;
}): DisplayPrice {
    if (opts.fromPrice != null) {
        return {
            type: "from",
            price: opts.fromPrice,
            ...(opts.originalPrice != null ? { originalPrice: opts.originalPrice } : {})
        };
    }
    const single = opts.effectivePrice ?? opts.price;
    if (single != null) {
        return {
            type: "single",
            price: single,
            ...(opts.originalPrice != null ? { originalPrice: opts.originalPrice } : {})
        };
    }
    return { type: "none" };
}

// ─── ProductRow — shared layout for parent products and variants ──────────────

type ProductRowProps = {
    name: string;
    fromPrice?: number | null;
    price?: number | null;
    effectivePrice?: number | null;
    originalPrice?: number | null;
    description?: string | null;
    image?: string | null;
    showImage: boolean;
    imageRight?: boolean;
    mode: "public" | "preview";
    onClick: (e: React.MouseEvent) => void;
    optionGroups?: CollectionViewSectionItem["optionGroups"];
    attributes?: CollectionViewSectionItem["attributes"];
    allergens?: ResolvedAllergen[];
    onAddToSelection?: () => void;
    selectionQty?: number;
};

function ProductRow({
    name,
    fromPrice,
    price,
    effectivePrice,
    originalPrice,
    description,
    image,
    showImage,
    imageRight = false,
    mode,
    onClick,
    optionGroups,
    attributes,
    allergens,
    onAddToSelection,
    selectionQty = 0
}: ProductRowProps) {
    const hasConfigurations = optionGroups?.some(g => g.group_kind === "ADDON") ?? false;
    const hasAttributes = (attributes?.length ?? 0) > 0;
    const hasAllergens = (allergens?.length ?? 0) > 0;
    const MAX_ALLERGEN_EMOJIS = 6;
    const visibleAllergens = hasAllergens ? allergens!.slice(0, MAX_ALLERGEN_EMOJIS) : [];
    const hiddenCount = hasAllergens ? Math.max(0, allergens!.length - MAX_ALLERGEN_EMOJIS) : 0;
    const dp = getDisplayPrice({ fromPrice, price, effectivePrice, originalPrice });

    // ── Fade-in immagine prodotto ─────────────────────────────────────────
    const [imgLoaded, setImgLoaded] = useState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { setImgLoaded(false); }, [image]);

    return (
        <div
            className={`${styles.productRow} ${imageRight ? styles.productRowImageRight : ""}`}
            onClick={onClick}
        >
            {showImage &&
                (mode === "preview" || !image ? (
                    <div className={styles.rowPlaceholder} aria-hidden="true">
                        <Package
                            size={24}
                            strokeWidth={1.5}
                            color="var(--pub-text-muted, var(--pub-text-secondary))"
                        />
                    </div>
                ) : (
                    <img
                        src={image}
                        alt={name}
                        className={`${styles.rowImage} ${imgLoaded ? styles.rowImageLoaded : ""}`}
                        loading="lazy"
                        onLoad={() => setImgLoaded(true)}
                    />
                ))}
            <div className={styles.rowBody}>
                <div className={styles.titleRow}>
                    <div className={styles.titleRowLeft}>
                        <Text variant="body" weight={700} className={styles.title} color="var(--pub-surface-text)">
                            {name}
                        </Text>
                        {dp.type !== "none" && dp.originalPrice != null && (
                            <span className={styles.promoBadge}>Promo</span>
                        )}
                    </div>

                </div>

                {dp.type === "from" ? (
                    <Text variant="caption" className={styles.price} color="var(--pub-surface-text-secondary)">
                        {dp.originalPrice != null && (
                            <span className={styles.priceOriginal}>
                                da € {dp.originalPrice.toFixed(2)}
                            </span>
                        )}
                        <span
                            className={`${styles.priceCurrent}${dp.originalPrice != null ? ` ${styles.promoPrice}` : ""}`}
                        >
                            da € {dp.price.toFixed(2)}
                        </span>
                    </Text>
                ) : dp.type === "single" ? (
                    <Text variant="caption" className={styles.price} color="var(--pub-surface-text-secondary)">
                        {dp.originalPrice != null && (
                            <span className={styles.priceOriginal}>
                                € {dp.originalPrice.toFixed(2)}
                            </span>
                        )}
                        <span
                            className={`${styles.priceCurrent}${dp.originalPrice != null ? ` ${styles.promoPrice}` : ""}`}
                        >
                            € {dp.price.toFixed(2)}
                        </span>
                    </Text>
                ) : null}

                {description && (
                    <Text variant="caption" className={styles.description} color="var(--pub-surface-text-muted)">
                        {description}
                    </Text>
                )}
                {optionGroups && optionGroups.length > 0 && (
                    <span className={styles.customizableHint}>Personalizzabile</span>
                )}
                {hasAllergens && (
                    <div className={styles.allergenEmojis}>
                        {visibleAllergens.map(a => (
                            <span key={a.id} className={styles.allergenEmoji}>
                                <AllergenIcon code={a.code} size={20} label={a.label_it} />
                            </span>
                        ))}
                        {hiddenCount > 0 && (
                            <span className={styles.allergenMore}>+{hiddenCount}</span>
                        )}
                    </div>
                )}
            </div>
            {onAddToSelection && (
                <button
                    type="button"
                    className={[styles.addBtn, selectionQty > 0 ? styles.addBtnActive : ""]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={e => {
                        e.stopPropagation();
                        onAddToSelection();
                    }}
                    aria-label="Aggiungi alla selezione"
                >
                    <Plus size={16} strokeWidth={2.5} />
                    {selectionQty > 0 && <span className={styles.addBtnBadge}>{selectionQty}</span>}
                </button>
            )}
        </div>
    );
}

// ─── ProductCompactRow — text-only compact-style product row ─────────────────

type ProductCompactRowProps = {
    name: string;
    fromPrice?: number | null;
    price?: number | null;
    effectivePrice?: number | null;
    originalPrice?: number | null;
    description?: string | null;
    onClick: (e: React.MouseEvent) => void;
    allergens?: ResolvedAllergen[];
    onAddToSelection?: () => void;
    selectionQty?: number;
};

function ProductCompactRow({
    name,
    fromPrice,
    price,
    effectivePrice,
    originalPrice,
    description,
    onClick,
    allergens,
    onAddToSelection,
    selectionQty = 0
}: ProductCompactRowProps) {
    const hasAllergens = (allergens?.length ?? 0) > 0;
    const MAX_ALLERGEN_ICONS = 6;
    const visibleAllergens = hasAllergens ? allergens!.slice(0, MAX_ALLERGEN_ICONS) : [];
    const hiddenCount = hasAllergens ? Math.max(0, allergens!.length - MAX_ALLERGEN_ICONS) : 0;
    const dp = getDisplayPrice({ fromPrice, price, effectivePrice, originalPrice });

    return (
        <div className={styles.compactRow} onClick={onClick}>
            <div className={styles.compactRowBody}>
                <div className={styles.compactNameRow}>
                    <span className={styles.compactName}>{name}</span>
                    {dp.type !== "none" && (
                        <span className={styles.compactPrice}>
                            {dp.originalPrice != null && (
                                <span className={styles.compactPriceOriginal}>
                                    {dp.type === "from" ? "da " : ""}€ {dp.originalPrice.toFixed(2)}
                                </span>
                            )}
                            <span>
                                {dp.type === "from" ? "da " : ""}€ {dp.price.toFixed(2)}
                            </span>
                        </span>
                    )}
                </div>
                {description && <span className={styles.compactDescription}>{description}</span>}
                {hasAllergens && (
                    <div className={styles.compactAllergens}>
                        {visibleAllergens.map(a => (
                            <span key={a.id} className={styles.allergenEmoji}>
                                <AllergenIcon code={a.code} size={16} label={a.label_it} />
                            </span>
                        ))}
                        {hiddenCount > 0 && (
                            <span className={styles.allergenMore}>+{hiddenCount}</span>
                        )}
                    </div>
                )}
            </div>
            {onAddToSelection && (
                <button
                    type="button"
                    className={[styles.addBtn, selectionQty > 0 ? styles.addBtnActive : ""]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={e => {
                        e.stopPropagation();
                        onAddToSelection();
                    }}
                    aria-label="Aggiungi alla selezione"
                >
                    <Plus size={15} strokeWidth={2.5} />
                    {selectionQty > 0 && <span className={styles.addBtnBadge}>{selectionQty}</span>}
                </button>
            )}
        </div>
    );
}

// ─── Hub tab views ────────────────────────────────────────────────────────────

// ─── Scroll-offset constants ─────────────────────────────────────────────────
// NAV_HEIGHT: altezza sticky della CollectionSectionNav
// VISUAL_GAP: breathing room sotto la barra sticky
// SCROLL_OFFSET e STICKY_OFFSET sono ora calcolati dinamicamente in base
// all'altezza reale del compact header (via compactHeaderHeightRef).
const NAV_HEIGHT = 67; // CollectionSectionNav (misurato ~66.6px)
const VISUAL_GAP = 16; // breathing room below sticky bar
const FINAL_COMPACT_HEIGHT = 60; // altezza compact header a regime (floor per scroll offset)
// ─────────────────────────────────────────────────────────────────────────────

export type SocialLinks = {
    instagram?: string | null;
    instagram_public?: boolean;
    facebook?: string | null;
    facebook_public?: boolean;
    whatsapp?: string | null;
    whatsapp_public?: boolean;
    website?: string | null;
    website_public?: boolean;
    phone?: string | null;
    phone_public?: boolean;
    email_public?: string | null;
    email_public_visible?: boolean;
};

type Props = {
    businessName: string;
    businessImage: string | null;
    collectionTitle: string;
    sectionGroups: CollectionViewSectionGroup[];
    style: Required<CollectionStyle>;
    mode: "public" | "preview";
    contentId?: string;
    emptyState?: {
        title?: string;
        description?: string;
    };
    featuredBeforeCatalogSlot?: ReactNode;
    featuredAfterCatalogSlot?: ReactNode;
    /** Tenant logo URL da mostrare nel compact header. */
    tenantLogoUrl?: string | null;
    /** Explicit scroll container. Use when the component lives inside a custom
     *  scrollable element (e.g. the style-editor canvas). If omitted, the nearest
     *  scrollable ancestor is detected automatically; falls back to window. */
    scrollContainerEl?: HTMLElement | null;
    /** Indirizzo dell'attività (opzionale, mostrato nell'info card hero). */
    activityAddress?: string | null;
    /** Link social dell'attività (opzionale, mostrati nel footer). */
    socialLinks?: SocialLinks;
    /** Orari di apertura dell'attività (opzionale, mostrati nel footer). */
    openingHours?: OpeningHoursEntry[];
    /** Prossime chiusure straordinarie (opzionale, mostrate nel footer). */
    upcomingClosures?: UpcomingClosure[];
    /** Hub navigation tab attiva. Default "menu" (solo public). */
    activeTab?: HubTab;
    /** Callback per cambio tab. */
    onTabChange?: (tab: HubTab) => void;
    /** Tutti i featured contents (before_catalog + after_catalog) per la vista eventi. */
    featuredContents?: V2FeaturedContent[];
    /** Props per il tab ReviewsView (solo public). */
    reviewsProps?: ReviewsViewProps;
    /** ID della sede — usato come chiave sessionStorage per la selezione prodotti. */
    activityId?: string;
    /** Metodi di pagamento accettati (visibili se non vuoti). */
    paymentMethods?: string[];
    /** Servizi offerti dalla sede (visibili se non vuoti). */
    activityServices?: string[];
};

export default function CollectionView({
    businessName,
    businessImage,
    collectionTitle,
    sectionGroups,
    style,
    mode,
    contentId = "collection-content",
    emptyState,
    featuredBeforeCatalogSlot,
    featuredAfterCatalogSlot,
    tenantLogoUrl,
    scrollContainerEl,
    activityAddress,
    socialLinks,
    openingHours,
    upcomingClosures,
    activeTab = "menu",
    onTabChange,
    featuredContents = [],
    reviewsProps,
    activityId,
    paymentMethods,
    activityServices
}: Props) {
    const [activeSectionId, setActiveSectionId] = useState<string | null>(
        () => sectionGroups[0]?.root.id ?? null
    );
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const pageRef = useRef<HTMLElement | null>(null);
    const containerRef = useRef<HTMLElement | Window>(window);
    const pendingScrollTargetIdRef = useRef<string | null>(null);
    const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [selectedItem, setSelectedItem] = useState<CollectionViewSectionItem | null>(null);

    // ── Search overlay ──────────────────────────────────────────────────────
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const handleOpenSearch = useCallback(() => setIsSearchOpen(true), []);
    const handleCloseSearch = useCallback(() => setIsSearchOpen(false), []);

    // ── Info sheet ──────────────────────────────────────────────────────────
    const [isInfoSheetOpen, setIsInfoSheetOpen] = useState(false);
    const hasHours = (openingHours?.length ?? 0) > 0;
    const hasPaymentMethods = (paymentMethods?.length ?? 0) > 0;
    const hasActivityServices = (activityServices?.length ?? 0) > 0;
    const hasContacts = !!(
        (socialLinks?.phone_public && socialLinks?.phone) ||
        (socialLinks?.email_public_visible && socialLinks?.email_public) ||
        (socialLinks?.website_public && socialLinks?.website) ||
        (socialLinks?.whatsapp_public && socialLinks?.whatsapp) ||
        (socialLinks?.instagram_public && socialLinks?.instagram) ||
        (socialLinks?.facebook_public && socialLinks?.facebook)
    );
    const hasAnyInfo = hasHours || hasPaymentMethods || hasActivityServices || hasContacts || !!activityAddress;

    // ── Selezione prodotti ──────────────────────────────────────────────────
    const selectionStorageKey = activityId ? `catalogobe-selection-${activityId}` : null;

    const [selection, setSelection] = useState<SelectionItem[]>(() => {
        if (!selectionStorageKey) return [];
        try {
            const saved = sessionStorage.getItem(selectionStorageKey);
            if (!saved) return [];
            const parsed = JSON.parse(saved) as Record<string, unknown>[];
            return parsed.map(migrateSelectionItem);
        } catch {
            return [];
        }
    });
    const [isSelectionOpen, setIsSelectionOpen] = useState(false);
    const [editingSelectionIndex, setEditingSelectionIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!selectionStorageKey) return;
        try {
            sessionStorage.setItem(selectionStorageKey, JSON.stringify(selection));
        } catch { /* sessionStorage non disponibile */ }
    }, [selection, selectionStorageKey]);

    const selectionCount = useMemo(() => selection.reduce((s, i) => s + i.qty, 0), [selection]);

    // Map id → total qty per lookups O(1) nel render (somma tutte le configurazioni)
    const selectionMap = useMemo(() => {
        const map: Record<string, number> = {};
        selection.forEach(s => {
            map[s.id] = (map[s.id] ?? 0) + s.qty;
        });
        return map;
    }, [selection]);

    // Array piatto di tutte le sezioni (L1+L2+L3) — usato da SearchOverlay
    const sections = useMemo(
        () => sectionGroups.flatMap(g => [g.root, ...g.children]),
        [sectionGroups]
    );

    // Solo le sezioni L1 (root dei gruppi) — usato per scroll tracking e nav
    const l1Sections = useMemo(
        () => sectionGroups.map(g => g.root),
        [sectionGroups]
    );

    // ── Analytics: product_detail_open wrapper ──────────────────────────
    const openItemDetail = useCallback(
        (item: CollectionViewSectionItem) => {
            setSelectedItem(item);
            if (mode === "public" && activityId) {
                const section = sections.find(s => s.items.some(i => i.id === item.id));
                trackEvent(activityId, "product_detail_open", {
                    product_id: item.id,
                    product_name: item.name,
                    category: section?.name,
                    price: item.effective_price ?? item.price ?? undefined
                });
            }
        },
        [mode, activityId, sections]
    );

    const addToSelection = useCallback((
        id: string,
        name: string,
        basePrice: number,
        selectedFormat?: SelectedFormat | null,
        selectedAddons?: SelectedAddon[]
    ) => {
        const addons = selectedAddons ?? [];
        const unitPrice = basePrice + addons.reduce((sum, a) => sum + a.priceDelta, 0);
        const selectionKey = generateSelectionKey(id, selectedFormat, addons);

        setSelection(prev => {
            const existingIndex = prev.findIndex(i =>
                generateSelectionKey(i.id, i.selectedFormat, i.selectedAddons ?? []) === selectionKey
            );
            const newQty = existingIndex >= 0 ? prev[existingIndex].qty + 1 : 1;
            const newCount = prev.reduce((s, i) => s + i.qty, 0) + 1;
            if (mode === "public" && activityId) {
                trackEvent(activityId, "selection_add", {
                    product_id: id,
                    product_name: name,
                    price: unitPrice,
                    base_price: basePrice,
                    format: selectedFormat?.name ?? null,
                    addons: addons.map(a => a.name),
                    qty: newQty,
                    total_selection_count: newCount
                });
            }
            if (existingIndex >= 0) {
                return prev.map((i, idx) =>
                    idx === existingIndex ? { ...i, qty: i.qty + 1 } : i
                );
            }
            return [...prev, {
                id,
                name,
                basePrice,
                qty: 1,
                selectedFormat: selectedFormat ?? null,
                selectedAddons: addons,
                unitPrice,
            }];
        });
    }, [mode, activityId]);

    const updateSelectionQty = useCallback((index: number, qty: number) => {
        setSelection(prev => prev.map((i, idx) => idx === index ? { ...i, qty } : i));
    }, []);

    const removeFromSelection = useCallback((index: number) => {
        setSelection(prev => {
            const item = prev[index];
            if (mode === "public" && activityId && item) {
                trackEvent(activityId, "selection_remove", {
                    product_id: item.id,
                    product_name: item.name
                });
            }
            return prev.filter((_, idx) => idx !== index);
        });
    }, [mode, activityId]);

    const clearSelection = useCallback(() => setSelection([]), []);

    const findProductById = useCallback((productId: string): CollectionViewSectionItem | null => {
        for (const group of sectionGroups) {
            for (const section of [group.root, ...group.children]) {
                const found = section.items.find(i => i.id === productId);
                if (found) return found;
                for (const item of section.items) {
                    if (item.variants) {
                        const variant = item.variants.find(v => v.id === productId);
                        if (variant) {
                            return {
                                id: variant.id,
                                name: variant.name,
                                parentSelected: true,
                                price: variant.price ?? null,
                                original_price: variant.original_price ?? null,
                                from_price: variant.from_price ?? null,
                                image: variant.image ?? null,
                                description: variant.description ?? null,
                                ...(variant.optionGroups?.length ? { optionGroups: variant.optionGroups } : {}),
                                ...(item.ingredients?.length ? { ingredients: item.ingredients } : {}),
                            };
                        }
                    }
                }
            }
        }
        return null;
    }, [sectionGroups]);

    const handleUpdateSelection = useCallback((
        _productId: string,
        _productName: string,
        basePrice: number,
        selectedFormat?: SelectedFormat | null,
        selectedAddons?: SelectedAddon[]
    ) => {
        if (editingSelectionIndex === null) return;
        const addons = selectedAddons ?? [];
        const unitPrice = basePrice + addons.reduce((sum, a) => sum + a.priceDelta, 0);
        setSelection(prev => prev.map((item, i) =>
            i === editingSelectionIndex
                ? { ...item, basePrice, selectedFormat: selectedFormat ?? null, selectedAddons: addons, unitPrice }
                : item
        ));
        setEditingSelectionIndex(null);
        setSelectedItem(null);
    }, [editingSelectionIndex]);

    const handleEditSelectionItem = useCallback((index: number, item: SelectionItem) => {
        const product = findProductById(item.id);
        if (!product) return;
        setEditingSelectionIndex(index);
        setSelectedItem(product);
        setIsSelectionOpen(false);
    }, [findProductById]);

    // Prodotto con optionGroups → apre il dettaglio per configurare prima di aggiungere.
    // Prodotto semplice → aggiunge direttamente.
    const handleAddClick = useCallback((
        id: string,
        name: string,
        basePrice: number,
        optionGroups: CollectionViewSectionItem["optionGroups"] | undefined,
        openDetail: () => void
    ) => {
        if ((optionGroups?.length ?? 0) > 0) {
            openDetail();
        } else {
            addToSelection(id, name, basePrice);
        }
    }, [addToSelection]);

    // ── Compact header state ────────────────────────────────────────────────
    // isCompactHeaderVisible: true = compact bar è visibile (nav deve scendere)
    // compactHeaderHeight: altezza reale del compact bar (aggiornata da ResizeObserver)
    const [isCompactHeaderVisible, setIsCompactHeaderVisible] = useState(!style.showCoverImage);
    const [compactHeaderHeight, setCompactHeaderHeight] = useState(0);
    // Ref per leggere l'altezza aggiornata nelle closure del scroll listener
    // senza dover ricreare l'effect ad ogni cambio di altezza.
    const compactHeaderHeightRef = useRef(0);
    // Ref per il compact bar in preview (renderizzato in CollectionView, non in
    // PublicCollectionHeader, per avere <main> come parent sticky — full-height).
    const previewCompactBarRef = useRef<HTMLDivElement | null>(null);
    const isProgrammaticScrollRef = useRef(false);
    const programmaticScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleCompactVisibilityChange = useCallback((visible: boolean) => {
        setIsCompactHeaderVisible(visible);
    }, []);

    const handleCompactHeightChange = useCallback((h: number) => {
        compactHeaderHeightRef.current = h;
        setCompactHeaderHeight(h);
    }, []);

    // In preview il compact bar è renderizzato qui (non in PublicCollectionHeader).
    // L'altezza è sempre 60px (fissata nel CSS). Notifichiamo una volta al mount.
    useEffect(() => {
        if (mode !== "preview" || !hasHeader) return;
        const h = 60;
        compactHeaderHeightRef.current = h;
        setCompactHeaderHeight(h);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // ── Ricalcolo scroll se compactHeaderHeight cambia durante uno scroll programmato ─
    // Quando ResizeObserver della PublicCollectionHeader triggerato e aggiorna l'altezza
    // reale del compact bar, se c'è uno scroll programmato in corso, ricalcola la
    // posizione target con i valori CORRETTI e ri-lancia lo scroll.
    useEffect(() => {
        if (!pendingScrollTargetIdRef.current || compactHeaderHeight === 0) return;

        const sectionId = pendingScrollTargetIdRef.current;
        const el = sectionRefs.current[sectionId];
        if (!el) return;

        const compactH = Math.max(compactHeaderHeightRef.current, FINAL_COMPACT_HEIGHT);
        const dynamicScrollOffset = compactH + NAV_HEIGHT + VISUAL_GAP;
        const container = containerRef.current;

        if (container === window) {
            const top = el.getBoundingClientRect().top + window.scrollY - dynamicScrollOffset;
            window.scrollTo({ top, behavior: "smooth" });
        } else {
            const containerEl = container as HTMLElement;
            const top =
                el.getBoundingClientRect().top -
                containerEl.getBoundingClientRect().top +
                containerEl.scrollTop -
                dynamicScrollOffset;
            containerEl.scrollTo({ top, behavior: "smooth" });
        }
    }, [compactHeaderHeight]);

    // ── Analytics: section_view (IntersectionObserver, una volta per sezione) ─
    const viewedSectionsRef = useRef(new Set<string>());

    useEffect(() => {
        if (mode !== "public" || !activityId) return;
        const entries = Object.entries(sectionRefs.current);
        if (entries.length === 0) return;

        const observer = new IntersectionObserver(
            (observed) => {
                for (const entry of observed) {
                    if (!entry.isIntersecting) continue;
                    const sectionId = (entry.target as HTMLElement).dataset.sectionId;
                    if (!sectionId || viewedSectionsRef.current.has(sectionId)) continue;
                    viewedSectionsRef.current.add(sectionId);
                    const section = l1Sections.find(s => s.id === sectionId);
                    const sectionIndex = l1Sections.findIndex(s => s.id === sectionId);
                    trackEvent(activityId, "section_view", {
                        section_title: section?.name,
                        section_index: sectionIndex
                    });
                }
            },
            { threshold: 0.3 }
        );

        for (const [, el] of entries) {
            if (el) observer.observe(el);
        }

        return () => observer.disconnect();
    }, [mode, activityId, l1Sections, sectionGroups]);

    // ── Valuta FAB ──────────────────────────────────────────────────────────
    const [valutaVisible, setValutaVisible] = useState(false);
    const [valutaExpanded, setValutaExpanded] = useState(false);
    // true = visitatore di ritorno entro 4h, senza review recente → FAB idoneo
    const valutaEligibleRef = useRef(false);

    // ── Keep first section active when sections load asynchronously ─────────
    useEffect(() => {
        if (!activeSectionId && sectionGroups.length > 0) {
            setActiveSectionId(sectionGroups[0].root.id);
        }
    }, [activeSectionId, sectionGroups]);

    // ── Chiudi il dettaglio prodotto al cambio di tab ────────────────────────
    useEffect(() => {
        setSelectedItem(null);
    }, [activeTab]);

    // ── Scroll a top al cambio di tab ────────────────────────────────────────
    useEffect(() => {
        if (mode === "preview") {
            if (scrollContainerEl) scrollContainerEl.scrollTop = 0;
        } else {
            window.scrollTo(0, 0);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // ── Valuta FAB: localStorage visit check + scroll 50% trigger ─────────
    // 1. Primo accesso → salva timestamp, FAB nascosto
    // 2. Ritorno entro 4h → FAB idoneo (appare dopo scroll ≥ 50%)
    // 3. Ritorno dopo 4h+ → reset timestamp, FAB nascosto
    // 4. Recensione inviata nelle ultime 24h → FAB nascosto
    useEffect(() => {
        setValutaVisible(false);
        setValutaExpanded(false);
        valutaEligibleRef.current = false;

        if (mode !== "public" || activeTab !== "menu" || !activityId) return;

        const FOUR_HOURS = 4 * 60 * 60 * 1000;
        const TWENTYFOUR_HOURS = 24 * 60 * 60 * 1000;
        const visitKey = `fab_visit_${activityId}`;
        const reviewedKey = `fab_reviewed_${activityId}`;

        try {
            const now = Date.now();
            const previousVisit = localStorage.getItem(visitKey);
            const lastReview = localStorage.getItem(reviewedKey);

            // Recensione inviata nelle ultime 24h → no FAB
            if (lastReview && (now - parseInt(lastReview, 10)) < TWENTYFOUR_HOURS) return;

            const prevTs = previousVisit ? parseInt(previousVisit, 10) : 0;
            const isReturnVisit = previousVisit && (now - prevTs) < FOUR_HOURS;

            if (!isReturnVisit) {
                // Primo accesso o sessione scaduta → salva timestamp
                localStorage.setItem(visitKey, now.toString());
                return;
            }

            // Visitatore di ritorno entro 4h, no review recente → idoneo
            valutaEligibleRef.current = true;
        } catch {
            // Safari private mode / quota exceeded — silenzioso
        }
    }, [activeTab, mode, activityId]);

    // Scroll listener: mostra FAB quando scroll ≥ 50% (solo se eligible)
    useEffect(() => {
        if (!valutaEligibleRef.current || mode !== "public" || activeTab !== "menu") return;

        const container = scrollContainerEl ?? window;
        let ticking = false;

        function onScroll() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                let scrollPercent: number;
                if (container === window) {
                    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
                    scrollPercent = scrollable > 0 ? window.scrollY / scrollable : 0;
                } else {
                    const el = container as HTMLElement;
                    const scrollable = el.scrollHeight - el.clientHeight;
                    scrollPercent = scrollable > 0 ? el.scrollTop / scrollable : 0;
                }
                if (scrollPercent >= 0.5) {
                    setValutaVisible(true);
                    // Una volta visibile, rimuovi il listener
                    container.removeEventListener("scroll", onScroll);
                }
            });
        }

        container.addEventListener("scroll", onScroll, { passive: true });
        return () => container.removeEventListener("scroll", onScroll);
    }, [activeTab, mode, scrollContainerEl]);

    // ── Main scroll effect: section tracking + scroll-to-top visibility ─────
    useEffect(() => {
        if (l1Sections.length === 0) return;

        function findScrollContainer(el: HTMLElement | null): HTMLElement | Window {
            let node = el?.parentElement ?? null;
            while (node && node !== document.body) {
                const { overflow, overflowY } = getComputedStyle(node);
                if (/auto|scroll/.test(overflow + overflowY)) return node;
                node = node.parentElement;
            }
            return window;
        }

        const container: HTMLElement | Window =
            scrollContainerEl ?? findScrollContainer(pageRef.current);

        containerRef.current = container;

        function computeActiveSection() {
            if (isProgrammaticScrollRef.current) return;
            // Offset dinamico: altezza reale compact header + nav + gap
            const dynamicStickyOffset =
                compactHeaderHeightRef.current + NAV_HEIGHT + VISUAL_GAP + 4;

            const containerTop =
                container === window ? 0 : (container as HTMLElement).getBoundingClientRect().top;

            let naturalActive = l1Sections[0].id;
            for (const section of l1Sections) {
                const el = sectionRefs.current[section.id];
                if (!el) continue;
                const sectionTop = el.getBoundingClientRect().top - containerTop;
                if (sectionTop <= dynamicStickyOffset) {
                    naturalActive = section.id;
                } else {
                    break;
                }
            }

            if (pendingScrollTargetIdRef.current !== null) {
                const targetId = pendingScrollTargetIdRef.current;
                const targetEl = sectionRefs.current[targetId];
                if (targetEl) {
                    const targetTop = targetEl.getBoundingClientRect().top - containerTop;
                    if (targetTop > dynamicStickyOffset) {
                        return;
                    }
                }
                pendingScrollTargetIdRef.current = null;
                if (safetyTimeoutRef.current !== null) {
                    clearTimeout(safetyTimeoutRef.current);
                    safetyTimeoutRef.current = null;
                }
            }

            setActiveSectionId(naturalActive);
        }

        function handleScroll() {
            computeActiveSection();
        }

        function handleScrollEnd() {
            if (isProgrammaticScrollRef.current) {
                isProgrammaticScrollRef.current = false;
                if (programmaticScrollTimeoutRef.current !== null) {
                    clearTimeout(programmaticScrollTimeoutRef.current);
                    programmaticScrollTimeoutRef.current = null;
                }
                computeActiveSection();
            }
        }

        computeActiveSection();
        container.addEventListener("scroll", handleScroll, { passive: true });
        container.addEventListener("scrollend", handleScrollEnd, { passive: true });
        return () => {
            container.removeEventListener("scroll", handleScroll);
            container.removeEventListener("scrollend", handleScrollEnd);
            if (safetyTimeoutRef.current !== null) {
                clearTimeout(safetyTimeoutRef.current);
                safetyTimeoutRef.current = null;
            }
            pendingScrollTargetIdRef.current = null;
        };
    }, [l1Sections, scrollContainerEl, mode]);

    // ── Nav items — L1 + children per dropdown sotto-sezioni ────────────────
    const navItems: SectionNavItem[] = useMemo(
        () =>
            sectionGroups.map(g => ({
                id: g.root.id,
                name: g.root.name,
                ...(g.children.length > 0
                    ? {
                          children: g.children.map(c => ({
                              id: c.id,
                              name: c.name,
                              level: c.level
                          }))
                      }
                    : {})
            })),
        [sectionGroups]
    );

    // ── Scroll to section ───────────────────────────────────────────────────
    const scrollToSection = (sectionId: string) => {
        setActiveSectionId(sectionId);
        pendingScrollTargetIdRef.current = sectionId;

        if (safetyTimeoutRef.current !== null) clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = setTimeout(() => {
            pendingScrollTargetIdRef.current = null;
            safetyTimeoutRef.current = null;
        }, 1000);

        if (programmaticScrollTimeoutRef.current !== null) clearTimeout(programmaticScrollTimeoutRef.current);
        isProgrammaticScrollRef.current = true;
        if (!('onscrollend' in window)) {
            programmaticScrollTimeoutRef.current = setTimeout(() => {
                isProgrammaticScrollRef.current = false;
                programmaticScrollTimeoutRef.current = null;
            }, 3000);
        }

        const el = sectionRefs.current[sectionId];
        if (!el) return;

        const compactH = Math.max(compactHeaderHeightRef.current, FINAL_COMPACT_HEIGHT);
        // Quando l'hero è visibile, compactSpacer è 0 ma crescerà di compactH quando
        // l'hero collassa durante lo scroll. Questo sposta el.docTop di +compactH.
        // Sottraendo compactH dall'offset si compensa esattamente questo shift:
        //   scrollY_target = el.docTop_original - NAV - GAP
        //   (el.docTop_new = el.docTop_original + compactH, offset = compactH + NAV + GAP
        //    → scrollY_target identico, posizione finale corretta)
        const dynamicScrollOffset = isCompactHeaderVisible
            ? compactH + NAV_HEIGHT + VISUAL_GAP
            : NAV_HEIGHT + VISUAL_GAP;

        const container = containerRef.current;

        if (container === window) {
            const top = el.getBoundingClientRect().top + window.scrollY - dynamicScrollOffset;
            window.scrollTo({ top, behavior: "smooth" });
        } else {
            const containerEl = container as HTMLElement;
            const top =
                el.getBoundingClientRect().top -
                containerEl.getBoundingClientRect().top +
                containerEl.scrollTop -
                dynamicScrollOffset;
            containerEl.scrollTo({ top, behavior: "smooth" });
        }
    };

    // ── Subsection margin — distanza dipende dal contesto (child precedente) ──
    const getSubsectionMarginTop = useCallback(
        (
            child: CollectionViewSection,
            prevChild: CollectionViewSection | null,
            groupHasProducts: boolean
        ): number => {
            if (!prevChild) {
                return groupHasProducts ? 24 : 14;
            }
            if (child.level === 2) {
                return 20;
            }
            if (child.level === 3) {
                if (prevChild.level === 2 && prevChild.id === child.parentCategoryId) {
                    return 12;
                }
                if (prevChild.level === 3 && prevChild.parentCategoryId === child.parentCategoryId) {
                    return 10;
                }
                return 20;
            }
            return 20;
        },
        []
    );

    // ── Breadcrumb builder — ancestors path for L2/L3 children ─────────────
    const getBreadcrumb = useCallback(
        (child: CollectionViewSection, group: CollectionViewSectionGroup): string[] => {
            if (child.level === 2) {
                return [group.root.name];
            }
            if (child.level === 3) {
                const parentL2 = group.children.find(c => c.id === child.parentCategoryId);
                return [group.root.name, parentL2?.name ?? ""].filter(Boolean);
            }
            return [];
        },
        []
    );

    // ── Scroll to sub-section (L2/L3) — solo scroll, non aggiorna nav active ─
    const scrollToSubSection = useCallback(
        (childId: string) => {
            let el = sectionRefs.current[childId];

            // Se l'elemento non esiste (sezione senza prodotti, non renderizzata),
            // cerca il primo figlio con prodotti
            if (!el) {
                const group = sectionGroups.find(g =>
                    g.children.some(c => c.id === childId)
                );
                if (group) {
                    const childrenOfTarget = group.children.filter(
                        c => c.parentCategoryId === childId && c.items.length > 0
                    );
                    if (childrenOfTarget.length > 0) {
                        el = sectionRefs.current[childrenOfTarget[0].id];
                    }
                }
            }

            if (!el) return;

            if (programmaticScrollTimeoutRef.current !== null) clearTimeout(programmaticScrollTimeoutRef.current);
            isProgrammaticScrollRef.current = true;
            if (!('onscrollend' in window)) {
                programmaticScrollTimeoutRef.current = setTimeout(() => {
                    isProgrammaticScrollRef.current = false;
                    programmaticScrollTimeoutRef.current = null;
                }, 3000);
            }

            const compactH = Math.max(compactHeaderHeightRef.current, FINAL_COMPACT_HEIGHT);
            const dynamicScrollOffset = isCompactHeaderVisible
                ? compactH + NAV_HEIGHT + VISUAL_GAP
                : NAV_HEIGHT + VISUAL_GAP;
            const container = containerRef.current;

            if (container === window) {
                const top = el.getBoundingClientRect().top + window.scrollY - dynamicScrollOffset;
                window.scrollTo({ top, behavior: "smooth" });
            } else {
                const containerEl = container as HTMLElement;
                const top =
                    el.getBoundingClientRect().top -
                    containerEl.getBoundingClientRect().top +
                    containerEl.scrollTop -
                    dynamicScrollOffset;
                containerEl.scrollTo({ top, behavior: "smooth" });
            }
        },
        [sectionGroups, isCompactHeaderVisible]
    );

    // ── Derived values for render ───────────────────────────────────────────
    const hasHeader =
        style.showLogo || style.showCoverImage || style.showActivityName || style.showCatalogName;

    // ── renderSectionGrid — grid condivisa per L1, L2, L3 ───────────────────
    function renderSectionGrid(s: CollectionViewSection) {
        if (s.items.length === 0) return null;
        return (
            <div className={styles.grid} role="list">
                {s.items.map(item => {
                    const isDisabled = item.is_disabled === true;
                    return (
                        <article
                            key={item.id}
                            id={`product-${item.id}`}
                            role="listitem"
                            className={
                                style.productStyle === "compact"
                                    ? `${styles.compactItem}${isDisabled ? ` ${styles.disabledCard}` : ""}`
                                    : `${styles.card}${isDisabled ? ` ${styles.disabledCard}` : ""}`
                            }
                        >
                            {isDisabled && style.productStyle !== "compact" && (
                                <span className={styles.unavailableBadge}>
                                    Non disponibile
                                </span>
                            )}
                            {/* Case A/B: parent row — only if parentSelected */}
                            {item.parentSelected &&
                                (style.productStyle === "compact" ? (
                                    <ProductCompactRow
                                        name={item.name}
                                        fromPrice={item.from_price}
                                        price={item.price}
                                        effectivePrice={item.effective_price}
                                        originalPrice={item.original_price}
                                        description={item.description}
                                        onClick={() => openItemDetail(item)}
                                        allergens={item.allergens}
                                        onAddToSelection={
                                            activeTab === "menu"
                                                ? () => handleAddClick(
                                                      item.id,
                                                      item.name,
                                                      item.effective_price ?? item.price ?? 0,
                                                      item.optionGroups,
                                                      () => openItemDetail(item)
                                                  )
                                                : undefined
                                        }
                                        selectionQty={selectionMap[item.id]}
                                    />
                                ) : (
                                    <ProductRow
                                        name={item.name}
                                        fromPrice={item.from_price}
                                        price={item.price}
                                        effectivePrice={item.effective_price}
                                        originalPrice={item.original_price}
                                        description={item.description}
                                        image={item.image}
                                        showImage={style.cardTemplate !== "no-image"}
                                        imageRight={style.cardTemplate === "right"}
                                        mode={mode}
                                        onClick={() => openItemDetail(item)}
                                        optionGroups={item.optionGroups}
                                        attributes={item.attributes}
                                        allergens={item.allergens}
                                        onAddToSelection={
                                            activeTab === "menu"
                                                ? () => handleAddClick(
                                                      item.id,
                                                      item.name,
                                                      item.effective_price ?? item.price ?? 0,
                                                      item.optionGroups,
                                                      () => openItemDetail(item)
                                                  )
                                                : undefined
                                        }
                                        selectionQty={selectionMap[item.id]}
                                    />
                                ))}

                            {/* Divider + variants */}
                            {(item.variants?.length ?? 0) > 0 && (
                                <>
                                    <div className={styles.variantsDivider}>
                                        {item.parentSelected && (
                                            <span className={styles.variantsLabel}>
                                                Varianti
                                            </span>
                                        )}
                                    </div>

                                    {item.variants!.map(v =>
                                        style.productStyle === "compact" ? (
                                            <ProductCompactRow
                                                key={v.id}
                                                name={v.name}
                                                price={v.price}
                                                originalPrice={v.original_price}
                                                fromPrice={v.from_price}
                                                description={v.description}
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    openItemDetail({
                                                        id: v.id,
                                                        name: v.name,
                                                        parentSelected: true,
                                                        price: v.price ?? null,
                                                        original_price: v.original_price ?? null,
                                                        from_price: v.from_price ?? null,
                                                        image: v.image ?? null,
                                                        description: v.description ?? null,
                                                        ...(v.optionGroups && v.optionGroups.length > 0
                                                            ? { optionGroups: v.optionGroups }
                                                            : {}),
                                                        ...(item.ingredients && item.ingredients.length > 0
                                                            ? { ingredients: item.ingredients }
                                                            : {})
                                                    });
                                                }}
                                                onAddToSelection={
                                                    activeTab === "menu"
                                                        ? () => handleAddClick(
                                                              v.id,
                                                              v.name,
                                                              v.price ?? 0,
                                                              v.optionGroups,
                                                              () => openItemDetail({
                                                                  id: v.id,
                                                                  name: v.name,
                                                                  parentSelected: true,
                                                                  price: v.price ?? null,
                                                                  original_price: v.original_price ?? null,
                                                                  from_price: v.from_price ?? null,
                                                                  image: v.image ?? null,
                                                                  description: v.description ?? null,
                                                                  ...(v.optionGroups && v.optionGroups.length > 0
                                                                      ? { optionGroups: v.optionGroups }
                                                                      : {}),
                                                                  ...(item.ingredients && item.ingredients.length > 0
                                                                      ? { ingredients: item.ingredients }
                                                                      : {})
                                                              })
                                                          )
                                                        : undefined
                                                }
                                                selectionQty={selectionMap[v.id]}
                                            />
                                        ) : (
                                            <ProductRow
                                                key={v.id}
                                                name={v.name}
                                                price={v.price}
                                                originalPrice={v.original_price}
                                                fromPrice={v.from_price}
                                                description={v.description}
                                                image={v.image}
                                                showImage={style.cardTemplate !== "no-image"}
                                                imageRight={style.cardTemplate === "right"}
                                                mode={mode}
                                                optionGroups={v.optionGroups}
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    openItemDetail({
                                                        id: v.id,
                                                        name: v.name,
                                                        parentSelected: true,
                                                        price: v.price ?? null,
                                                        original_price: v.original_price ?? null,
                                                        from_price: v.from_price ?? null,
                                                        image: v.image ?? null,
                                                        description: v.description ?? null,
                                                        ...(v.optionGroups && v.optionGroups.length > 0
                                                            ? { optionGroups: v.optionGroups }
                                                            : {}),
                                                        ...(item.ingredients && item.ingredients.length > 0
                                                            ? { ingredients: item.ingredients }
                                                            : {})
                                                    });
                                                }}
                                                onAddToSelection={
                                                    activeTab === "menu"
                                                        ? () => handleAddClick(
                                                              v.id,
                                                              v.name,
                                                              v.price ?? 0,
                                                              v.optionGroups,
                                                              () => openItemDetail({
                                                                  id: v.id,
                                                                  name: v.name,
                                                                  parentSelected: true,
                                                                  price: v.price ?? null,
                                                                  original_price: v.original_price ?? null,
                                                                  from_price: v.from_price ?? null,
                                                                  image: v.image ?? null,
                                                                  description: v.description ?? null,
                                                                  ...(v.optionGroups && v.optionGroups.length > 0
                                                                      ? { optionGroups: v.optionGroups }
                                                                      : {}),
                                                                  ...(item.ingredients && item.ingredients.length > 0
                                                                      ? { ingredients: item.ingredients }
                                                                      : {})
                                                              })
                                                          )
                                                        : undefined
                                                }
                                                selectionQty={selectionMap[v.id]}
                                            />
                                        )
                                    )}
                                </>
                            )}
                        </article>
                    );
                })}
            </div>
        );
    }

    return (
        <main className={styles.page} ref={pageRef}>
            {/* Skip link (solo public) */}
            {mode === "public" && (
                <a className={styles.skipLink} href={`#${contentId}`}>
                    <Text variant="caption">Salta al contenuto</Text>
                </a>
            )}

            {/* ── HEADER: sostituisce PublicBrandHeader + CollectionHero ── */}
            {hasHeader && (
                <PublicCollectionHeader
                    logoUrl={tenantLogoUrl}
                    activityName={businessName}
                    activityAddress={activityAddress}
                    catalogName={collectionTitle}
                    showCatalogName={style.showCatalogName}
                    coverImageUrl={businessImage}
                    showCoverImage={style.showCoverImage}
                    showLogo={style.showLogo}
                    mode={mode}
                    onSearchOpen={mode !== "preview" ? handleOpenSearch : undefined}
                    onCompactVisibilityChange={handleCompactVisibilityChange}
                    onCompactHeightChange={handleCompactHeightChange}
                    scrollContainerEl={scrollContainerEl}
                    activeTab={activeTab}
                    onTabChange={onTabChange ?? (() => {})}
                    hasInfo={hasAnyInfo}
                    onInfoPress={() => setIsInfoSheetOpen(true)}
                />
            )}

            {/* ── PREVIEW COMPACT HEADER ──────────────────────────────────────────
                Renderizzato come figlio diretto di <main> (full-height) anziché
                dentro PublicCollectionHeader (.root = solo hero height ~220px).
                Con parent <main>, il sticky anchor non viene mai "rilasciato"
                e il compact bar resta fisso per tutta la durata dello scroll. */}
            {mode === "preview" && hasHeader && (
                <div className={styles.previewHdrAnchor}>
                    <div
                        className={[
                            styles.previewHdrBar,
                            isCompactHeaderVisible ? styles.previewHdrBarVisible : ""
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        ref={previewCompactBarRef}
                    >
                        <div className={styles.previewHdrInner}>
                            {style.showLogo &&
                                (tenantLogoUrl ? (
                                    <div className={styles.previewHdrLogoWrapper}>
                                        <img
                                            src={tenantLogoUrl}
                                            alt={`Logo ${businessName}`}
                                            className={styles.previewHdrLogo}
                                        />
                                    </div>
                                ) : (
                                    <div className={styles.previewHdrLogoPlaceholder} />
                                ))}
                            <span className={styles.previewHdrName}>{businessName}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SEARCH OVERLAY — nascosta in preview ── */}
            {mode !== "preview" && (
                <SearchOverlay
                    isOpen={isSearchOpen}
                    onClose={handleCloseSearch}
                    sections={sections}
                    scrollContainerEl={scrollContainerEl}
                    mode={mode}
                    activityId={activityId}
                />
            )}

            {/* ── INFO SHEET ── */}
            {hasAnyInfo && (
                <PublicSheet
                    isOpen={isInfoSheetOpen}
                    onClose={() => setIsInfoSheetOpen(false)}
                    ariaLabel="Informazioni sede"
                >
                    <div className={styles.infoSheetContent}>
                        <h2 className={styles.infoSheetTitle}>Informazioni</h2>

                        {hasHours && (
                            <div className={styles.infoSection}>
                                <h3 className={styles.infoSectionHeader}>Orari di apertura</h3>
                                <PublicOpeningHours
                                    openingHours={openingHours ?? []}
                                    upcomingClosures={upcomingClosures}
                                    showHeading={false}
                                />
                            </div>
                        )}

                        {hasPaymentMethods && (
                            <div className={styles.infoSection}>
                                <h3 className={styles.infoSectionHeader}>Metodi di pagamento</h3>
                                <div className={styles.tagList}>
                                    {paymentMethods!.map(m => (
                                        <span key={m} className={styles.tag}>{m}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {hasActivityServices && (
                            <div className={styles.infoSection}>
                                <h3 className={styles.infoSectionHeader}>Servizi</h3>
                                <div className={styles.tagList}>
                                    {activityServices!.map(s => (
                                        <span key={s} className={styles.tag}>{s}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {hasContacts && (
                            <div className={styles.infoSection}>
                                <h3 className={styles.infoSectionHeader}>Contatti</h3>
                                <div className={styles.contactList}>
                                    {socialLinks?.phone_public && socialLinks?.phone && (
                                        <a href={`tel:${socialLinks.phone}`} className={styles.contactRow}>
                                            <Phone size={14} strokeWidth={2} />
                                            <span>{socialLinks.phone}</span>
                                        </a>
                                    )}
                                    {socialLinks?.email_public_visible && socialLinks?.email_public && (
                                        <a href={`mailto:${socialLinks.email_public}`} className={styles.contactRow}>
                                            <Mail size={14} strokeWidth={2} />
                                            <span>{socialLinks.email_public}</span>
                                        </a>
                                    )}
                                    {socialLinks?.website_public && socialLinks?.website && (
                                        <a
                                            href={socialLinks.website}
                                            className={styles.contactRow}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Globe size={14} strokeWidth={2} />
                                            <span>{socialLinks.website.replace(/^https?:\/\//, "")}</span>
                                        </a>
                                    )}
                                    {socialLinks?.instagram_public && socialLinks?.instagram && (
                                        <a
                                            href={`https://instagram.com/${socialLinks.instagram}`}
                                            className={styles.contactRow}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Instagram size={14} strokeWidth={2} />
                                            <span>@{socialLinks.instagram}</span>
                                        </a>
                                    )}
                                    {socialLinks?.facebook_public && socialLinks?.facebook && (
                                        <a
                                            href={socialLinks.facebook}
                                            className={styles.contactRow}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Facebook size={14} strokeWidth={2} />
                                            <span>Facebook</span>
                                        </a>
                                    )}
                                    {socialLinks?.whatsapp_public && socialLinks?.whatsapp && (
                                        <a
                                            href={`https://wa.me/${socialLinks.whatsapp.replace(/\D/g, "")}`}
                                            className={styles.contactRow}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <MessageCircle size={14} strokeWidth={2} />
                                            <span>WhatsApp</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {activityAddress && (
                            <div className={styles.infoSection}>
                                <h3 className={styles.infoSectionHeader}>Indirizzo</h3>
                                <div className={styles.contactRow}>
                                    <MapPin size={14} strokeWidth={2} />
                                    <span className={styles.addressText}>{activityAddress}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </PublicSheet>
            )}

            {/* Spacer in-flow che compensa il compact header fixed (solo public).
                Usa CSS transition per evitare layout jump durante l'animazione slide-in. */}
            {mode === "public" && (
                <div
                    aria-hidden
                    className={styles.compactSpacer}
                    style={{ height: isCompactHeaderVisible ? compactHeaderHeight : 0 }}
                />
            )}

            {activeTab === "menu" && (
                <>
                    {/* ── NAV – sticky, topOffset dinamico ── */}
                    {!emptyState && (
                        <CollectionSectionNav
                            sections={navItems}
                            activeSectionId={activeSectionId}
                            onSelect={scrollToSection}
                            onChildSelect={scrollToSubSection}
                            variant={mode === "public" ? "public" : "preview"}
                            style={{
                                shape: style.sectionNavShape,
                                navStyle: style.sectionNavStyle
                            }}
                            topOffset={isCompactHeaderVisible ? compactHeaderHeight : 0}
                        />
                    )}

                    {/* ── FRAME – contenuto centrato e max-width responsivo ── */}
                    <div className={styles.frame}>
                        {emptyState ? (
                            <div className={styles.emptyState}>
                                {emptyState.title && (
                                    <Text as="h2" variant="title-sm" weight={700} color="var(--pub-bg-text)">
                                        {emptyState.title}
                                    </Text>
                                )}
                                {emptyState.description && (
                                    <Text variant="body" color="var(--pub-bg-text-muted)">
                                        {emptyState.description}
                                    </Text>
                                )}
                            </div>
                        ) : (
                            <>
                                <div
                                    id={contentId}
                                    className={styles.container}
                                    data-card-layout={style.cardLayout ?? "list"}
                                >
                                    {featuredBeforeCatalogSlot}
                                    {sectionGroups.map(group => (
                                        <section
                                            key={group.root.id}
                                            data-section-id={group.root.id}
                                            ref={el => {
                                                sectionRefs.current[group.root.id] = el;
                                            }}
                                            className={styles.sectionGroup}
                                            aria-label={group.root.name}
                                        >
                                            <Text as="h2" variant="title-sm" weight={700} color="var(--pub-bg-text)">
                                                {group.root.name}
                                            </Text>

                                            {renderSectionGrid(group.root)}

                                            {(() => {
                                                let prevRendered: CollectionViewSection | null = null;
                                                const groupHasProducts = group.root.items.length > 0;
                                                return group.children.map(child => {
                                                    // Skip sezioni senza prodotti — i figli portano il nome nel breadcrumb
                                                    if (child.items.length === 0) return null;

                                                    const breadcrumb = getBreadcrumb(child, group);
                                                    const marginTop = getSubsectionMarginTop(
                                                        child,
                                                        prevRendered,
                                                        groupHasProducts
                                                    );
                                                    prevRendered = child;

                                                    return (
                                                        <div
                                                            key={child.id}
                                                            className={styles.subsection}
                                                            style={{ marginTop }}
                                                            ref={el => {
                                                                sectionRefs.current[child.id] = el;
                                                            }}
                                                        >
                                                        {breadcrumb.length > 0 && (
                                                            <div className={styles.breadcrumb}>
                                                                {breadcrumb.map((crumb, i) => (
                                                                    <span key={i}>
                                                                        <span className={styles.breadcrumbText}>
                                                                            {crumb}
                                                                        </span>
                                                                        <span className={styles.breadcrumbSeparator}>
                                                                            ›
                                                                        </span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <h3
                                                            className={
                                                                child.level === 2
                                                                    ? styles.sectionTitleL2
                                                                    : styles.sectionTitleL3
                                                            }
                                                        >
                                                            {child.name}
                                                        </h3>
                                                        {renderSectionGrid(child)}
                                                    </div>
                                                );
                                                });
                                            })()}
                                        </section>
                                    ))}
                                </div>

                                <ItemDetail
                                    item={selectedItem}
                                    isOpen={!!selectedItem}
                                    onClose={() => {
                                        setSelectedItem(null);
                                        setEditingSelectionIndex(null);
                                    }}
                                    mode={mode}
                                    showImage={style.cardTemplate !== "no-image"}
                                    onAddToSelection={mode === "public" && activeTab === "menu"
                                        ? (editingSelectionIndex !== null
                                            ? handleUpdateSelection
                                            : (productId, productName, basePrice, format, addons) => {
                                                addToSelection(productId, productName, basePrice, format, addons);
                                                setSelectedItem(null);
                                            })
                                        : undefined
                                    }
                                    initialFormat={editingSelectionIndex !== null
                                        ? selection[editingSelectionIndex]?.selectedFormat
                                        : undefined
                                    }
                                    initialAddons={editingSelectionIndex !== null
                                        ? selection[editingSelectionIndex]?.selectedAddons
                                        : undefined
                                    }
                                    submitLabel={editingSelectionIndex !== null ? "Aggiorna selezione" : undefined}
                                />

                                <SelectionSheet
                                    isOpen={isSelectionOpen}
                                    onClose={() => setIsSelectionOpen(false)}
                                    items={selection}
                                    onUpdateQty={updateSelectionQty}
                                    onRemove={removeFromSelection}
                                    onClear={clearSelection}
                                    onEditItem={mode === "public" && activeTab === "menu"
                                        ? handleEditSelectionItem
                                        : undefined
                                    }
                                />

                                {featuredAfterCatalogSlot}
                            </>
                        )}
                    </div>

                    {/* ── FOOTER — in preview solo branding/legal, niente dati sede ── */}
                    {!emptyState && (
                        <PublicFooter
                            socialLinks={mode !== "preview" ? socialLinks : undefined}
                            activityId={mode !== "preview" ? activityId : undefined}
                            openingHours={mode !== "preview" ? openingHours : undefined}
                            upcomingClosures={mode !== "preview" ? upcomingClosures : undefined}
                        />
                    )}
                </>
            )}

            {activeTab === "events" && (
                <div className={styles.frame}>
                    <EventsView featuredContents={featuredContents} layout={style?.featuredStyle} />
                </div>
            )}

            {activeTab === "reviews" && reviewsProps && (
                <ReviewsView
                    {...reviewsProps}
                    onReviewSubmitted={() => {
                        // Nascondi FAB e salva timestamp per sopprimerlo per 24h
                        setValutaVisible(false);
                        valutaEligibleRef.current = false;
                        if (activityId) {
                            try {
                                localStorage.setItem(`fab_reviewed_${activityId}`, Date.now().toString());
                            } catch { /* Safari private mode */ }
                        }
                    }}
                />
            )}

            {/* ── FAB SELEZIONE — solo public, solo tab menu, quando c'è almeno 1 elemento ── */}
            {mode === "public" && activeTab === "menu" && selectionCount > 0 && (
                <button
                    type="button"
                    className={styles.selectionFab}
                    style={{ bottom: `calc(20px + env(safe-area-inset-bottom, 0px))` }}
                    onClick={() => {
                        setIsSelectionOpen(true);
                        if (activityId) {
                            const totalPrice = selection.reduce((s, i) => s + i.unitPrice * i.qty, 0);
                            trackEvent(activityId, "selection_sheet_open", {
                                item_count: selectionCount,
                                estimated_total: totalPrice
                            });
                        }
                    }}
                    aria-label={`La mia selezione, ${selectionCount} elementi`}
                >
                    La mia selezione
                    <span className={styles.selectionFabBadge}>{selectionCount}</span>
                </button>
            )}

            {/* ── VALUTA FAB — slide-in dopo 3s, solo public + tab menu ── */}
            {mode === "public" && activeTab === "menu" && (
                <button
                    type="button"
                    className={[
                        styles.valutaFab,
                        valutaVisible ? styles.valutaFabVisible : "",
                        valutaExpanded ? styles.valutaFabExpanded : ""
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    style={{ bottom: `calc(20px + env(safe-area-inset-bottom, 0px))` }}
                    onClick={() => {
                        if (!valutaExpanded) {
                            setValutaExpanded(true);
                        } else {
                            onTabChange?.("reviews");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                        }
                    }}
                    aria-label="Com'è andata?"
                >
                    <MessageSquareHeart size={20} /><span className={styles.valutaFabText}>{"Com'è andata?"}</span>
                </button>
            )}
        </main>
    );
}
