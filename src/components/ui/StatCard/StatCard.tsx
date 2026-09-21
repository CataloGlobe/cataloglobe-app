import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { Card } from "@/components/ui/Card/Card";
import styles from "./StatCard.module.scss";

/**
 * StatCard — una cifra, adesso, rispetto a prima (design system §5, scheda
 * StatCard). Variante di `Card`: stessa superficie, padding 24.
 *
 * Anatomia: etichetta `caption` muta · numero `title-lg` 700 tabular ·
 * riga delta (freccia + valore + periodo, colore con segno) · link «Vedi».
 * Varianti: `delta` (con confronto) · `plain` (senza) · `hero` (numero più
 * grande, una sola per pagina). Sotto soglia il delta non si mostra e la
 * riga dice il conteggio («9 su 151»). Max tre per riga: lo decide la pagina.
 *
 * Non per un dato senza confronto né azione (→ una riga di testo), non per lo
 * stato di pagina (→ StatusStrip), non per un contatore in una tab (→ Badge).
 */
export interface StatCardDelta {
    /** Variazione: il segno decide colore e freccia. */
    value: number;
    /** «vs 30 giorni prima», «rispetto a ieri». */
    period: string;
    /** Come si legge il valore: percentuale (default) o numero assoluto. */
    format?: "percent" | "number";
}

export interface StatCardLink {
    to: string;
    /** Default «Vedi». */
    label?: string;
}

export interface StatCardProps {
    label: string;
    /** Già formattato dal chiamante (valuta, unità); qui solo tabular-nums. */
    value: ReactNode;
    /** Con delta = variante `delta`; senza = `plain`. */
    delta?: StatCardDelta;
    /** Numero più grande. Una sola per pagina. */
    variant?: "delta" | "plain" | "hero";
    /**
     * Sotto soglia (es. < 100 visite): il delta non si mostra e la riga
     * dice il conteggio, «9 su 151».
     */
    sample?: { count: number; total: number };
    link?: StatCardLink;
    /** Skeleton delle tre righe. */
    loading?: boolean;
    /** Sotto la riga delta: distribuzione, sparkline, una nota. */
    children?: ReactNode;
    className?: string;
}

const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

function formatDelta({ value, format = "percent" }: StatCardDelta) {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    const abs = nf.format(Math.abs(value));
    return format === "percent" ? `${sign}${abs}%` : `${sign}${abs}`;
}

export function StatCard({ label, value, delta, variant, sample, link, loading = false, children, className }: StatCardProps) {
    const resolved = variant ?? (delta ? "delta" : "plain");
    const hero = resolved === "hero";

    if (loading) {
        return (
            <Card className={`${styles.card} ${className ?? ""}`.trim()} bodyClassName={styles.body}>
                <Skeleton width="40%" height={12} radius="var(--radius-inner)" />
                <Skeleton width="55%" height={hero ? 40 : 28} radius="var(--radius-inner)" />
                <Skeleton width="70%" height={12} radius="var(--radius-inner)" />
            </Card>
        );
    }

    const trend = delta ? (delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat") : null;
    const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;

    return (
        <Card className={`${styles.card} ${className ?? ""}`.trim()} bodyClassName={styles.body}>
            <Text as="div" variant="caption" colorVariant="muted" className={styles.label}>
                {label}
            </Text>
            <Text as="div" variant={hero ? "display" : "title-lg"} weight={700} className={styles.value}>
                {value}
            </Text>
            {sample ? (
                <Text as="div" variant="caption" colorVariant="muted" className={styles.sample}>
                    {nf.format(sample.count)} su {nf.format(sample.total)}
                </Text>
            ) : (
                delta &&
                resolved !== "plain" && (
                    <div className={`${styles.delta} ${styles[`trend_${trend}`]}`}>
                        <TrendIcon size={14} strokeWidth={2.25} aria-hidden="true" />
                        <Text as="span" variant="caption" weight={600} className={styles.deltaValue}>
                            {formatDelta(delta)}
                        </Text>
                        <Text as="span" variant="caption" colorVariant="muted">
                            {delta.period}
                        </Text>
                    </div>
                )
            )}
            {children && <div className={styles.extra}>{children}</div>}
            {link && (
                <Link to={link.to} className={styles.link}>
                    <Text as="span" variant="caption" weight={500} colorVariant="primary">
                        {link.label ?? "Vedi"}
                    </Text>
                </Link>
            )}
        </Card>
    );
}
