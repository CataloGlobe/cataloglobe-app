export type HubTab = "menu" | "events" | "reviews";

export type CardTemplate = "left" | "right" | "no-image";
export type SectionNavStyle = "filled" | "outline" | "tabs" | "dot" | "minimal";
export type CardLayout = "grid" | "list";
export type ProductStyle = "card" | "compact";

export type CollectionStyle = {
    /* =========================
     BASE
  ========================= */

    backgroundColor?: string; // page background
    fontFamily?: "inter" | "poppins" | "playfair";

    /* =========================
     HEADER / HERO
  ========================= */

    headerBackgroundColor?: string;
    heroImageRadius?: number; // px

    showLogo?: boolean;
    showCoverImage?: boolean;
    showActivityName?: boolean;
    showCatalogName?: boolean;

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
    /** Visual style of featured content cards: card (image top + text below) or highlight (image as background, text overlaid) */
    featuredStyle?: "card" | "highlight";
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
    appearanceRadius: 20,

    sectionNavColor: "#6366f1",
    sectionNavStyle: "filled",

    cardTemplate: "left",
    cardBackgroundColor: "#ffffff",
    cardRadius: 12,
    cardLayout: "list",
    productStyle: "card",
    featuredStyle: "card"
};
