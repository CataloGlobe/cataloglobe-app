export type NavigationStyle = "pill" | "tabs" | "minimal";
export type CardLayout = "grid" | "list";
export type CardRadiusPreset = "sharp" | "rounded";
export type FontFamily = "inter" | "poppins" | "playfair";

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
    header: {
        imageBorderRadiusPx: number;
    };
    navigation: {
        style: NavigationStyle;
    };
    card: {
        layout: CardLayout;
        radius: CardRadiusPreset;
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
    header: {
        imageBorderRadiusPx: 12
    },
    navigation: {
        style: "pill"
    },
    card: {
        layout: "list",
        radius: "rounded",
        image: {
            mode: "show",
            position: "left"
        }
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
    const rawTypo = rawJson.typography || {};
    const rawCardImage = rawCard.image || {};

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
                : DEFAULT_STYLE_TOKENS.card.layout,
            radius: ["sharp", "rounded"].includes(rawCard.radius)
                ? (rawCard.radius as CardRadiusPreset)
                : DEFAULT_STYLE_TOKENS.card.radius,
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
 * We can keep it flat or structured. As visual style system evolves, keeping a predictable structured schema is best.
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
        header: {
            imageBorderRadiusPx: model.header.imageBorderRadiusPx
        },
        navigation: {
            style: model.navigation.style
        },
        card: {
            layout: model.card.layout,
            radius: model.card.radius,
            image: {
                mode: model.card.image.mode,
                position: model.card.image.position
            }
        }
    };
}
