import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Facebook, Globe, Instagram, Mail, MapPin, MessageCircle, MessageSquareHeart, Package, Phone, Plus, Search } from "lucide-react";
import type {
    ResolvedAllergen,
    ResolvedCharacteristic,
    ResolvedIngredient,
    ResolvedProductNote,
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
import { PublicFeeRows } from "../PublicFooter/PublicFees";
import CollectionSectionNav from "../CollectionSectionNav/CollectionSectionNav";
import type { CollectionStyle } from "@/types/collectionStyle";
import styles from "./CollectionView.module.scss";
import { useFabCollapse } from "../hooks/useFabCollapse";
import EventsView from "../EventsView/EventsView";
import PublicBottomBar from "../PublicBottomBar/PublicBottomBar";
import type { SelectionItem, SelectedFormat, SelectedAddon } from "../OrderingSheet/OrderingSheet";
import type { ReviewsViewProps } from "../ReviewsView/ReviewsView";

// Lazy-loaded: si aprono solo su interazione utente
const SearchOverlay = lazy(() => import("../SearchOverlay/SearchOverlay"));
const ItemDetail = lazy(() => import("../ItemDetail/ItemDetail"));
const OrderingSheet = lazy(() => import("../OrderingSheet/OrderingSheet"));
const ReviewsView = lazy(() => import("../ReviewsView/ReviewsView"));
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import AllergensSheet from "../AllergensSheet/AllergensSheet";
import MoreSheet from "../MoreSheet/MoreSheet";
import {
    getAllergenPreferences,
    setAllergenPreferences,
} from "@/services/customer/allergenPreferences";
import CharacteristicIcon from "@/components/ui/CharacteristicIcon/CharacteristicIcon";
import type { OpeningHoursEntry, UpcomingClosure } from "../PublicOpeningHours/PublicOpeningHours";
import type { ActivityFee } from "@/types/activity";
import type { Allergen } from "@/services/supabase/allergens";
import PublicSheet from "../PublicSheet/PublicSheet";
import PublicOpeningHours from "../PublicOpeningHours/PublicOpeningHours";
import { submitOrder, getOrdersForSession } from "@/services/supabase/orders";
import { subscribeToCustomerSession } from "@/services/supabase/customerSessions";
import { useOptionalCustomerSession } from "@/context/CustomerSession/CustomerSessionContext";
import type { OrderItemRequest, SubmitOrderResult, OrderingStateReason } from "@/types/orders";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ClipboardList, AlertCircle } from "lucide-react";
const OrderConfirmationSheet = lazy(() => import("../OrderConfirmationSheet/OrderConfirmationSheet"));

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
    if ("unitPrice" in item) {
        // Legacy shape with `unitPrice` but no `note` field — backfill null.
        const legacy = item as unknown as SelectionItem & { note?: string | null };
        return { ...legacy, note: legacy.note ?? null };
    }
    const price = typeof item.price === "number" ? item.price : 0;
    return {
        id: item.id as string,
        name: item.name as string,
        basePrice: price,
        qty: typeof item.qty === "number" ? item.qty : 1,
        selectedFormat: null,
        selectedAddons: [],
        unitPrice: price,
        note: null,
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
    characteristics?: ResolvedCharacteristic[];
    ingredients?: ResolvedIngredient[];
    notes?: ResolvedProductNote[];
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

// Build a synthetic CollectionViewSectionItem for a variant. Variants inherit
// allergens, characteristics, ingredients and notes from the parent so the
// detail sheet and analytics see the same metadata. Stable identity is
// guaranteed by variantItemsCache upstream so React.memo on the row works.
function buildVariantItem(
    parent: CollectionViewSectionItem,
    variant: NonNullable<CollectionViewSectionItem["variants"]>[number]
): CollectionViewSectionItem {
    return {
        id: variant.id,
        name: variant.name,
        parentSelected: true,
        price: variant.price ?? null,
        original_price: variant.original_price ?? null,
        from_price: variant.from_price ?? null,
        image: variant.image ?? null,
        description: variant.description ?? null,
        ...(variant.optionGroups && variant.optionGroups.length > 0
            ? { optionGroups: variant.optionGroups }
            : {}),
        ...(parent.characteristics && parent.characteristics.length > 0
            ? { characteristics: parent.characteristics }
            : {}),
        ...(parent.allergens && parent.allergens.length > 0
            ? { allergens: parent.allergens }
            : {}),
        ...(parent.ingredients && parent.ingredients.length > 0
            ? { ingredients: parent.ingredients }
            : {}),
        ...(parent.notes && parent.notes.length > 0
            ? { notes: parent.notes }
            : {})
    };
}

// ─── ProductRow — shared layout for parent products and variants ──────────────

type ProductRowProps = {
    item: CollectionViewSectionItem;
    showImage: boolean;
    imageRight?: boolean;
    cardLayout?: "list" | "grid";
    mode: "public" | "preview";
    onClick: (item: CollectionViewSectionItem) => void;
    onAdd: (item: CollectionViewSectionItem) => void;
    orderingEnabled: boolean;
    selectionQty?: number;
};

function ProductRowInner({
    item,
    showImage,
    imageRight = false,
    cardLayout = "list",
    mode,
    onClick,
    onAdd,
    orderingEnabled,
    selectionQty = 0
}: ProductRowProps) {
    const {
        name,
        from_price: fromPrice,
        price,
        effective_price: effectivePrice,
        original_price: originalPrice,
        description,
        image,
        optionGroups,
        allergens,
        characteristics
    } = item;
    const { t } = useTranslation("public");
    const hasAllergens = (allergens?.length ?? 0) > 0;
    const MAX_ALLERGEN_EMOJIS = 6;
    const visibleAllergens = hasAllergens ? allergens!.slice(0, MAX_ALLERGEN_EMOJIS) : [];
    const hiddenCount = hasAllergens ? Math.max(0, allergens!.length - MAX_ALLERGEN_EMOJIS) : 0;
    const MAX_CHARACTERISTIC_EMOJIS = 6;
    const cardCharacteristics = characteristics ?? [];
    const hasCardCharacteristics = cardCharacteristics.length > 0;
    const visibleCharacteristics = cardCharacteristics.slice(0, MAX_CHARACTERISTIC_EMOJIS);
    const hiddenCharacteristicCount = Math.max(
        0,
        cardCharacteristics.length - MAX_CHARACTERISTIC_EMOJIS
    );
    const dp = getDisplayPrice({ fromPrice, price, effectivePrice, originalPrice });

    // ── Fade-in immagine prodotto ─────────────────────────────────────────
    const [imgLoaded, setImgLoaded] = useState(false);
    useEffect(() => { setImgLoaded(false); }, [image]);

    const handleRootClick = () => onClick(item);
    const handleAddBtnClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onAdd(item);
    };

    return (
        <div
            className={`${styles.productRow} ${imageRight ? styles.productRowImageRight : ""}`}
            onClick={handleRootClick}
        >
            {showImage && (
                <div className={styles.rowImageWrapper}>
                    {mode === "preview" || !image ? (
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
                            decoding="async"
                            width={400}
                            height={300}
                            onLoad={() => setImgLoaded(true)}
                        />
                    )}
                    {cardLayout === "grid" && orderingEnabled && (
                        <button
                            type="button"
                            className={[styles.addBtnOverlay, selectionQty > 0 ? styles.addBtnOverlayActive : ""]
                                .filter(Boolean)
                                .join(" ")}
                            onClick={handleAddBtnClick}
                            aria-label={t("selection.add_aria")}
                        >
                            <Plus size={16} strokeWidth={2.5} />
                            {selectionQty > 0 && <span className={styles.addBtnBadge}>{selectionQty}</span>}
                        </button>
                    )}
                </div>
            )}
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
                {hasCardCharacteristics && (
                    <div className={styles.characteristicEmojis}>
                        {visibleCharacteristics.map(c => (
                            <span key={c.id} className={styles.characteristicEmoji}>
                                <CharacteristicIcon
                                    icon={c.icon}
                                    size={20}
                                    label={c.label}
                                />
                            </span>
                        ))}
                        {hiddenCharacteristicCount > 0 && (
                            <span className={styles.characteristicMore}>
                                +{hiddenCharacteristicCount}
                            </span>
                        )}
                    </div>
                )}
                {hasAllergens && (
                    <div className={styles.allergenEmojis}>
                        {visibleAllergens.map(a => (
                            <span key={a.id} className={styles.allergenEmoji}>
                                <AllergenIcon code={a.code} size={20} label={a.label} />
                            </span>
                        ))}
                        {hiddenCount > 0 && (
                            <span className={styles.allergenMore}>+{hiddenCount}</span>
                        )}
                    </div>
                )}
            </div>
            {(cardLayout !== "grid" || !showImage) && orderingEnabled && (
                <button
                    type="button"
                    className={[styles.addBtn, selectionQty > 0 ? styles.addBtnActive : ""]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={handleAddBtnClick}
                    aria-label={t("selection.add_aria")}
                >
                    <Plus size={16} strokeWidth={2.5} />
                    {selectionQty > 0 && <span className={styles.addBtnBadge}>{selectionQty}</span>}
                </button>
            )}
        </div>
    );
}

const ProductRow = memo(ProductRowInner);

// ─── ProductCompactRow — text-only compact-style product row ─────────────────

type ProductCompactRowProps = {
    item: CollectionViewSectionItem;
    onClick: (item: CollectionViewSectionItem) => void;
    onAdd: (item: CollectionViewSectionItem) => void;
    orderingEnabled: boolean;
    selectionQty?: number;
};

function ProductCompactRowInner({
    item,
    onClick,
    onAdd,
    orderingEnabled,
    selectionQty = 0
}: ProductCompactRowProps) {
    const {
        name,
        from_price: fromPrice,
        price,
        effective_price: effectivePrice,
        original_price: originalPrice,
        description,
        allergens,
        characteristics
    } = item;
    const { t } = useTranslation("public");
    const hasAllergens = (allergens?.length ?? 0) > 0;
    const MAX_ALLERGEN_ICONS = 6;
    const visibleAllergens = hasAllergens ? allergens!.slice(0, MAX_ALLERGEN_ICONS) : [];
    const hiddenCount = hasAllergens ? Math.max(0, allergens!.length - MAX_ALLERGEN_ICONS) : 0;
    const MAX_CHARACTERISTIC_EMOJIS = 6;
    const cardCharacteristics = characteristics ?? [];
    const hasCardCharacteristics = cardCharacteristics.length > 0;
    const visibleCharacteristics = cardCharacteristics.slice(0, MAX_CHARACTERISTIC_EMOJIS);
    const hiddenCharacteristicCount = Math.max(
        0,
        cardCharacteristics.length - MAX_CHARACTERISTIC_EMOJIS
    );
    const dp = getDisplayPrice({ fromPrice, price, effectivePrice, originalPrice });

    const handleRootClick = () => onClick(item);
    const handleAddBtnClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onAdd(item);
    };

    return (
        <div className={styles.compactRow} onClick={handleRootClick}>
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
                    {orderingEnabled && (
                        <button
                            type="button"
                            className={[styles.addBtnOutline, selectionQty > 0 ? styles.addBtnOutlineActive : ""]
                                .filter(Boolean)
                                .join(" ")}
                            onClick={handleAddBtnClick}
                            aria-label={t("selection.add_aria")}
                        >
                            <Plus size={14} strokeWidth={2.5} />
                            {selectionQty > 0 && <span className={styles.addBtnBadge}>{selectionQty}</span>}
                        </button>
                    )}
                </div>
                {description && <span className={styles.compactDescription}>{description}</span>}
                {hasCardCharacteristics && (
                    <div className={styles.compactCharacteristics}>
                        {visibleCharacteristics.map(c => (
                            <span key={c.id} className={styles.characteristicEmoji}>
                                <CharacteristicIcon
                                    icon={c.icon}
                                    size={16}
                                    label={c.label}
                                />
                            </span>
                        ))}
                        {hiddenCharacteristicCount > 0 && (
                            <span className={styles.characteristicMore}>
                                +{hiddenCharacteristicCount}
                            </span>
                        )}
                    </div>
                )}
                {hasAllergens && (
                    <div className={styles.compactAllergens}>
                        {visibleAllergens.map(a => (
                            <span key={a.id} className={styles.allergenEmoji}>
                                <AllergenIcon code={a.code} size={16} label={a.label} />
                            </span>
                        ))}
                        {hiddenCount > 0 && (
                            <span className={styles.allergenMore}>+{hiddenCount}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

const ProductCompactRow = memo(ProductCompactRowInner);

// ─── Hub tab views ────────────────────────────────────────────────────────────

// ─── Scroll-offset constants ─────────────────────────────────────────────────
// Header is always sticky; use desktop height (116px) as conservative estimate.
// Mobile header is 108px — the 8px difference is negligible for scroll offsets.
const HEADER_HEIGHT = 116;
const NAV_HEIGHT = 67;
const VISUAL_GAP = 8;
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

// ── Bottom nav bar pubblica (feature flag d'ambiente, mobile-only) ──────────
// Costanti locali esplicite per evitare drift (no sorgente condivisa esistente).
const BREAKPOINT_MOBILE = 640; // ≤640px = mobile: la barra sostituisce tab header + FAB
// Z_BOTTOM_BAR = 150 vive nello SCSS della barra (PublicBottomBar.module.scss); qui
// solo per documentazione: sopra FAB (55/60), sotto toast/search (200) e sheet (900).
// Flag globale d'ambiente (build-time): ON su tutte le attività dove acceso, nessun tocco DB.
// Rollback = VITE_PUBLIC_BOTTOM_BAR=false/rimosso + redeploy.
const PUBLIC_BOTTOM_BAR = import.meta.env.VITE_PUBLIC_BOTTOM_BAR === "true";

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
    /** Elemento di riferimento per misurare la larghezza viewport nella preview.
     *  Forwarded a PublicCollectionHeader. Non passato in public → fallback a window. */
    viewportWidthEl?: HTMLElement | null;
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
    /** Slug della sede pubblica. Quando presente abilita la navigazione a
     *  /:slug/prenota dal MoreSheet (se anche enableReservations === true). */
    slug?: string;
    /** Quando true, il MoreSheet espone la voce "Prenota un tavolo". */
    enableReservations?: boolean;
    /** Metodi di pagamento accettati (visibili se non vuoti). */
    paymentMethods?: string[];
    /** Servizi offerti dalla sede (visibili se non vuoti). */
    activityServices?: string[];
    /** Tariffe della sede (visibili se non vuote). */
    fees?: ActivityFee[];
    /** Lista allergeni UE (visibile nel footer solo per tenant food-related). */
    allergens?: Allergen[] | null;
    /**
     * Caratteristiche effettivamente presenti nel catalogo (union dei prodotti
     * visibili). Pre-ordinate per `sort_order`. Renderizzate nel footer come
     * legenda "Caratteristiche". Lista vuota → bottone footer nascosto.
     */
    catalogCharacteristics?: ResolvedCharacteristic[];
    /**
     * True quando una sessione customer è attiva (scan QR completato).
     * Per ora SOLO accettata nella signature; non consumata internamente.
     * Verrà utilizzata nei prompt successivi per:
     * - mostrare CTA "Invia ordine" nel SelectionSheet
     * - mostrare tab "I miei ordini" nell'hub
     * - mostrare badge tavolo nell'header
     */
    orderingActive?: boolean;
    /**
     * Quando definito: la pagina viene resa in modalita read-only per
     * ordering (banner sticky + submit disabilitato). Reason proviene da
     * URL param `?maintenance=<reason>` su QR-scan flow oppure da catch
     * lato submit-order (423 ORDERING_UNAVAILABLE).
     *
     * Reason rilevanti per catalog read-only:
     *   - "ordering_disabled":  ristoratore ha sospeso ordini QR sulla sede
     *   - "table_maintenance":  tavolo singolo in manutenzione
     */
    orderingMaintenance?: {
        reason: OrderingStateReason;
        message: string;
    } | null;
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
    viewportWidthEl,
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
    activityServices,
    fees,
    allergens,
    catalogCharacteristics,
    orderingActive = false,
    orderingMaintenance = null,
    slug,
    enableReservations = false
}: Props) {
    const navigate = useNavigate();

    // ── Bottom nav bar pubblica: flag d'ambiente globale + viewport mobile ──────
    // GUARDRAIL flag OFF → diff runtime ZERO: il matchMedia listener viene attaccato
    // SOLO quando il flag è acceso. Flag spento ⇒ effetto esce subito, nessun listener,
    // isMobile resta false ⇒ comportamento identico a oggi (FAB + tab header).
    const bottomBarFlag = mode === "public" && PUBLIC_BOTTOM_BAR;
    // Init sincrono (no flash del FAB al primo paint per i tenant con barra attiva).
    // Lettura matchMedia in render = nessun listener; il listener arriva dall'effect sotto.
    const [isMobileViewport, setIsMobileViewport] = useState(
        () =>
            bottomBarFlag &&
            typeof window !== "undefined" &&
            !!window.matchMedia &&
            window.matchMedia(`(max-width: ${BREAKPOINT_MOBILE}px)`).matches
    );
    useEffect(() => {
        if (!bottomBarFlag || typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia(`(max-width: ${BREAKPOINT_MOBILE}px)`);
        const update = () => setIsMobileViewport(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, [bottomBarFlag]);
    const useBottomBar = bottomBarFlag && isMobileViewport;
    // Maintenance scoperto runtime via 423 ORDERING_UNAVAILABLE su submit
    // (Strict + Reactive: il cliente lo apprende solo al tentativo). Solo
    // OrderingSheet usa effectiveMaintenance per banner inline + submit
    // disable; il banner sticky CollectionView resta legato al prop esterno
    // (URL param / resolve-table response).
    const [discoveredMaintenance, setDiscoveredMaintenance] = useState<
        { reason: OrderingStateReason; message: string } | null
    >(null);
    const effectiveMaintenance = orderingMaintenance ?? discoveredMaintenance;

    // Reason "silenziosi": ordering_disabled = feature non disponibile per il
    // cliente (no banner, no FAB). Altri reason "rumorosi" (table_maintenance,
    // table_closed) mostrano comunque banner sticky + nascondono FAB.
    const SILENT_MAINTENANCE_REASONS = new Set<OrderingStateReason>([
        "ordering_disabled"
    ]);
    // Per ItemDetail: disabled visibile (NON nascosto) quando reason non e' silent.
    const itemDetailOrderingDisabled =
        effectiveMaintenance != null &&
        !SILENT_MAINTENANCE_REASONS.has(effectiveMaintenance.reason);
    const shouldShowStickyBanner =
        effectiveMaintenance != null &&
        !SILENT_MAINTENANCE_REASONS.has(effectiveMaintenance.reason);
    // Nascondi entry point ordering (FAB) per:
    //   - URL-param maintenance (table_maintenance)
    //   - Cliente entrato via /:slug diretto senza sessione QR (no
    //     orderingActive): ordering QR e' by-design tied a sessione tavolo
    //     da resolve-table — niente sessione = niente entry point.
    // Discovery runtime NON rimuove il FAB (cliente ha gia visto la
    // selection, banner inline su submit fail e' sufficiente).
    // Gate `mode === "public"` per preservare preview dashboard
    // (orderingActive=false in preview e' default, non significa "no session").
    const shouldHideOrderingEntry =
        orderingMaintenance != null || (mode === "public" && !orderingActive);
    // Gate per "+" buttons su ProductRow / ProductCompactRow / ItemDetail:
    // include discovery runtime (rispetto a shouldHideOrderingEntry) per
    // coerenza con OrderingSheet submit gating + no-session hide.
    const orderingEntryHidden =
        effectiveMaintenance != null || (mode === "public" && !orderingActive);
    const { t } = useTranslation("public");
    const [activeSectionId, setActiveSectionId] = useState<string | null>(
        () => sectionGroups[0]?.root.id ?? null
    );
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const pageRef = useRef<HTMLElement | null>(null);
    // SSR: window non esiste server-side → null iniziale. Client-side parte da
    // window (identico a prima) e l'effect di scroll-detection lo rimpiazza col
    // container reale; i consumer (scroll handler, solo client) hanno null-guard.
    const containerRef = useRef<HTMLElement | Window | null>(
        typeof window === "undefined" ? null : window
    );
    const pendingScrollTargetIdRef = useRef<string | null>(null);
    const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [selectedItem, setSelectedItem] = useState<CollectionViewSectionItem | null>(null);
    // openSeq: incrementato ad ogni openItemDetail. Forza re-render anche quando
    // l'utente riapre lo STESSO item (React altrimenti bailoutta il setState con
    // identica reference). Propagato in contentKey verso PublicSheet → l'abort
    // di close-interruption scatta uniformemente, A→A incluso.
    const [openSeq, setOpenSeq] = useState(0);

    // ── Search overlay ──────────────────────────────────────────────────────
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const handleOpenSearch = useCallback(() => setIsSearchOpen(true), []);
    const handleCloseSearch = useCallback(() => setIsSearchOpen(false), []);

    // Cmd+F (Mac) / Ctrl+F (Win/Linux) apre la ricerca interna invece della find del browser
    useEffect(() => {
        if (mode === "preview") return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const isFindShortcut =
                (e.metaKey || e.ctrlKey) &&
                !e.shiftKey &&
                !e.altKey &&
                e.key.toLowerCase() === "f";

            if (!isFindShortcut) return;
            if (isSearchOpen) return;

            e.preventDefault();
            handleOpenSearch();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [mode, isSearchOpen, handleOpenSearch]);

    // ── Info sheet ──────────────────────────────────────────────────────────
    const [isInfoSheetOpen, setIsInfoSheetOpen] = useState(false);
    const hasHours = (openingHours?.length ?? 0) > 0;
    const hasFees = (fees?.length ?? 0) > 0;
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
    const hasAnyInfo = hasHours || hasFees || hasPaymentMethods || hasActivityServices || hasContacts || !!activityAddress;

    // ── More sheet ──────────────────────────────────────────────────────────
    const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);

    // ── Allergen filter (customer-side, sessionStorage per-activity) ────────
    const [allergenFilterIds, setAllergenFilterIds] = useState<number[]>(() =>
        activityId && mode === "public" ? getAllergenPreferences(activityId) : []
    );
    const [isAllergensFilterOpen, setIsAllergensFilterOpen] = useState(false);

    useEffect(() => {
        if (!activityId || mode !== "public") return;
        setAllergenPreferences(activityId, allergenFilterIds);
    }, [activityId, mode, allergenFilterIds]);

    // Union degli allergens presenti nel catalogo corrente (dedup per id,
    // sorted by label localizzata). Riusa ResolvedAllergen.label già tradotto
    // dall'edge function resolve-public-catalog.
    const allergensInCatalog = useMemo<ResolvedAllergen[]>(() => {
        const seen = new Map<number, ResolvedAllergen>();
        for (const group of sectionGroups) {
            const all = [group.root, ...group.children];
            for (const section of all) {
                for (const item of section.items) {
                    if (!item.allergens) continue;
                    for (const a of item.allergens) {
                        if (!seen.has(a.id)) seen.set(a.id, a);
                    }
                }
            }
        }
        return Array.from(seen.values()).sort((a, b) =>
            a.label.localeCompare(b.label, "it")
        );
    }, [sectionGroups]);

    // Filtra item per allergens. Prodotti senza allergens taggati: sempre
    // visibili (no match possibile, disclaimer nel sheet copre il caso).
    const displaySectionGroups = useMemo<CollectionViewSectionGroup[]>(() => {
        if (allergenFilterIds.length === 0) return sectionGroups;
        const blocked = new Set(allergenFilterIds);
        const filterItems = (items: CollectionViewSectionItem[]) =>
            items.filter(item => {
                if (!item.allergens || item.allergens.length === 0) return true;
                return !item.allergens.some(a => blocked.has(a.id));
            });
        const result: CollectionViewSectionGroup[] = [];
        for (const group of sectionGroups) {
            const rootItems = filterItems(group.root.items);
            const children = group.children
                .map(c => ({ ...c, items: filterItems(c.items) }))
                .filter(c => c.items.length > 0);
            if (rootItems.length === 0 && children.length === 0) continue;
            result.push({
                root: { ...group.root, items: rootItems },
                children,
            });
        }
        return result;
    }, [sectionGroups, allergenFilterIds]);

    const allFiltered =
        allergenFilterIds.length > 0 && displaySectionGroups.length === 0;

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
    const [isOrderingOpen, setIsOrderingOpen] = useState(false);
    const [activeOrderingTab, setActiveOrderingTab] = useState<"cart" | "orders">("cart");
    const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
    const [editingSelectionIndex, setEditingSelectionIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!selectionStorageKey) return;
        try {
            sessionStorage.setItem(selectionStorageKey, JSON.stringify(selection));
        } catch { /* sessionStorage non disponibile */ }
    }, [selection, selectionStorageKey]);

    const selectionCount = useMemo(() => selection.reduce((s, i) => s + i.qty, 0), [selection]);

    // FAB collapse: si comprimono dopo timer (3s) o scroll (100px), indipendentemente
    const isSelectionVisible = mode === "public" && activeTab === "menu" && selectionCount > 0;
    const isSelectionCollapsed = useFabCollapse(isSelectionVisible);

    // Map id → total qty per lookups O(1) nel render (somma tutte le configurazioni)
    const selectionMap = useMemo(() => {
        const map: Record<string, number> = {};
        selection.forEach(s => {
            map[s.id] = (map[s.id] ?? 0) + s.qty;
        });
        return map;
    }, [selection]);

    // Pre-baked synthetic variant items. Stable identity per parent+variant pair
    // across renders, so React.memo on the row sees the same `item` reference
    // until displaySectionGroups itself changes.
    const variantItemsCache = useMemo(() => {
        const map = new Map<string, CollectionViewSectionItem>();
        for (const group of displaySectionGroups) {
            for (const section of [group.root, ...group.children]) {
                for (const item of section.items) {
                    if (!item.variants || item.variants.length === 0) continue;
                    for (const v of item.variants) {
                        map.set(`${item.id}__${v.id}`, buildVariantItem(item, v));
                    }
                }
            }
        }
        return map;
    }, [displaySectionGroups]);

    const orderingEnabled = useMemo(
        () => activeTab === "menu" && !orderingEntryHidden,
        [activeTab, orderingEntryHidden]
    );

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
            setOpenSeq(s => s + 1);
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
                note: null,
            }];
        });
    }, [mode, activityId]);

    const updateSelectionNote = useCallback((index: number, value: string | null) => {
        setSelection(prev => prev.map((i, idx) => (idx === index ? { ...i, note: value } : i)));
    }, []);

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

    const [orderNote, setOrderNote] = useState<string | null>(null);

    const clearSelection = useCallback(() => {
        setSelection([]);
        setOrderNote(null);
    }, []);

    // ── Customer session + submit order ─────────────────────────────────────
    const customerSession = useOptionalCustomerSession();
    const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
    const [submitFeedback, setSubmitFeedback] = useState<
        | { type: "success"; orderId: string }
        | { type: "error"; message: string }
        | null
    >(null);
    const [confirmedOrder, setConfirmedOrder] = useState<SubmitOrderResult | null>(null);
    const [confirmedOrderNote, setConfirmedOrderNote] = useState<string | null>(null);
    const [hasOrdersInSession, setHasOrdersInSession] = useState(false);

    const handleSessionExpired = useCallback(() => {
        setIsOrderingOpen(false);
        setSubmitFeedback({
            type: "error",
            message: "La sessione è scaduta. Scansiona di nuovo il QR.",
        });
    }, []);

    // Bill state — single source of truth a livello CollectionView per
    // garantire che la subscription customer_sessions sia always-on
    // (OrderingSheet e' montato solo a sheet aperta).
    const [billRequestedAt, setBillRequestedAt] = useState<string | null>(null);

    // Realtime subscribe customer_sessions: single channel always-on quando
    // JWT presente. Propaga:
    //   - bill_requested_at (admin "Risposto" / close-table clear implicit)
    //   - expires_at <= now() → maintenance "table_closed" (close_table_with_resolution v2)
    // RLS server-side filtra eventi alla sola sessione customer corrente.
    const customerSessionClear = customerSession?.clear;
    useEffect(() => {
        const jwt = customerSession?.session?.jwt;
        if (!jwt) return;

        let channel: RealtimeChannel | null = null;
        channel = subscribeToCustomerSession(jwt, {
            onUpdate: updatedSession => {
                setBillRequestedAt(updatedSession.bill_requested_at ?? null);
                const expiresAt = updatedSession.expires_at;
                if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
                    // Idempotente: setta solo se nessun maintenance gia attivo.
                    setDiscoveredMaintenance(prev => prev ?? {
                        reason: "table_closed",
                        message:
                            "Il servizio a questo tavolo è terminato. Per ordinare, chiedi al personale o riscansiona il codice QR."
                    });
                }
            },
            onError: err => {
                const msg = err.message.toLowerCase();
                if (msg.includes("token") || msg.includes("jwt") || msg.includes("auth")) {
                    customerSessionClear?.();
                }
            }
        });

        return () => {
            channel?.unsubscribe();
        };
    }, [customerSession?.session?.jwt, customerSessionClear]);

    const openOrdering = useCallback(() => {
        setActiveOrderingTab(selectionCount > 0 ? "cart" : "orders");
        setIsOrderingOpen(true);
    }, [selectionCount]);

    // Check session orders presenza al mount / cambio session
    useEffect(() => {
        const jwt = customerSession?.session?.jwt;
        if (!orderingActive || !jwt) {
            setHasOrdersInSession(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const result = await getOrdersForSession(jwt);
                if (!cancelled) setHasOrdersInSession(result.orders.length > 0);
            } catch {
                if (!cancelled) setHasOrdersInSession(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [orderingActive, customerSession?.session?.jwt]);

    useEffect(() => {
        if (!submitFeedback) return;
        const tm = setTimeout(() => setSubmitFeedback(null), 5000);
        return () => clearTimeout(tm);
    }, [submitFeedback]);

    const handleSubmitOrder = useCallback(async () => {
        if (!customerSession?.session) {
            setSubmitFeedback({
                type: "error",
                message: "Sessione non disponibile. Scansiona di nuovo il QR."
            });
            return;
        }
        if (selection.length === 0) return;

        setIsSubmittingOrder(true);
        setSubmitFeedback(null);

        try {
            const items: OrderItemRequest[] = selection.flatMap(it => {
                const baseQty = it.qty;
                if (baseQty <= 0) return [];
                const trimmedNote = it.note?.trim().replace(/\s+/g, " ");
                const entry: OrderItemRequest = {
                    product_id: it.id,
                    quantity: baseQty,
                    ...(it.selectedFormat?.id
                        ? { primary_option_value_id: it.selectedFormat.id }
                        : {}),
                    ...(it.selectedAddons && it.selectedAddons.length > 0
                        ? { addon_value_ids: it.selectedAddons.map(a => a.id) }
                        : {}),
                    ...(trimmedNote ? { item_notes: trimmedNote } : {})
                };
                return [entry];
            });

            const trimmedOrderNote = orderNote?.trim().replace(/\s+/g, " ");
            const notesArg = trimmedOrderNote && trimmedOrderNote.length > 0
                ? trimmedOrderNote
                : undefined;

            const result = await submitOrder(
                customerSession.session.jwt,
                items,
                notesArg
            );

            clearSelection();
            setOrderNote(null);
            setIsOrderingOpen(false);
            setActiveOrderingTab("orders");
            setOrdersRefreshKey(k => k + 1);
            setConfirmedOrder(result);
            setConfirmedOrderNote(notesArg ?? null);
            setHasOrdersInSession(true);
        } catch (err) {
            if (err instanceof Error) {
                const msg = err.message;
                const code = (err as Error & { code?: string }).code;
                const reason = (err as Error & { reason?: string }).reason as
                    | OrderingStateReason
                    | undefined;
                if (code === "ORDERING_UNAVAILABLE") {
                    // Propaga maintenance scoperta a OrderingSheet via prop
                    // (banner inline + submit disabled). NIENTE toast: il
                    // banner inline copre la UX dentro la modale.
                    setDiscoveredMaintenance({
                        reason: reason ?? "ordering_disabled",
                        message: msg
                    });
                } else if (msg.toLowerCase().includes("scaduta") || msg === "SESSION_EXPIRED") {
                    customerSession.clear();
                    setSubmitFeedback({
                        type: "error",
                        message: "La sessione è scaduta. Scansiona di nuovo il QR del tavolo."
                    });
                } else if (msg === "INVALID_ITEMS") {
                    setSubmitFeedback({
                        type: "error",
                        message: "Alcuni prodotti non sono più disponibili. Ricontrolla la selezione."
                    });
                } else if (msg === "EMPTY_CART") {
                    setSubmitFeedback({
                        type: "error",
                        message: "Aggiungi almeno un prodotto prima di inviare l'ordine."
                    });
                } else {
                    setSubmitFeedback({ type: "error", message: msg });
                }
            } else {
                setSubmitFeedback({
                    type: "error",
                    message: "Errore durante l'invio dell'ordine. Riprova."
                });
            }
        } finally {
            setIsSubmittingOrder(false);
        }
    }, [customerSession, selection, orderNote, clearSelection]);

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
                                ...(item.characteristics?.length
                                    ? { characteristics: item.characteristics }
                                    : {}),
                                ...(item.allergens?.length ? { allergens: item.allergens } : {}),
                                ...(item.ingredients?.length ? { ingredients: item.ingredients } : {}),
                                ...(item.notes?.length ? { notes: item.notes } : {}),
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
        setIsOrderingOpen(false);
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

    // Stable row handlers. Both rows (parent and variant) receive a synthetic
    // CollectionViewSectionItem and route through these two callbacks. Stable
    // identity preserves React.memo on the row.
    const handleRowClick = useCallback(
        (item: CollectionViewSectionItem) => openItemDetail(item),
        [openItemDetail]
    );
    const handleRowAdd = useCallback(
        (item: CollectionViewSectionItem) => handleAddClick(
            item.id,
            item.name,
            item.effective_price ?? item.price ?? 0,
            item.optionGroups,
            () => openItemDetail(item)
        ),
        [handleAddClick, openItemDetail]
    );

    const isProgrammaticScrollRef = useRef(false);
    const programmaticScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // true = visitatore di ritorno entro 4h, senza review recente → FAB idoneo
    const valutaEligibleRef = useRef(false);
    const isValutaCollapsed = useFabCollapse(valutaVisible);

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
                if (scrollPercent >= 0.7) {
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
            const dynamicStickyOffset = HEADER_HEIGHT + NAV_HEIGHT + VISUAL_GAP + 4;

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
    // Derivati da displaySectionGroups: il filtro allergeni nasconde anche le
    // voci di navigazione delle sezioni completamente filtrate.
    const navItems: SectionNavItem[] = useMemo(
        () =>
            displaySectionGroups.map(g => ({
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
        [displaySectionGroups]
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

        const scrollOffset = HEADER_HEIGHT + NAV_HEIGHT + VISUAL_GAP;
        const container = containerRef.current;
        if (!container) return;

        if (container === window) {
            const top = el.getBoundingClientRect().top + window.scrollY - scrollOffset;
            window.scrollTo({ top, behavior: "smooth" });
        } else {
            const containerEl = container as HTMLElement;
            const top =
                el.getBoundingClientRect().top -
                containerEl.getBoundingClientRect().top +
                containerEl.scrollTop -
                scrollOffset;
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

            const scrollOffset = HEADER_HEIGHT + NAV_HEIGHT + VISUAL_GAP;
            const container = containerRef.current;
            if (!container) return;

            if (container === window) {
                const top = el.getBoundingClientRect().top + window.scrollY - scrollOffset;
                window.scrollTo({ top, behavior: "smooth" });
            } else {
                const containerEl = container as HTMLElement;
                const top =
                    el.getBoundingClientRect().top -
                    containerEl.getBoundingClientRect().top +
                    containerEl.scrollTop -
                    scrollOffset;
                containerEl.scrollTo({ top, behavior: "smooth" });
            }
        },
        [sectionGroups]
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
                                        item={item}
                                        onClick={handleRowClick}
                                        onAdd={handleRowAdd}
                                        orderingEnabled={orderingEnabled}
                                        selectionQty={selectionMap[item.id]}
                                    />
                                ) : (
                                    <ProductRow
                                        item={item}
                                        showImage={style.cardTemplate !== "no-image"}
                                        imageRight={style.cardTemplate === "right"}
                                        cardLayout={style.cardLayout ?? "list"}
                                        mode={mode}
                                        onClick={handleRowClick}
                                        onAdd={handleRowAdd}
                                        orderingEnabled={orderingEnabled}
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

                                    {item.variants!.map(v => {
                                        const variantItem = variantItemsCache.get(`${item.id}__${v.id}`);
                                        if (!variantItem) return null;
                                        return style.productStyle === "compact" ? (
                                            <ProductCompactRow
                                                key={v.id}
                                                item={variantItem}
                                                onClick={handleRowClick}
                                                onAdd={handleRowAdd}
                                                orderingEnabled={orderingEnabled}
                                                selectionQty={selectionMap[v.id]}
                                            />
                                        ) : (
                                            <ProductRow
                                                key={v.id}
                                                item={variantItem}
                                                showImage={style.cardTemplate !== "no-image"}
                                                imageRight={style.cardTemplate === "right"}
                                                cardLayout={style.cardLayout ?? "list"}
                                                mode={mode}
                                                onClick={handleRowClick}
                                                onAdd={handleRowAdd}
                                                orderingEnabled={orderingEnabled}
                                                selectionQty={selectionMap[v.id]}
                                            />
                                        );
                                    })}
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
                    <Text variant="caption">{t("skip_to_content")}</Text>
                </a>
            )}

            {/* Maintenance banner: ordering sospeso o tavolo in manutenzione.
                Soppresso per reason silenziosi (es. ordering_disabled = feature
                non disponibile per il cliente). */}
            {shouldShowStickyBanner && effectiveMaintenance && (
                <div
                    className={styles.maintenanceBanner}
                    role="status"
                    aria-live="polite"
                >
                    <AlertCircle size={14} aria-hidden="true" />
                    <span>{effectiveMaintenance.message}</span>
                </div>
            )}

            {/* ── HEADER: sostituisce PublicBrandHeader + CollectionHero ── */}
            {hasHeader && (
                <PublicCollectionHeader
                    logoUrl={tenantLogoUrl}
                    activityName={businessName}
                    activityAddress={activityAddress}
                    showAddress={style.showAddress ?? false}
                    catalogName={collectionTitle}
                    showCatalogName={style.showCatalogName}
                    coverImageUrl={businessImage}
                    showCoverImage={style.showCoverImage}
                    showLogo={style.showLogo}
                    mode={mode}
                    onSearchOpen={mode !== "preview" ? handleOpenSearch : undefined}
                    scrollContainerEl={scrollContainerEl}
                    viewportWidthEl={viewportWidthEl}
                    headerRadius={style.appearanceRadius}
                    activeTab={activeTab}
                    onTabChange={onTabChange ?? (() => {})}
                    showHubTabs={!useBottomBar}
                    allergensCount={allergenFilterIds.length}
                    onOpenMore={mode === "public" ? () => setIsMoreSheetOpen(true) : undefined}
                />
            )}

            {/* ── SEARCH OVERLAY — nascosta in preview, lazy al primo click ── */}
            {mode !== "preview" && (
                <AnimatePresence>
                    {isSearchOpen && (
                        <Suspense fallback={null}>
                            <SearchOverlay
                                isOpen={isSearchOpen}
                                onClose={handleCloseSearch}
                                sections={sections}
                                scrollContainerEl={scrollContainerEl}
                                mode={mode}
                                activityId={activityId}
                            />
                        </Suspense>
                    )}
                </AnimatePresence>
            )}

            {/* ── INFO SHEET ── */}
            {hasAnyInfo && (
                <PublicSheet
                    isOpen={isInfoSheetOpen}
                    onClose={() => setIsInfoSheetOpen(false)}
                    ariaLabel={t("header.info_sheet_aria")}
                >
                    <div className={styles.infoSheetContent}>
                        <h2 className={styles.infoSheetTitle}>{t("info.title")}</h2>

                        {hasHours && (
                            <div className={styles.infoSection}>
                                <h3 className={styles.infoSectionHeader}>{t("opening_hours.title")}</h3>
                                <PublicOpeningHours
                                    openingHours={openingHours ?? []}
                                    upcomingClosures={upcomingClosures}
                                    showHeading={false}
                                    surface="surface"
                                />
                            </div>
                        )}

                        {hasFees && (
                            <div className={styles.infoSection}>
                                <h3 className={styles.infoSectionHeader}>{t("info.fees")}</h3>
                                <PublicFeeRows fees={fees!} surface="surface" />
                            </div>
                        )}

                        {hasPaymentMethods && (
                            <div className={styles.infoSection}>
                                <h3 className={styles.infoSectionHeader}>{t("info.payment_methods")}</h3>
                                <div className={styles.tagList}>
                                    {paymentMethods!.map(m => (
                                        <span key={m} className={styles.tag}>{m}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {hasActivityServices && (
                            <div className={styles.infoSection}>
                                <h3 className={styles.infoSectionHeader}>{t("info.services")}</h3>
                                <div className={styles.tagList}>
                                    {activityServices!.map(s => (
                                        <span key={s} className={styles.tag}>{s}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {hasContacts && (
                            <div className={styles.infoSection}>
                                <h3 className={styles.infoSectionHeader}>{t("info.contacts")}</h3>
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
                                <h3 className={styles.infoSectionHeader}>{t("info.address")}</h3>
                                <div className={styles.contactRow}>
                                    <MapPin size={14} strokeWidth={2} />
                                    <span className={styles.addressText}>{activityAddress}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </PublicSheet>
            )}

            {activeTab === "menu" && (
                <>
                    {/* ── NAV – sticky, topOffset dinamico ── */}
                    {!emptyState && !allFiltered && (
                        <CollectionSectionNav
                            sections={navItems}
                            activeSectionId={activeSectionId}
                            onSelect={scrollToSection}
                            onChildSelect={scrollToSubSection}
                            variant={mode === "public" ? "public" : "preview"}
                            style={{
                                navStyle: style.sectionNavStyle
                            }}
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
                                    data-product-style={style.productStyle ?? "card"}
                                >
                                    {featuredBeforeCatalogSlot}
                                    {allFiltered && (
                                        <div className={styles.allergenEmptyState}>
                                            <Text variant="body" color="var(--pub-bg-text)">
                                                {t("allergens.filter_no_results")}
                                            </Text>
                                            <button
                                                type="button"
                                                onClick={() => setIsAllergensFilterOpen(true)}
                                                className={styles.allergenEmptyBtn}
                                            >
                                                {t("allergens.filter_edit_cta")}
                                            </button>
                                        </div>
                                    )}
                                    {displaySectionGroups.map(group => (
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
                                    {featuredAfterCatalogSlot}
                                </div>

                                {!!selectedItem && (
                                    <Suspense fallback={null}>
                                        <ItemDetail
                                            item={selectedItem}
                                            openSeq={openSeq}
                                            isOpen={!!selectedItem}
                                            onClose={() => {
                                                setSelectedItem(null);
                                                setEditingSelectionIndex(null);
                                            }}
                                            mode={mode}
                                            showImage={style.productStyle !== "compact" && style.cardTemplate !== "no-image"}
                                            orderingDisabled={itemDetailOrderingDisabled}
                                            onAddToSelection={
                                                mode === "public" &&
                                                activeTab === "menu" &&
                                                (orderingActive || itemDetailOrderingDisabled) &&
                                                !(effectiveMaintenance != null && SILENT_MAINTENANCE_REASONS.has(effectiveMaintenance.reason))
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
                                            submitLabel={editingSelectionIndex !== null ? t("selection.update_label") : undefined}
                                        />
                                    </Suspense>
                                )}


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
                            fees={mode !== "preview" ? fees : undefined}
                            paymentMethods={mode !== "preview" ? paymentMethods : undefined}
                            services={mode !== "preview" ? activityServices : undefined}
                            allergens={mode !== "preview" ? allergens : null}
                            characteristics={mode !== "preview" ? catalogCharacteristics : undefined}
                        />
                    )}
                </>
            )}

            {activeTab === "events" && (
                // Bottom-bar mode: niente CollectionSectionNav qui. Il contenuto sta sulla STESSA
                // superficie a pattern del Menu (.tabPatternSurface, full-bleed + z-index) che taglia
                // l'hero al bordo basso dell'header. Padding-top piccolo, niente fascia crema piatta.
                <div className={useBottomBar ? styles.tabPatternSurface : undefined}>
                    <div className={styles.frame}>
                        <EventsView featuredContents={featuredContents} layout={style?.featuredStyle} />
                    </div>
                </div>
            )}

            {activeTab === "reviews" && reviewsProps && (
                <Suspense fallback={null}>
                    {/* Stesso meccanismo di Eventi: superficie a pattern che taglia l'hero. */}
                    <div className={useBottomBar ? styles.tabPatternSurface : undefined}>
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
                    </div>
                </Suspense>
            )}

            {/* ── ORDERING FAB — unico, context-aware (cart o ordini) ── */}
            {/* Nascosto quando la bottom nav bar è attiva (flag ON + mobile): il carrello vive nella barra. */}
            {!useBottomBar && mode === "public" && activeTab === "menu" && !shouldHideOrderingEntry && (selectionCount > 0 || (orderingActive && hasOrdersInSession)) && (
                <button
                    type="button"
                    className={styles.orderingFab}
                    style={{ bottom: `calc(20px + env(safe-area-inset-bottom, 0px))` }}
                    data-collapsed={isSelectionCollapsed}
                    onClick={() => {
                        openOrdering();
                        if (activityId && selectionCount > 0) {
                            const totalPrice = selection.reduce((s, i) => s + i.unitPrice * i.qty, 0);
                            trackEvent(activityId, "selection_sheet_open", {
                                item_count: selectionCount,
                                estimated_total: totalPrice
                            });
                        }
                    }}
                    aria-label="Il tuo ordine"
                >
                    <ClipboardList className={styles.orderingFabIcon} size={20} />
                    <span className={styles.orderingFabLabel}>Il tuo ordine</span>
                    {selectionCount > 0 && (
                        <span className={styles.orderingFabBadge}>{selectionCount}</span>
                    )}
                </button>
            )}

            {/* ── VALUTA FAB — slide-in dopo 3s, solo public + tab menu ── */}
            {/* Nascosto con la bottom nav bar attiva: il reminder diventa un dot sull'icona recensioni. */}
            {!useBottomBar && mode === "public" && activeTab === "menu" && (
                <button
                    type="button"
                    className={[
                        styles.valutaFab,
                        valutaVisible ? styles.valutaFabVisible : ""
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    style={{ bottom: `calc(20px + env(safe-area-inset-bottom, 0px))` }}
                    data-collapsed={isValutaCollapsed}
                    onClick={() => {
                        onTabChange?.("reviews");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    aria-label={t("fab.review_aria")}
                >
                    <MessageSquareHeart size={20} /><span className={styles.valutaFabText}>{t("fab.review_label")}</span>
                </button>
            )}

            {/* ── BOTTOM NAV BAR pubblica — flag ON + mobile. Sostituisce tab header + FAB. ── */}
            {/* reviewDot riusa `valutaVisible` (stessa eligibilità 4h + scroll≥70% + no review <24h). */}
            {useBottomBar && (
                <PublicBottomBar
                    activeTab={activeTab}
                    onTabChange={tab => onTabChange?.(tab)}
                    selectionCount={selectionCount}
                    cartVisible={!shouldHideOrderingEntry}
                    onOpenCart={openOrdering}
                    reviewDot={valutaVisible}
                    onReviewDotDismiss={() => {
                        setValutaVisible(false);
                        valutaEligibleRef.current = false;
                    }}
                />
            )}

            {submitFeedback && (
                <div
                    className={
                        submitFeedback.type === "success"
                            ? styles.submitFeedbackSuccess
                            : styles.submitFeedbackError
                    }
                    // Con la bottom bar attiva il toast condivide l'ancora a 16px: lo
                    // solleviamo sopra la barra (altezza ~58px + gap) così non la copre.
                    style={
                        useBottomBar
                            ? { bottom: "calc(16px + 58px + 12px + env(safe-area-inset-bottom, 0px))" }
                            : undefined
                    }
                    role="status"
                    aria-live="polite"
                >
                    {submitFeedback.type === "success"
                        ? "Ordine inviato! Lo staff lo prenderà in carico."
                        : submitFeedback.message}
                </div>
            )}

            {confirmedOrder !== null && (
                <Suspense fallback={null}>
                    <OrderConfirmationSheet
                        isOpen={confirmedOrder !== null}
                        order={confirmedOrder}
                        orderNote={confirmedOrderNote}
                        onClose={() => {
                            setConfirmedOrder(null);
                            setConfirmedOrderNote(null);
                        }}
                        onViewMyOrders={() => {
                            setConfirmedOrder(null);
                            setConfirmedOrderNote(null);
                            setActiveOrderingTab("orders");
                            setIsOrderingOpen(true);
                        }}
                    />
                </Suspense>
            )}

            {mode === "public" && (
                <MoreSheet
                    isOpen={isMoreSheetOpen}
                    onClose={() => setIsMoreSheetOpen(false)}
                    onOpenAllergens={() => setIsAllergensFilterOpen(true)}
                    onOpenInfo={() => setIsInfoSheetOpen(true)}
                    onOpenReservation={
                        enableReservations && slug
                            ? () => navigate(`/${slug}/prenota`)
                            : undefined
                    }
                    allergensCount={allergenFilterIds.length}
                    hasAllergensInCatalog={allergensInCatalog.length > 0}
                    hasInfo={hasAnyInfo}
                />
            )}

            {mode === "public" && (
                <AllergensSheet
                    mode="filter"
                    isOpen={isAllergensFilterOpen}
                    onClose={() => setIsAllergensFilterOpen(false)}
                    allergens={allergensInCatalog}
                    selectedIds={allergenFilterIds}
                    onApplyFilter={setAllergenFilterIds}
                />
            )}

            {isOrderingOpen && (
                <Suspense fallback={null}>
                    <OrderingSheet
                        isOpen={isOrderingOpen}
                        onClose={() => setIsOrderingOpen(false)}
                        activeTab={activeOrderingTab}
                        onTabChange={setActiveOrderingTab}
                        items={selection}
                        onUpdateQty={updateSelectionQty}
                        onRemove={removeFromSelection}
                        onClear={clearSelection}
                        onEditItem={mode === "public" && activeTab === "menu"
                            ? handleEditSelectionItem
                            : undefined
                        }
                        onItemNoteSave={
                            orderingActive
                                ? (index, note) => updateSelectionNote(index, note)
                                : undefined
                        }
                        onItemNoteRemove={
                            orderingActive
                                ? index => updateSelectionNote(index, null)
                                : undefined
                        }
                        orderNote={orderingActive ? orderNote : null}
                        onOrderNoteSave={orderingActive ? setOrderNote : undefined}
                        onOrderNoteRemove={
                            orderingActive ? () => setOrderNote(null) : undefined
                        }
                        orderingActive={orderingActive && !shouldHideOrderingEntry}
                        onSubmitOrder={
                            orderingActive && !shouldHideOrderingEntry
                                ? handleSubmitOrder
                                : undefined
                        }
                        isSubmitting={isSubmittingOrder}
                        maintenance={effectiveMaintenance}
                        billRequestedAt={billRequestedAt}
                        onBillRequestedAtChange={setBillRequestedAt}
                        onSessionExpired={handleSessionExpired}
                        ordersRefreshKey={ordersRefreshKey}
                    />
                </Suspense>
            )}
        </main>
    );
}
