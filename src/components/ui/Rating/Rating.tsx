import { Star } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import styles from "./Rating.module.scss";

/**
 * Rating — le stelle di una recensione, in sola lettura, col numero accanto
 * (design system §5, scheda Rating).
 *
 * 5 stelle 12 (sm, righe) o 16 (md, dettaglio): piene warning-500, vuote
 * gray-300; numero a destra in caption. `hero`: numero title-lg, stelle
 * sotto, «su 5 · 3 recensioni». Gap 2 fra le stelle, 6 fra stelle e numero.
 * Mai interattivo nel back office.
 */
export interface RatingProps {
    /** 0–5, anche decimale: le stelle si riempiono per intero (arrotondato). */
    value: number;
    size?: "sm" | "md" | "hero";
    /** Mostra il numero accanto (default sì). Formattato it-IT, una cifra decimale. */
    showValue?: boolean;
    /** Solo `hero`: «3 recensioni». */
    countLabel?: string;
    className?: string;
}

const nf = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function Rating({ value, size = "sm", showValue = true, countLabel, className }: RatingProps) {
    const clamped = Math.min(Math.max(value, 0), 5);
    const filled = Math.round(clamped);
    const stars = (
        <span className={styles.stars} aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className={i < filled ? styles.full : styles.empty} />
            ))}
        </span>
    );
    const label = `${nf.format(clamped)} su 5`;

    if (size === "hero") {
        return (
            <div className={`${styles.root} ${styles.hero} ${className ?? ""}`.trim()} role="img" aria-label={countLabel ? `${label} · ${countLabel}` : label}>
                <Text as="div" variant="title-lg" weight={700} className={styles.heroValue}>
                    {nf.format(clamped)}
                </Text>
                {stars}
                <Text as="div" variant="caption" colorVariant="muted">
                    su 5{countLabel ? ` · ${countLabel}` : ""}
                </Text>
            </div>
        );
    }

    return (
        <span className={[styles.root, styles[size], className ?? ""].join(" ").trim()} role="img" aria-label={label}>
            {stars}
            {showValue && (
                <Text as="span" variant="caption" colorVariant="muted" className={styles.value}>
                    {nf.format(clamped)}
                </Text>
            )}
        </span>
    );
}
