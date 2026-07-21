import { useState } from "react";
import styles from "./StarRating.module.scss";

/* ── Star SVG ────────────────────────────────────────── */

export function StarIcon({ filled, size = "default" }: { filled: boolean; size?: "default" | "mini" }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={
                size === "mini"
                    ? (filled ? styles.miniStarFilled : styles.miniStarEmpty)
                    : (filled ? styles.starSvgFilled : styles.starSvgEmpty)
            }
        >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
    );
}

/* ── Component ───────────────────────────────────────── */

export type StarRatingProps = {
    /** Voto corrente (read-only) o voto selezionato (interattivo). */
    value: number;
    /** Presente → riga interattiva (click/hover). Assente → read-only, 5 icone nude senza wrapper. */
    onSelect?: (rating: number) => void;
    /** default = riga interattiva 40px (schermata "stars"). mini = 15px read-only (summary card). */
    size?: "default" | "mini";
    /** aria-label del gruppo (solo interattivo). */
    ariaLabel?: string;
    /** aria-label per singola stella (solo interattivo). */
    getStarAriaLabel?: (rating: number) => string;
};

export default function StarRating({
    value,
    onSelect,
    size = "default",
    ariaLabel,
    getStarAriaLabel,
}: StarRatingProps) {
    const [hoverStars, setHoverStars] = useState(0);

    if (!onSelect) {
        return (
            <>
                {[1, 2, 3, 4, 5].map((n) => (
                    <StarIcon key={n} filled={n <= value} size="mini" />
                ))}
            </>
        );
    }

    const displayValue = hoverStars || value;

    return (
        <div className={styles.starsRow} role="group" aria-label={ariaLabel}>
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    className={styles.starBtn}
                    onMouseEnter={() => {
                        // No-op su touch: il tap non deve attivare l'hover-preview
                        // delle stelle (sticky finché si tappa altrove).
                        if (window.matchMedia("(hover: none)").matches) return;
                        setHoverStars(n);
                    }}
                    onMouseLeave={() => {
                        if (window.matchMedia("(hover: none)").matches) return;
                        setHoverStars(0);
                    }}
                    onClick={() => onSelect(n)}
                    aria-label={getStarAriaLabel?.(n)}
                >
                    <StarIcon filled={displayValue >= n} size={size} />
                </button>
            ))}
        </div>
    );
}
