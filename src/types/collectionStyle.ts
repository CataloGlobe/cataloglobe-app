export type HubTab = "menu" | "events" | "reviews" | "storia";

export type CardTemplate = "left" | "right" | "no-image";
export type SectionNavStyle = "filled" | "outline" | "tabs" | "minimal" | "tinted";
export type CardLayout = "grid" | "list";
export type ProductStyle = "card" | "compact";
export type CardTreatment = "raised" | "bordered" | "glass";
export type IconStyle = "plain" | "pill";
export type CompactLayoutStyle = "editorial" | "modern";
export type ContentDensity = "minimal" | "standard" | "full";

export type CollectionStyle = {
    /* =========================
     BASE
  ========================= */

    backgroundColor?: string; // page background
    fontFamily?: "inter" | "poppins" | "spectral";

    /* =========================
     HEADER / HERO
  ========================= */

    headerBackgroundColor?: string;
    heroImageRadius?: number; // px

    showLogo?: boolean;
    showCoverImage?: boolean;
    showActivityName?: boolean;
    showCatalogName?: boolean;
    showAddress?: boolean;

    /** Border radius globale in px (da tokens.appearance.borderRadius). Passato all'header per animazione lerp. */
    appearanceRadius?: number;

    /* =========================
     NAVIGATION (PILLS)
  ========================= */

    sectionNavColor?: string;
    /** Visual style of the section navigation: pill / tabs / minimal */
    sectionNavStyle?: SectionNavStyle;

    /* =========================
     CARDS
  ========================= */

    cardTemplate?: CardTemplate;
    cardBackgroundColor?: string;
    cardRadius?: number; // px
    /** Whether items are displayed in a multi-column grid or a single-column list */
    cardLayout?: CardLayout;
    /** Visual style of product rows: card (with image/background) or menu (text-only) */
    productStyle?: ProductStyle;
    /** Card/modal appearance: raised (shadow), bordered (border, no shadow), or glass (translucent + blur) */
    cardTreatment?: CardTreatment;
    /** Visual style of featured content cards: card (image top + text below), highlight (image as background, text overlaid), or compact (dense horizontal row) */
    featuredStyle?: "card" | "highlight" | "compact";
    /** Icon style for allergens + characteristics in product cards: plain (bare) or pill (colored circle) */
    iconStyle?: IconStyle;
    /** Structural variant of the compact product row: editorial (dotted leader between name and price) or modern (none). No effect on card style. */
    compactLayoutStyle?: CompactLayoutStyle;
    /** Content density of product rows (card + compact): minimal (name+price only), standard (+description), full (+pairings and allergens) */
    contentDensity?: ContentDensity;
};

/* =========================
   DEFAULTS
========================= */

export const DEFAULT_COLLECTION_STYLE: Required<CollectionStyle> = {
    backgroundColor: "#ffffff",
    fontFamily: "inter",

    headerBackgroundColor: "#ffffff",
    heroImageRadius: 12,

    showLogo: true,
    showCoverImage: true,
    showActivityName: true,
    showCatalogName: true,
    showAddress: false,
    appearanceRadius: 20,

    sectionNavColor: "#6366f1",
    sectionNavStyle: "filled",

    cardTemplate: "left",
    cardBackgroundColor: "#ffffff",
    cardRadius: 12,
    cardLayout: "list",
    productStyle: "card",
    cardTreatment: "raised",
    featuredStyle: "card",
    iconStyle: "plain",
    compactLayoutStyle: "modern",
    contentDensity: "full"
};
