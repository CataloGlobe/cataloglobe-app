import { useState, type ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import styles from "./BarList.module.scss";

/**
 * BarList — una serie sola, a barre orizzontali: la lunghezza fa tutto il
 * lavoro (design system §5, scheda BarList). Distribuzione 1–5 delle
 * recensioni, parole cercate, prodotti più aperti.
 *
 * Righe: etichetta (body-sm, o un nodo: Rating, link) · barra (tinta unica
 * brand-primary, altezza 8, radius-inner) · conteggio (caption muto,
 * tabular-nums) a destra. La più lunga riempie la colonna; niente asse,
 * niente legenda. Riga 28, gap 8, etichetta max 40 %; una barra a zero
 * resta, con «0». Sotto soglia = conteggi, mai percentuali.
 *
 * Non per due serie, non per un andamento (→ TrendChart), non per una sola
 * cifra (→ StatCard).
 */
export interface BarListItem {
    id: string;
    /** Testo o nodo (Rating, link che apre un drawer). */
    label: ReactNode;
    value: number;
    /** Conteggio già formattato; default = value in it-IT. */
    valueLabel?: string;
}

export interface BarListProps {
    items: BarListItem[];
    /** Righe visibili prima di «Mostra altre» (5 o 10). Default: tutte. */
    limit?: number;
    /** 5 righe Skeleton. */
    loading?: boolean;
    /** Vuoto: «raccolte dal 19/09». */
    emptyTitle?: string;
    emptyDescription?: string;
    className?: string;
    "aria-label"?: string;
}

const nf = new Intl.NumberFormat("it-IT");

export function BarList({ items, limit, loading = false, emptyTitle = "Ancora nessun dato", emptyDescription, className, "aria-label": ariaLabel }: BarListProps) {
    const [expanded, setExpanded] = useState(false);

    if (loading) {
        return (
            <div className={`${styles.list} ${className ?? ""}`.trim()} aria-busy="true">
                {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className={styles.row}>
                        <Skeleton width="30%" height={14} radius="var(--radius-inner)" />
                        <Skeleton width={`${90 - i * 15}%`} height={8} radius="var(--radius-inner)" />
                        <Skeleton width={24} height={12} radius="var(--radius-inner)" />
                    </div>
                ))}
            </div>
        );
    }

    if (items.length === 0) {
        return <EmptyState variant="inline" title={emptyTitle} description={emptyDescription} />;
    }

    const max = Math.max(...items.map(i => i.value), 0);
    const hidden = limit !== undefined && !expanded ? Math.max(items.length - limit, 0) : 0;
    const shown = hidden > 0 ? items.slice(0, limit) : items;

    return (
        <div className={`${styles.list} ${className ?? ""}`.trim()} role="list" aria-label={ariaLabel}>
            {shown.map(item => {
                const ratio = max > 0 ? item.value / max : 0;
                return (
                    <div key={item.id} className={styles.row} role="listitem">
                        <div className={styles.label}>
                            {typeof item.label === "string" ? (
                                <Text as="span" variant="body-sm" className={styles.labelText}>
                                    {item.label}
                                </Text>
                            ) : (
                                item.label
                            )}
                        </div>
                        <div className={styles.track} aria-hidden="true">
                            <div className={styles.bar} style={{ transform: `scaleX(${ratio})` }} />
                        </div>
                        <Text as="span" variant="caption" colorVariant="muted" className={styles.value}>
                            {item.valueLabel ?? nf.format(item.value)}
                        </Text>
                    </div>
                );
            })}
            {hidden > 0 && (
                <div className={styles.more}>
                    <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
                        Mostra altre {hidden}
                    </Button>
                </div>
            )}
        </div>
    );
}
