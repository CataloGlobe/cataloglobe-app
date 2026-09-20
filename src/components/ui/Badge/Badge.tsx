import { CSSProperties, PropsWithChildren } from "react";
import Text from "../Text/Text";
import styles from "./Badge.module.scss";
import clsx from "clsx";

/**
 * `neutral` e `brand` sono le varianti del sistema (scheda «Badge»).
 * `primary | secondary | success | danger | warning` restano per i consumer
 * esistenti e rendono come prima: deprecate, si tolgono nel lotto 6. Un colore
 * che porta un significato è uno stato → `StatusBadge`.
 */
export type BadgeVariant =
    | "neutral"
    | "brand"
    | "primary"
    | "secondary"
    | "success"
    | "danger"
    | "warning";

export interface BadgeProps extends PropsWithChildren {
    variant?: BadgeVariant;
    /** @deprecated Fondo arbitrario: usa `StatusBadge` o una variante. */
    color?: string;
    /** @deprecated Posizionamento assoluto: spetta al contenitore. */
    absolute?: boolean;

    /** @deprecated Vedi `absolute`. */
    top?: number | string;
    /** @deprecated Vedi `absolute`. */
    right?: number | string;
    /** @deprecated Vedi `absolute`. */
    bottom?: number | string;
    /** @deprecated Vedi `absolute`. */
    left?: number | string;

    className?: string;
}

const DEPRECATED_VARIANTS: ReadonlySet<string> = new Set([
    "primary",
    "secondary",
    "success",
    "danger",
    "warning"
]);

// Un avviso per chiave, non uno per render: la console resta leggibile.
const warned = new Set<string>();
function warnDeprecated(key: string, detail: string) {
    if (!import.meta.env.DEV || warned.has(key)) return;
    warned.add(key);
    console.warn(`[Badge] ${detail} deprecato: usa StatusBadge`);
}

export const Badge = ({
    children,
    variant,
    color,
    absolute = false,
    top,
    right,
    bottom,
    left,
    className
}: BadgeProps) => {
    // Senza variante: `neutral`. Con `color` e senza variante il testo resta
    // bianco come prima (il fondo custom era sempre pieno e scuro).
    const resolved: BadgeVariant = variant ?? (color ? "primary" : "neutral");

    if (DEPRECATED_VARIANTS.has(resolved)) {
        warnDeprecated(`variant:${resolved}`, `variant="${resolved}"`);
    }
    if (color) warnDeprecated("color", "prop `color`");
    if (absolute) warnDeprecated("absolute", "prop `absolute` (e top/right/bottom/left)");

    // Il fondo custom era sempre pieno e scuro: il testo resta bianco in
    // entrambi i temi (non --on-brand, che nel tema scuro diventa scuro).
    const style: CSSProperties = {
        ...(color && {
            "--badge-bg": color,
            "--badge-color": "var(--color-white)"
        }),
        ...(absolute && {
            position: "absolute",
            top,
            right,
            bottom,
            left
        })
    } as CSSProperties;

    return (
        <Text
            variant="caption-xs"
            weight={500}
            className={clsx(styles.badge, styles[resolved], absolute && styles.absolute, className)}
            style={style}
            role="status"
        >
            {children}
        </Text>
    );
};
