export type NavigationStyle = "filled" | "outline" | "tabs" | "minimal";
export type CardLayout = "grid" | "list";
export type ProductStyle = "card" | "compact";
export type BorderRadius = "none" | "soft" | "rounded";
export type FontFamily = "inter" | "poppins" | "montserrat" | "josefin-sans" | "raleway" | "playfair" | "lora" | "cormorant-garamond" | "caveat";
export type BackgroundPattern = "none" | "dots" | "diagonal" | "waves" | "crosshatch" | "noise";
export type PatternIntensity = "subtle" | "medium" | "strong";
export type FeaturedStyle = "card" | "highlight";
export type CardTreatment = "raised" | "bordered" | "glass";
export type OutlinedBorderColor = "auto" | "primary";

export interface StyleTokenModel {
    colors: {
        pageBackground: string;
        primary: string;
        /** Colore azione (pulsanti prodotto + CTA). Opzionale: assente = segue il primario. */
        accent?: string;
    };
    typography: {
        fontFamily: FontFamily;
    };
    appearance: {
        borderRadius: BorderRadius;
        backgroundPattern: BackgroundPattern;
        patternIntensity: PatternIntensity;
        featuredStyle: FeaturedStyle;
        cardTreatment: CardTreatment;
        /** Colore bordo per cardTreatment "bordered". Assente = "auto" (blend derivato, comportamento storico). */
        outlinedBorderColor?: OutlinedBorderColor;
        /** Sottotitolo nella card overview dei contenuti in evidenza. Assente = true (mostrato, comportamento storico). */
        showFeaturedSubtitle?: boolean;
    };
    header: {
        showLogo: boolean;
        showCoverImage: boolean;
        showActivityName: boolean;
        showCatalogName: boolean;
        showAddress: boolean;
    };
    navigation: {
        style: NavigationStyle;
    };
    card: {
        layout: CardLayout;
        productStyle: ProductStyle;
        image: {
            mode: "show" | "hide";
            position: "left" | "right";
        };
    };
}

// Default robust values to fallback to
export const DEFAULT_STYLE_TOKENS: StyleTokenModel = {
    colors: {
        pageBackground: "#FFFFFF",
        primary: "#6366f1"
    },
    typography: {
        fontFamily: "inter"
    },
    appearance: {
        borderRadius: "rounded",
        backgroundPattern: "none",
        patternIntensity: "medium",
        featuredStyle: "card",
        cardTreatment: "raised"
    },
    header: {
        showLogo: true,
        showCoverImage: true,
        showActivityName: true,
        showCatalogName: true,
        showAddress: false
    },
    navigation: {
        style: "filled"
    },
    card: {
        layout: "list",
        productStyle: "card" as ProductStyle,
        image: {
            mode: "show",
            position: "left"
        }
    }
};

const VALID_PATTERNS: BackgroundPattern[] = ["none", "dots", "diagonal", "waves", "crosshatch", "noise"];
const VALID_PATTERN_INTENSITIES: PatternIntensity[] = ["subtle", "medium", "strong"];
const VALID_FEATURED_STYLES: FeaturedStyle[] = ["card", "highlight"];
const VALID_CARD_TREATMENTS: CardTreatment[] = ["raised", "bordered", "glass"];
const VALID_OUTLINED_BORDER_COLORS: OutlinedBorderColor[] = ["auto", "primary"];

/**
 * Parses raw JSON configuration (from DB) into a structured UI Token Model.
 * Provides backwards compatibility for old JSON shapes by checking multiple possible paths,
 * and falls back to safe defaults for missing values.
 */
export function parseTokens(rawJson: any): StyleTokenModel {
    if (!rawJson) return DEFAULT_STYLE_TOKENS;
    if (typeof rawJson !== "object") return DEFAULT_STYLE_TOKENS;

    const rawColors = rawJson.colors || {};
    const rawLayout = rawJson.layout || {};
    const rawHeader = rawJson.header || {};
    const rawNav = rawJson.navigation || {};
    const rawCard = rawJson.card || {};
    const rawTypo = rawJson.typography || {};
    const rawCardImage = rawCard.image || {};
    const rawAppearance = rawJson.appearance || {};

    // Retrocompat: derive borderRadius from old card.radius if new field absent
    const borderRadius: BorderRadius = (() => {
        if (["none", "soft", "rounded"].includes(rawAppearance.borderRadius)) {
            return rawAppearance.borderRadius as BorderRadius;
        }
        if (rawCard.radius === "sharp") return "none";
        return DEFAULT_STYLE_TOKENS.appearance.borderRadius;
    })();

    // backgroundImage (legacy) is ignored — always fall back to pattern
    const backgroundPattern: BackgroundPattern = (() => {
        // Mapping deprecato: "grid" → "diagonal", "diamonds" → "dots"
        const migrated =
            rawAppearance.backgroundPattern === "grid"
                ? "diagonal"
                : rawAppearance.backgroundPattern === "diamonds"
                    ? "dots"
                    : rawAppearance.backgroundPattern;
        return VALID_PATTERNS.includes(migrated)
            ? (migrated as BackgroundPattern)
            : "none";
    })();

    const patternIntensity: PatternIntensity = VALID_PATTERN_INTENSITIES.includes(rawAppearance.patternIntensity)
        ? rawAppearance.patternIntensity as PatternIntensity
        : DEFAULT_STYLE_TOKENS.appearance.patternIntensity;

    const featuredStyle: FeaturedStyle = VALID_FEATURED_STYLES.includes(rawAppearance.featuredStyle)
        ? rawAppearance.featuredStyle as FeaturedStyle
        : "card";

    // cardTreatment: default sicuro "raised" per stili vecchi senza campo
    const cardTreatment: CardTreatment = VALID_CARD_TREATMENTS.includes(rawAppearance.cardTreatment)
        ? rawAppearance.cardTreatment as CardTreatment
        : "raised";

    // outlinedBorderColor: assente = "auto" (nessun campo mai salvato per stili vecchi)
    const outlinedBorderColor: OutlinedBorderColor | undefined = VALID_OUTLINED_BORDER_COLORS.includes(rawAppearance.outlinedBorderColor)
        ? rawAppearance.outlinedBorderColor as OutlinedBorderColor
        : undefined;

    // showFeaturedSubtitle: assente = true (mostrato, comportamento storico per stili vecchi)
    const showFeaturedSubtitle: boolean | undefined =
        typeof rawAppearance.showFeaturedSubtitle === "boolean" && rawAppearance.showFeaturedSubtitle === false
            ? false
            : undefined;

    return {
        colors: {
            pageBackground:
                rawColors.pageBackground ||
                rawColors.background ||
                DEFAULT_STYLE_TOKENS.colors.pageBackground,
            primary: rawColors.primary || DEFAULT_STYLE_TOKENS.colors.primary,
            // accent opzionale: assente = "collegato al primario". Il fallback a primary
            // avviene nel mapper, così "collegato" resta semanticamente "campo assente".
            accent: rawColors.accent || undefined
        },
        typography: {
            fontFamily: ["inter", "poppins", "montserrat", "josefin-sans", "raleway", "playfair", "lora", "cormorant-garamond", "caveat"].includes(
                rawTypo.fontFamily || rawJson.fontFamily
            )
                ? rawTypo.fontFamily || rawJson.fontFamily
                : DEFAULT_STYLE_TOKENS.typography.fontFamily
        },
        appearance: {
            borderRadius,
            backgroundPattern,
            patternIntensity,
            featuredStyle,
            cardTreatment,
            outlinedBorderColor,
            showFeaturedSubtitle
        },
        header: {
            showLogo:
                typeof rawHeader.showLogo === "boolean"
                    ? rawHeader.showLogo
                    : DEFAULT_STYLE_TOKENS.header.showLogo,
            showCoverImage:
                typeof rawHeader.showCoverImage === "boolean"
                    ? rawHeader.showCoverImage
                    : DEFAULT_STYLE_TOKENS.header.showCoverImage,
            // Nome sede sempre visibile — non modificabile dall'utente
            showActivityName: true,
            showCatalogName:
                typeof rawHeader.showCatalogName === "boolean"
                    ? rawHeader.showCatalogName
                    : DEFAULT_STYLE_TOKENS.header.showCatalogName,
            showAddress:
                typeof rawHeader.showAddress === "boolean"
                    ? rawHeader.showAddress
                    : DEFAULT_STYLE_TOKENS.header.showAddress
        },
        navigation: {
            style: (() => {
                // Mapping deprecato: "pill", "chip" e "dot" (variante rimossa) consolidati in "filled"
                const migrated =
                    rawNav.style === "pill" || rawNav.style === "chip" || rawNav.style === "dot"
                        ? "filled"
                        : rawNav.style;
                return ["filled", "outline", "tabs", "minimal"].includes(migrated)
                    ? (migrated as NavigationStyle)
                    : DEFAULT_STYLE_TOKENS.navigation.style;
            })()
        },
        card: {
            layout: ["grid", "list"].includes(rawCard.layout || rawLayout.card)
                ? ((rawCard.layout || rawLayout.card) as CardLayout)
                : DEFAULT_STYLE_TOKENS.card.layout,
            productStyle: rawCard.productStyle === "menu"
                ? "compact"
                : ["card", "compact"].includes(rawCard.productStyle)
                    ? (rawCard.productStyle as ProductStyle)
                    : DEFAULT_STYLE_TOKENS.card.productStyle,
            image: {
                mode: ["show", "hide"].includes(rawCardImage.mode)
                    ? rawCardImage.mode
                    : DEFAULT_STYLE_TOKENS.card.image.mode,
                position: ["left", "right"].includes(rawCardImage.position)
                    ? rawCardImage.position
                    : DEFAULT_STYLE_TOKENS.card.image.position
            }
        }
    };
}

/**
 * Serializes the UI Token Model back into the raw JSON config shape expected by the DB logic.
 */
export function serializeTokens(model: StyleTokenModel): Record<string, unknown> {
    const colors: Record<string, unknown> = {
        pageBackground: model.colors.pageBackground,
        primary: model.colors.primary
    };
    // accent serializzato solo se scollegato dal primario (collegato → chiave omessa)
    if (model.colors.accent) colors.accent = model.colors.accent;

    const appearance: Record<string, unknown> = {
        borderRadius: model.appearance.borderRadius,
        backgroundPattern: model.appearance.backgroundPattern,
        patternIntensity: model.appearance.patternIntensity,
        featuredStyle: model.appearance.featuredStyle,
        cardTreatment: model.appearance.cardTreatment
    };
    // outlinedBorderColor serializzato solo se "primary" (auto → chiave omessa, stesso pattern di accent)
    if (model.appearance.outlinedBorderColor === "primary") appearance.outlinedBorderColor = "primary";
    // showFeaturedSubtitle serializzato solo se false (true = default, chiave omessa)
    if (model.appearance.showFeaturedSubtitle === false) appearance.showFeaturedSubtitle = false;

    return {
        colors,
        typography: {
            fontFamily: model.typography.fontFamily
        },
        appearance,
        header: {
            showLogo: model.header.showLogo,
            showCoverImage: model.header.showCoverImage,
            showActivityName: model.header.showActivityName,
            showCatalogName: model.header.showCatalogName,
            showAddress: model.header.showAddress
        },
        navigation: {
            style: model.navigation.style
        },
        card: {
            layout: model.card.layout,
            productStyle: model.card.productStyle,
            image: {
                mode: model.card.image.mode,
                position: model.card.image.position
            }
        }
    };
}
