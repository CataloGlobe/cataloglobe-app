import type { FC, ReactElement, SVGProps } from "react";
import {
    Award,
    Beef,
    Calendar,
    ChefHat,
    Clock,
    Coffee,
    Droplets,
    Fish,
    Flame,
    Leaf,
    MapPin,
    MilkOff,
    Snowflake,
    Sparkles,
    Sprout,
    Star,
    Tag,
    TrendingUp,
    WheatOff,
    Wine
} from "lucide-react";
import { CUSTOM_CHARACTERISTIC_ICON_MAP } from "@components/icons/characteristics";
import styles from "./CharacteristicIcon.module.scss";

/**
 * Renders the icon associated to a `product_characteristics.icon` value.
 *
 * Icon strings follow the `<prefix>:<name>` convention:
 *
 *   lucide:<name> → mapped to a tree-shaken Lucide React component.
 *   custom:<name> → real SVG asset deferred; renders a Lucide approximation
 *                   defined in CUSTOM_FALLBACK_MAP, optionally with a color
 *                   override (e.g. spicy levels share the Flame icon but
 *                   diverge by hue).
 *   badge:<name>  → text badge with parametric label (Halal, Kosher, FIVI,
 *                   Slow Food, 18+, …). Trademarked or culturally-textual
 *                   marks without a clean Lucide equivalent.
 *
 * Unknown prefix or unknown name falls back to the neutral `Tag` Lucide icon.
 *
 * The wrapper is a `<span>` carrying tooltip + `aria-label` when `label` is
 * passed. Tooltip is CSS-only (no Radix) for performance in long lists.
 */

type LucideComponent = FC<SVGProps<SVGSVGElement> & { size?: number | string }>;

type CustomFallback = {
    component: LucideComponent;
    /** Optional inline color override (e.g. spicy gradient). */
    color?: string;
};

type IconVariant = "default" | "bare";

interface CharacteristicIconProps {
    icon: string;
    size?: number;
    className?: string;
    label?: string;
    variant?: IconVariant;
    /**
     * Opt-in round tinted chip background (former default look). Defaults to
     * `false` so characteristic icons match AllergenIcon's plain style.
     * Reserved for a future Style Editor toggle — do not remove the
     * underlying `.chip` class, just leave this off by default.
     */
    chip?: boolean;
}

const LUCIDE_ICON_MAP: Record<string, LucideComponent> = {
    leaf: Leaf,
    sprout: Sprout,
    "wheat-off": WheatOff,
    "milk-off": MilkOff,
    "map-pin": MapPin,
    snowflake: Snowflake,
    calendar: Calendar,
    wine: Wine,
    coffee: Coffee,
    award: Award,
    sparkles: Sparkles,
    "trending-up": TrendingUp,
    clock: Clock,
    flame: Flame,
    fish: Fish,
    droplets: Droplets,
    "chef-hat": ChefHat,
    beef: Beef,
    star: Star,
    tag: Tag
};

/**
 * Maps each `custom:<name>` to its Lucide approximation while real SVG assets
 * are still in design. The `color` field, when present, is passed inline to
 * the rendered SVG so visually similar icons (e.g. all 3 pepper levels) stay
 * distinguishable until the dedicated artwork lands.
 */
const CUSTOM_FALLBACK_MAP: Record<string, CustomFallback> = {
    "organic-leaf": { component: Leaf },
    "raw-fish": { component: Fish },
    "pepper-1": { component: Flame, color: "var(--color-success-500, #22c55e)" }, // mild → green
    "pepper-2": { component: Flame, color: "var(--color-warning-500, #f59e0b)" }, // medium → orange
    "pepper-3": { component: Flame, color: "var(--color-error-500, #ef4444)" }, // hot → red
    "coravin-drop": { component: Droplets },
    "fish-leaf": { component: Fish },
    "thermometer-snow": { component: Snowflake },
    "rolling-pin": { component: ChefHat },
    garlic: { component: Sprout },
    onion: { component: Sprout },
    pig: { component: Beef },
    signature: { component: Star }
};

const NEUTRAL_FALLBACK: LucideComponent = Tag;

/**
 * Maps each `badge:<name>` to the short token displayed inside the badge.
 * Visible text is always derived from the icon key (NOT from the human label),
 * so badges stay compact in card view regardless of the verbose label_it
 * passed for tooltips. Unknown keys fall back to the uppercased name with
 * separators turned into spaces.
 */
const BADGE_LABEL_MAP: Record<string, string> = {
    halal: "HALAL",
    kosher: "KOSHER",
    "slow-food": "SLOW FOOD",
    fivi: "FIVI",
    "18plus": "18+"
};

function badgeTextFor(name: string): string {
    return BADGE_LABEL_MAP[name] ?? name.replace(/[-_]/g, " ").toUpperCase();
}

// Debounced dev warnings: emit once per missing custom name across the lifetime
// of the page. Avoids console spam when the same characteristic icon renders
// across many cards on a single page.
const warnedCustomMisses = new Set<string>();

function warnCustomMissing(name: string, fallbackName: string): void {
    if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
    if (warnedCustomMisses.has(name)) return;
    warnedCustomMisses.add(name);
    // eslint-disable-next-line no-console
    console.warn(
        `[CharacteristicIcon] custom icon "${name}" not yet provided as SVG, ` +
            `falling back to Lucide ${fallbackName}.`
    );
}

function parseIcon(icon: string): { prefix: string; name: string } {
    const colonIndex = icon.indexOf(":");
    if (colonIndex === -1) return { prefix: "", name: icon };
    return {
        prefix: icon.slice(0, colonIndex),
        name: icon.slice(colonIndex + 1)
    };
}

function CharacteristicBadge({
    label,
    size,
    variant
}: {
    label: string;
    size: number;
    variant: IconVariant;
}) {
    const text = label.toUpperCase();
    return (
        <span
            className={`${styles.badge} ${variant === "bare" ? styles.badgeBare : ""}`.trim()}
            style={{
                fontSize: Math.max(8, Math.round(size * 0.4)),
                lineHeight: 1,
                minWidth: size,
                minHeight: size
            }}
        >
            {text}
        </span>
    );
}

export default function CharacteristicIcon({
    icon,
    size = 20,
    className,
    label,
    variant = "default",
    chip = false
}: CharacteristicIconProps) {
    const { prefix, name } = parseIcon(icon);
    const wrapperClassName = `${styles.wrapper}${chip ? ` ${styles.chip}` : ""}`;
    // Both variants render the SVG at the nominal size — same as AllergenIcon.
    // The legacy +8 offset (compensation for the removed circled badge) is
    // gone; if a badge background is ever re-exposed via Style Editor, size
    // it explicitly there rather than as an implicit offset here.
    const iconSize = size;

    let renderable: ReactElement | null = null;

    if (prefix === "lucide") {
        const Component = LUCIDE_ICON_MAP[name] ?? NEUTRAL_FALLBACK;
        renderable = <Component size={iconSize} className={styles.icon} />;
    } else if (prefix === "custom") {
        const CustomComponent = CUSTOM_CHARACTERISTIC_ICON_MAP[name];
        if (CustomComponent) {
            renderable = <CustomComponent size={iconSize} className={styles.icon} />;
        } else {
            const fallback = CUSTOM_FALLBACK_MAP[name];
            if (fallback) {
                warnCustomMissing(name, fallback.component.displayName ?? "Tag");
                const Component = fallback.component;
                renderable = (
                    <Component
                        size={iconSize}
                        className={styles.icon}
                        style={fallback.color ? { color: fallback.color } : undefined}
                    />
                );
            } else {
                renderable = <NEUTRAL_FALLBACK size={iconSize} className={styles.icon} />;
            }
        }
    } else if (prefix === "badge") {
        // Badge visible text is always derived from the icon key
        // (`<name>` after `badge:`), NOT from `label`. Keeps badges compact
        // in card view (e.g. "18+") while the verbose label_it stays
        // available for tooltip + aria-label on the default variant.
        const badgeText = badgeTextFor(name);
        if (variant === "bare") {
            // Mirror AllergenIcon variant=bare: standalone element, no
            // wrapper, label prop intentionally ignored. Consumers
            // (ItemDetail, CharacteristicsSheet) render the label_it
            // adjacent to the icon themselves.
            return <CharacteristicBadge label={badgeText} size={size} variant="bare" />;
        }
        return (
            <span
                className={`${wrapperClassName} ${label ? styles.hasTooltip : ""} ${className ?? ""}`.trim()}
                aria-label={label}
                role={label ? "img" : undefined}
            >
                <CharacteristicBadge label={badgeText} size={size} variant="default" />
                {label && <span className={styles.tooltip}>{label}</span>}
            </span>
        );
    } else {
        renderable = <NEUTRAL_FALLBACK size={iconSize} className={styles.icon} />;
    }

    if (variant === "bare") {
        // Mirror AllergenIcon variant=bare: return the renderable directly,
        // no wrapper span, no aria-label, label prop ignored. Consumers
        // pass label_it as adjacent text in detail/sheet surfaces.
        return renderable;
    }

    return (
        <span
            className={`${wrapperClassName} ${label ? styles.hasTooltip : ""} ${className ?? ""}`.trim()}
            aria-label={label}
            role={label ? "img" : undefined}
        >
            {renderable}
            {label && <span className={styles.tooltip}>{label}</span>}
        </span>
    );
}

/**
 * Demo grid mounted on a temporary dev page when needed. Not imported in
 * production. Renders one tile per prefix family + an unknown-prefix
 * fallback case so visual regressions are spotted at a glance.
 */
export function CharacteristicIconDemo() {
    const samples: Array<{ heading: string; icon: string; label: string }> = [
        { heading: "lucide:leaf", icon: "lucide:leaf", label: "Vegetariano" },
        { heading: "lucide:wine", icon: "lucide:wine", label: "Contiene alcol" },
        { heading: "custom:pepper-1", icon: "custom:pepper-1", label: "Poco piccante" },
        { heading: "custom:pepper-2", icon: "custom:pepper-2", label: "Medio piccante" },
        { heading: "custom:pepper-3", icon: "custom:pepper-3", label: "Molto piccante" },
        { heading: "custom:rolling-pin", icon: "custom:rolling-pin", label: "Fatto in casa" },
        { heading: "badge:halal", icon: "badge:halal", label: "Halal" },
        { heading: "badge:18plus", icon: "badge:18plus", label: "Solo adulti" },
        { heading: "unknown:??", icon: "unknown:??", label: "Sconosciuto" }
    ];
    return (
        <div className={styles.demoGrid}>
            {samples.map(s => (
                <div key={s.heading} className={styles.demoTile}>
                    <CharacteristicIcon icon={s.icon} size={32} label={s.label} />
                    <code className={styles.demoCode}>{s.heading}</code>
                </div>
            ))}
        </div>
    );
}
