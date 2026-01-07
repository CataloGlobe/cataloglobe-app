export type CardTemplate = "left" | "right" | "no-image";
export type SectionNavShape = "rounded" | "pill" | "square";

export type CollectionStyle = {
    /* =========================
     BASE
  ========================= */

    backgroundColor?: string; // page background
    fontFamily?: "inter" | "outfit" | "poppins";

    /* =========================
     HEADER / HERO
  ========================= */

    headerBackgroundColor?: string;
    heroImageRadius?: number; // px

    /* =========================
     NAVIGATION (PILLS)
  ========================= */

    sectionNavColor?: string;
    sectionNavShape?: SectionNavShape;

    /* =========================
     CARDS
  ========================= */

    cardTemplate?: CardTemplate;
    cardBackgroundColor?: string;
    cardRadius?: number; // px
};

/* =========================
   DEFAULTS
========================= */

export const DEFAULT_COLLECTION_STYLE: Required<CollectionStyle> = {
    backgroundColor: "#ffffff",
    fontFamily: "inter",

    headerBackgroundColor: "#ffffff",
    heroImageRadius: 12,

    sectionNavColor: "#6366f1",
    sectionNavShape: "pill",

    cardTemplate: "left",
    cardBackgroundColor: "#ffffff",
    cardRadius: 12
};

/* =========================
   HELPERS
========================= */

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/* =========================
   SAFE PARSER
========================= */

export function safeCollectionStyle(style: unknown): CollectionStyle {
    // Se arriva una stringa JSON (capita con Supabase / view)
    if (typeof style === "string") {
        try {
            style = JSON.parse(style);
        } catch {
            return {};
        }
    }

    if (!isRecord(style)) return {};

    const out: CollectionStyle = {};

    // BASE
    if (typeof style.backgroundColor === "string") {
        out.backgroundColor = style.backgroundColor;
    }

    if (
        style.fontFamily === "inter" ||
        style.fontFamily === "outfit" ||
        style.fontFamily === "poppins"
    ) {
        out.fontFamily = style.fontFamily;
    }

    // HEADER
    if (typeof style.headerBackgroundColor === "string") {
        out.headerBackgroundColor = style.headerBackgroundColor;
    }

    if (typeof style.heroImageRadius === "number" && Number.isFinite(style.heroImageRadius)) {
        out.heroImageRadius = style.heroImageRadius;
    }

    // NAV
    if (typeof style.sectionNavColor === "string") {
        out.sectionNavColor = style.sectionNavColor;
    }

    if (
        style.sectionNavShape === "rounded" ||
        style.sectionNavShape === "pill" ||
        style.sectionNavShape === "square"
    ) {
        out.sectionNavShape = style.sectionNavShape;
    }

    // CARD
    if (
        style.cardTemplate === "left" ||
        style.cardTemplate === "right" ||
        style.cardTemplate === "no-image"
    ) {
        out.cardTemplate = style.cardTemplate;
    }

    if (typeof style.cardBackgroundColor === "string") {
        out.cardBackgroundColor = style.cardBackgroundColor;
    }

    if (typeof style.cardRadius === "number" && Number.isFinite(style.cardRadius)) {
        out.cardRadius = style.cardRadius;
    }

    return out;
}

/* =========================
   RESOLVER
========================= */

export function resolveCollectionStyle(saved: unknown, draft: unknown): Required<CollectionStyle> {
    return {
        ...DEFAULT_COLLECTION_STYLE,
        ...safeCollectionStyle(saved),
        ...safeCollectionStyle(draft)
    };
}
