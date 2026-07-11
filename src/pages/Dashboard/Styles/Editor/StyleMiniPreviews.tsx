import type { CSSProperties } from "react";
import type { NavigationStyle, BorderRadius, ProductStyle, FeaturedStyle, CardLayout, IconStyle } from "./StyleTokenModel";
import s from "./StyleSettingsControls.module.scss";

export const RADIUS_CSS: Record<BorderRadius, string> = {
    none: "0px",
    soft: "10px",
    rounded: "20px"
};

const B: CSSProperties = { display: "block", flexShrink: 0 };
const G = "#c4cad4";

/* ── Nav style preview ───────────────────────────────────── */

export function NavMiniPreview({
    navStyle,
    primaryColor,
    borderRadius
}: {
    navStyle: NavigationStyle;
    primaryColor: string;
    borderRadius?: BorderRadius;
}) {
    // Converte il token borderRadius in un valore numerico per le preview inline
    const radiusPx = borderRadius ? parseFloat(RADIUS_CSS[borderRadius]) : 99;

    switch (navStyle) {
        case "filled":
            return (
                <>
                    <span style={{ ...B, background: primaryColor, borderRadius: radiusPx, width: 24, height: 11 }} />
                    <span style={{ ...B, background: G, borderRadius: radiusPx, width: 18, height: 11, opacity: 0.45 }} />
                    <span style={{ ...B, background: G, borderRadius: radiusPx, width: 18, height: 11, opacity: 0.45 }} />
                </>
            );
        case "outline":
            return (
                <>
                    <span style={{ ...B, border: `1.5px solid ${primaryColor}`, borderRadius: radiusPx, width: 24, height: 11, boxSizing: "border-box" }} />
                    <span style={{ ...B, border: `1px solid ${G}`, borderRadius: radiusPx, width: 18, height: 11, opacity: 0.45, boxSizing: "border-box" }} />
                    <span style={{ ...B, border: `1px solid ${G}`, borderRadius: radiusPx, width: 18, height: 11, opacity: 0.45, boxSizing: "border-box" }} />
                </>
            );
        case "tabs":
            return (
                <>
                    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
                        <span style={{ ...B, width: 18, height: 4, background: primaryColor, borderRadius: 1, opacity: 0.5 }} />
                        <span style={{ ...B, width: 20, height: 2, background: primaryColor, borderRadius: 1 }} />
                    </span>
                    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, opacity: 0.35, flexShrink: 0 }}>
                        <span style={{ ...B, width: 14, height: 4, background: G, borderRadius: 1 }} />
                    </span>
                    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, opacity: 0.35, flexShrink: 0 }}>
                        <span style={{ ...B, width: 14, height: 4, background: G, borderRadius: 1 }} />
                    </span>
                </>
            );
        case "minimal":
            return (
                <>
                    <span style={{ ...B, width: 20, height: 5, background: primaryColor, borderRadius: 2 }} />
                    <span style={{ ...B, width: 16, height: 5, background: G, borderRadius: 2, opacity: 0.35 }} />
                    <span style={{ ...B, width: 16, height: 5, background: G, borderRadius: 2, opacity: 0.35 }} />
                </>
            );
        case "tinted":
            return (
                <>
                    <span style={{ ...B, background: primaryColor, opacity: 0.18, borderRadius: radiusPx, width: 24, height: 11 }} />
                    <span style={{ ...B, background: G, borderRadius: radiusPx, width: 18, height: 11, opacity: 0.45 }} />
                    <span style={{ ...B, background: G, borderRadius: radiusPx, width: 18, height: 11, opacity: 0.45 }} />
                </>
            );
    }
}

/* ── Product style preview ───────────────────────────────── */

export function ProductStylePreview({ variant }: { variant: ProductStyle }) {
    if (variant === "card") {
        return (
            <div className={s.productSwatch} aria-hidden="true">
                <div className={s.productSwatchCard}>
                    <div className={s.productSwatchImg} />
                    <div className={s.productSwatchLines}>
                        <span className={s.previewBarBold} style={{ width: "60%" }} />
                        <span className={s.previewBarThin} style={{ width: "80%" }} />
                        <span className={s.previewBarThin} style={{ width: "50%" }} />
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className={s.productSwatch} aria-hidden="true">
            <div className={s.productSwatchCompact}>
                <span className={s.previewBarBold} style={{ width: "50%" }} />
                <span className={s.previewBarThin} style={{ width: "70%" }} />
                <div className={s.productSwatchSeparator} />
            </div>
        </div>
    );
}

/* ── Featured style preview ──────────────────────────────── */

export function FeaturedStylePreview({ variant }: { variant: FeaturedStyle }) {
    if (variant === "card") {
        return (
            <div className={s.featuredSwatch} aria-hidden="true">
                <div className={s.featuredSwatchCard}>
                    <div className={s.featuredSwatchImg} />
                    <div className={s.featuredSwatchText}>
                        <span className={s.previewBarBold} style={{ width: "60%" }} />
                        <span className={s.previewBarThin} style={{ width: "40%" }} />
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className={s.featuredSwatch} aria-hidden="true">
            <div className={s.featuredSwatchHighlight}>
                <div className={s.featuredSwatchOverlay}>
                    <span className={s.previewBarWhite} style={{ width: "55%" }} />
                    <span className={s.previewBarWhite} style={{ width: "35%" }} />
                </div>
            </div>
        </div>
    );
}

/* ── Card layout preview ─────────────────────────────────── */

export function CardLayoutPreview({ variant }: { variant: CardLayout }) {
    if (variant === "grid") {
        return (
            <div className={s.layoutSwatch} aria-hidden="true">
                <div className={s.layoutGrid}>
                    <div className={s.layoutGridItem}>
                        <div className={s.layoutGridItemImg} />
                        <div className={s.layoutGridItemLines}>
                            <span className={s.previewBarBold} style={{ width: "70%" }} />
                            <span className={s.previewBarThin} style={{ width: "50%" }} />
                        </div>
                    </div>
                    <div className={s.layoutGridItem}>
                        <div className={s.layoutGridItemImg} />
                        <div className={s.layoutGridItemLines}>
                            <span className={s.previewBarBold} style={{ width: "60%" }} />
                            <span className={s.previewBarThin} style={{ width: "45%" }} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className={s.layoutSwatch} aria-hidden="true">
            <div className={s.layoutList}>
                <div className={s.layoutListItem}>
                    <div className={s.layoutListItemImg} />
                    <div className={s.layoutListItemLines}>
                        <span className={s.previewBarBold} style={{ width: "60%" }} />
                        <span className={s.previewBarThin} style={{ width: "80%" }} />
                    </div>
                </div>
                <div className={s.layoutListItem}>
                    <div className={s.layoutListItemImg} />
                    <div className={s.layoutListItemLines}>
                        <span className={s.previewBarBold} style={{ width: "50%" }} />
                        <span className={s.previewBarThin} style={{ width: "70%" }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Icon style preview (senza sfondo / con sfondo) ──────── */

export function IconStylePreview({
    variant,
    primaryColor,
    borderRadius
}: {
    variant: IconStyle;
    primaryColor: string;
    borderRadius: BorderRadius;
}) {
    const iconSize = 15;
    const box = iconSize + 8; // icona + padding 4px per lato
    // Chip radius segue "Arrotondamento", clampato al cerchio (metà del lato).
    const radiusPx = Math.min(parseFloat(RADIUS_CSS[borderRadius]), box / 2);
    // Mima --pub-primary-soft (primary 20% su superficie chiara) del pubblico.
    const soft = `color-mix(in srgb, ${primaryColor} 20%, #ffffff)`;
    const isPill = variant === "pill";
    // Foglia (allergene-ish), stessa famiglia Lucide usata sul pubblico.
    const icon = (
        <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke={primaryColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: "block" }}
            aria-hidden="true"
        >
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6" />
        </svg>
    );
    return (
        <span
            aria-hidden="true"
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: box,
                height: box,
                padding: 4,
                boxSizing: "border-box",
                background: isPill ? soft : "transparent",
                borderRadius: isPill ? radiusPx : 0
            }}
        >
            {icon}
        </span>
    );
}

/* ── Image position preview ──────────────────────────────── */

export function ImagePositionPreview({ variant }: { variant: "left" | "right" | "none" }) {
    if (variant === "left") {
        return (
            <div className={s.imgPosSwatch} aria-hidden="true">
                <div className={s.imgPosRect} />
                <div className={s.imgPosLines}>
                    <span className={s.previewBarBold} style={{ width: "70%" }} />
                    <span className={s.previewBarThin} style={{ width: "90%" }} />
                </div>
            </div>
        );
    }
    if (variant === "right") {
        return (
            <div className={s.imgPosSwatch} aria-hidden="true">
                <div className={s.imgPosLines}>
                    <span className={s.previewBarBold} style={{ width: "70%" }} />
                    <span className={s.previewBarThin} style={{ width: "90%" }} />
                </div>
                <div className={s.imgPosRect} />
            </div>
        );
    }
    return (
        <div className={s.imgPosSwatch} aria-hidden="true">
            <div className={s.imgPosLinesCentered}>
                <span className={s.previewBarBold} style={{ width: "50%" }} />
                <span className={s.previewBarThin} style={{ width: "70%" }} />
            </div>
        </div>
    );
}
