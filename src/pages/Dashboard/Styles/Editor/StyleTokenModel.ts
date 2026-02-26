export type NavigationStyle = "pill" | "tabs" | "minimal";
export type CardLayout = "grid" | "list";

export interface StyleTokenModel {
    colors: {
        pageBackground: string;
        primary: string;
        headerBackground: string;
    };
    header: {
        imageBorderRadiusPx: number;
    };
    navigation: {
        style: NavigationStyle;
    };
    card: {
        layout: CardLayout;
    };
}

// Default robust values to fallback to
export const DEFAULT_STYLE_TOKENS: StyleTokenModel = {
    colors: {
        pageBackground: "#f3f4f6",
        primary: "#6366f1",
        headerBackground: "#ffffff"
    },
    header: {
        imageBorderRadiusPx: 12
    },
    navigation: {
        style: "pill"
    },
    card: {
        layout: "grid"
    }
};

/**
 * Parses raw JSON configuration (from DB) into a structured UI Token Model.
 * Provides backwards compatibility for old JSON shapes by checking multiple possible paths,
 * and falls back to safe defaults for missing values.
 */
export function parseTokens(rawJson: any): StyleTokenModel {
    if (!rawJson) return DEFAULT_STYLE_TOKENS;
    if (typeof rawJson !== "object") return DEFAULT_STYLE_TOKENS;

    const rawColors = rawJson.colors || {};
    const rawShape = rawJson.shape || {};
    const rawLayout = rawJson.layout || {};
    const rawHeader = rawJson.header || {};
    const rawNav = rawJson.navigation || {};
    const rawCard = rawJson.card || {};

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
                DEFAULT_STYLE_TOKENS.colors.headerBackground
        },
        header: {
            imageBorderRadiusPx:
                typeof rawHeader.imageBorderRadiusPx === "number"
                    ? rawHeader.imageBorderRadiusPx
                    : typeof rawShape.borderRadius === "string" &&
                        rawShape.borderRadius.includes("px")
                      ? parseInt(rawShape.borderRadius, 10)
                      : DEFAULT_STYLE_TOKENS.header.imageBorderRadiusPx
        },
        navigation: {
            style: ["pill", "tabs", "minimal"].includes(rawNav.style)
                ? (rawNav.style as NavigationStyle)
                : DEFAULT_STYLE_TOKENS.navigation.style
        },
        card: {
            layout: ["grid", "list"].includes(rawCard.layout || rawLayout.card)
                ? ((rawCard.layout || rawLayout.card) as CardLayout)
                : DEFAULT_STYLE_TOKENS.card.layout
        }
    };
}

/**
 * Serializes the UI Token Model back into the raw JSON config shape expected by the DB logic.
 * We can keep it flat or structured. As visual style system evolves, keeping a predictable structured schema is best.
 */
export function serializeTokens(model: StyleTokenModel): any {
    return {
        colors: {
            pageBackground: model.colors.pageBackground,
            primary: model.colors.primary,
            headerBackground: model.colors.headerBackground
        },
        header: {
            imageBorderRadiusPx: model.header.imageBorderRadiusPx
        },
        navigation: {
            style: model.navigation.style
        },
        card: {
            layout: model.card.layout
        }
    };
}
