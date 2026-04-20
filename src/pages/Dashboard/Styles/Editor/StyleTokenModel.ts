export type NavigationStyle = "pill" | "chip" | "outline" | "tabs" | "dot" | "minimal";
export type CardLayout = "grid" | "list";
export type ProductStyle = "card" | "compact";
export type BorderRadius = "none" | "soft" | "rounded";
export type FontFamily = "inter" | "poppins" | "playfair";
export type BackgroundPattern = "none" | "dots" | "diagonal" | "grid" | "waves" | "diamonds";
export type FeaturedStyle = "card" | "highlight";

export interface StyleTokenModel {
    colors: {
        pageBackground: string;
        primary: string;
        headerBackground: string;
        textPrimary: string;
        textSecondary: string;
        surface: string;
        border: string;
    };
    typography: {
        fontFamily: FontFamily;
    };
    appearance: {
        borderRadius: BorderRadius;
        backgroundPattern: BackgroundPattern;
        featuredStyle: FeaturedStyle;
    };
    header: {
        showLogo: boolean;
        showCoverImage: boolean;
        showActivityName: boolean;
        showCatalogName: boolean;
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
        primary: "#6366f1",
        headerBackground: "#6366f1",
        textPrimary: "#1a1a2e",
        textSecondary: "#6b7280",
        surface: "#FFFFFF",
        border: "#f1f5f9"
    },
    typography: {
        fontFamily: "inter"
    },
    appearance: {
        borderRadius: "rounded",
        backgroundPattern: "none",
        featuredStyle: "card"
    },
    header: {
        showLogo: true,
        showCoverImage: true,
        showActivityName: true,
        showCatalogName: true
    },
    navigation: {
        style: "pill"
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

const VALID_PATTERNS: BackgroundPattern[] = ["none", "dots", "diagonal", "grid", "waves", "diamonds"];
const VALID_FEATURED_STYLES: FeaturedStyle[] = ["card", "highlight"];

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
    const backgroundPattern: BackgroundPattern = VALID_PATTERNS.includes(rawAppearance.backgroundPattern)
        ? rawAppearance.backgroundPattern as BackgroundPattern
        : "none";

    const featuredStyle: FeaturedStyle = VALID_FEATURED_STYLES.includes(rawAppearance.featuredStyle)
        ? rawAppearance.featuredStyle as FeaturedStyle
        : "card";

    return {
        colors: {
            pageBackground:
                rawColors.pageBackground ||
                rawColors.background ||
                DEFAULT_STYLE_TOKENS.colors.pageBackground,
            primary: rawColors.primary || DEFAULT_STYLE_TOKENS.colors.primary,
            headerBackground:
                rawColors.headerBackground ||
                rawHeader.background ||
                rawColors.primary ||
                DEFAULT_STYLE_TOKENS.colors.headerBackground,
            textPrimary: rawColors.textPrimary || DEFAULT_STYLE_TOKENS.colors.textPrimary,
            textSecondary: rawColors.textSecondary || DEFAULT_STYLE_TOKENS.colors.textSecondary,
            surface: rawColors.surface || DEFAULT_STYLE_TOKENS.colors.surface,
            border: rawColors.border || DEFAULT_STYLE_TOKENS.colors.border
        },
        typography: {
            fontFamily: ["inter", "poppins", "playfair"].includes(
                rawTypo.fontFamily || rawJson.fontFamily
            )
                ? rawTypo.fontFamily || rawJson.fontFamily
                : DEFAULT_STYLE_TOKENS.typography.fontFamily
        },
        appearance: {
            borderRadius,
            backgroundPattern,
            featuredStyle
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
                    : DEFAULT_STYLE_TOKENS.header.showCatalogName
        },
        navigation: {
            style: ["pill", "chip", "outline", "tabs", "dot", "minimal"].includes(rawNav.style)
                ? (rawNav.style as NavigationStyle)
                : DEFAULT_STYLE_TOKENS.navigation.style
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
    return {
        colors: {
            pageBackground: model.colors.pageBackground,
            primary: model.colors.primary,
            headerBackground: model.colors.headerBackground,
            textPrimary: model.colors.textPrimary,
            textSecondary: model.colors.textSecondary,
            surface: model.colors.surface,
            border: model.colors.border
        },
        typography: {
            fontFamily: model.typography.fontFamily
        },
        appearance: {
            borderRadius: model.appearance.borderRadius,
            backgroundPattern: model.appearance.backgroundPattern,
            featuredStyle: model.appearance.featuredStyle
        },
        header: {
            showLogo: model.header.showLogo,
            showCoverImage: model.header.showCoverImage,
            showActivityName: model.header.showActivityName,
            showCatalogName: model.header.showCatalogName
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
