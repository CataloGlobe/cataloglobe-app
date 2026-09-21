import Text from "@/components/ui/Text/Text";
import styles from "./ProgressBar.module.scss";

/**
 * ProgressBar — quanto di un tutto, sempre con il numero accanto (design
 * system §5, scheda ProgressBar).
 *
 * Anatomia: traccia hover-bg · riempimento · etichetta a destra (caption, il
 * numero: «€ 4,20 di € 18», «3 di 4», «30 %»). Mai senza numero.
 * Varianti: brand (avanzamento) · success (completamento raggiunto) ·
 * warning (oltre l'80 % di un limite) · indeterminate (senza totale: riflesso
 * che scorre, come lo Skeleton). Altezza 6, radius-pill; cambia con
 * motion-base su transform (scaleX), mai su width.
 *
 * Non per un'attesa senza totale dentro un controllo (→ Button loading);
 * non per una percentuale confrontata fra sedi (→ BarList).
 */
export type ProgressBarVariant = "brand" | "success" | "warning" | "indeterminate";

export interface ProgressBarProps {
    /** 0–max; ignorato con `indeterminate`. */
    value?: number;
    max?: number;
    variant?: ProgressBarVariant;
    /** Il numero accanto, già formattato: «3 di 4», «30 %». Obbligatorio (mai senza numero). */
    label: string;
    /** Larghezza piena (default) o max 160 in una riga. */
    inline?: boolean;
    /** Etichetta accessibile della barra; default = label. */
    "aria-label"?: string;
    className?: string;
}

export function ProgressBar({ value = 0, max = 100, variant = "brand", label, inline = false, "aria-label": ariaLabel, className }: ProgressBarProps) {
    const indeterminate = variant === "indeterminate";
    const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
    return (
        <div className={[styles.root, inline ? styles.inline : "", className ?? ""].join(" ").trim()}>
            <div
                className={`${styles.track} ${styles[variant]}`}
                role="progressbar"
                aria-label={ariaLabel ?? label}
                aria-valuemin={0}
                aria-valuemax={indeterminate ? undefined : max}
                aria-valuenow={indeterminate ? undefined : value}
                aria-valuetext={label}
            >
                <div className={styles.fill} style={indeterminate ? undefined : { transform: `scaleX(${ratio})` }} />
            </div>
            <Text as="span" variant="caption" colorVariant="muted" className={styles.label}>
                {label}
            </Text>
        </div>
    );
}
