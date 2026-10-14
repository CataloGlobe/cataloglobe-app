import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import styles from "./VoteHead.module.scss";

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Testata comune della modale piccola e del modulo (mockup v38): logo del
 * locale, domanda, una riga sotto e le cinque stelle. Identica nei due posti:
 * toccata una stella il foglio entra al posto della modale e sembra la stessa.
 */
export function VoteHead({
    titleId,
    logoUrl,
    venueName,
    subtitle,
    rating,
    onRate
}: {
    titleId: string;
    logoUrl: string | null;
    venueName: string;
    subtitle: string;
    /** Stelle accese (0 = nessuna). */
    rating: number;
    onRate: (value: number) => void;
}) {
    const { t } = useTranslation("public");
    // Già accese all'arrivo (il modulo, dalla modale): non si riaccendono.
    const [quiet, setQuiet] = useState(rating > 0);
    return (
        <div className={styles.head}>
            {logoUrl && (
                <img
                    src={logoUrl}
                    alt={t("header.logo_alt", { name: venueName })}
                    className={styles.logo}
                    decoding="async"
                    width={52}
                    height={52}
                />
            )}
            <h2 id={titleId} className={styles.title}>
                {t("page_end.rate_title")}
            </h2>
            <p className={styles.subtitle}>{subtitle}</p>
            <div className={styles.stars} role="group" aria-labelledby={titleId} data-quiet={quiet || undefined}>
                {STARS.map(value => (
                    <button
                        key={value}
                        type="button"
                        className={styles.star}
                        data-on={value <= rating || undefined}
                        // Le stelle si accendono una dopo l'altra (mockup v38).
                        style={{ "--i": value - 1 } as CSSProperties}
                        aria-pressed={value === rating}
                        aria-label={t("reviews.stars_aria", { count: value })}
                        onClick={() => {
                            setQuiet(false);
                            onRate(value);
                        }}
                    >
                        <Star size={36} strokeWidth={1.6} aria-hidden />
                    </button>
                ))}
            </div>
        </div>
    );
}
