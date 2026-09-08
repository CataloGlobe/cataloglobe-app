import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import styles from "./PrerequisitesRow.module.scss";

export interface PrerequisiteItem {
    id: string;
    /** Etichetta della condizione, letta sia quando è a posto sia quando manca
     *  (es. "Orari di apertura configurati"). */
    label: string;
    ok: boolean;
    /** Cosa non funziona finché manca. Mostrata solo se `ok === false`. */
    consequence?: string;
    /** Rimando dove si risolve: un href (tab della sede o pagina esterna)
     *  oppure una callback. Il componente non distingue i due casi. */
    actionLabel?: string;
    href?: string;
    onAction?: () => void;
}

interface PrerequisitesRowProps {
    /** Cosa deve essere vero perché il canale sia pronto. */
    items: PrerequisiteItem[];
    /** Finché i dati non sono arrivati non si dichiara nulla: né manca, né a posto. */
    loading?: boolean;
}

/**
 * Risponde a una domanda sola: questo canale è pronto?
 *
 * - Manca qualcosa → pannello ambra: voci con le mancanti in evidenza e il
 *   rimando dove si risolvono; sotto, la conseguenza di ciascuna mancanza.
 * - Non manca niente → riga sottile con spunta che elenca cosa è a posto.
 *   NON un pannello verde: un avviso che c'è sempre smette di essere un avviso.
 *
 * Nessuna logica di dominio, nessun fetch: le voci arrivano dal chiamante.
 */
export function PrerequisitesRow({ items, loading = false }: PrerequisitesRowProps) {
    if (loading || items.length === 0) return null;

    const missing = items.filter(i => !i.ok);

    if (missing.length === 0) {
        return (
            <p className={styles.thin} role="status">
                <Check size={14} strokeWidth={2.25} aria-hidden />
                <span className={styles.thinText}>
                    {items.map((item, idx) => (
                        <React.Fragment key={item.id}>
                            {idx > 0 && <span className={styles.sep} aria-hidden>·</span>}
                            {item.label}
                        </React.Fragment>
                    ))}
                </span>
            </p>
        );
    }

    return (
        <div className={styles.panel} role="status">
            <div className={styles.panelHead}>
                <AlertTriangle size={16} strokeWidth={2} aria-hidden />
                <span>
                    {missing.length === 1
                        ? "Manca un prerequisito"
                        : `Mancano ${missing.length} prerequisiti`}
                </span>
            </div>
            <ul className={styles.list}>
                {items.map(item => (
                    <li
                        key={item.id}
                        className={`${styles.item} ${item.ok ? styles.itemOk : styles.itemMissing}`}
                    >
                        <span className={styles.itemIcon} aria-hidden>
                            {item.ok ? (
                                <Check size={14} strokeWidth={2.25} />
                            ) : (
                                <span className={styles.dot} />
                            )}
                        </span>
                        <span className={styles.itemLabel}>{item.label}</span>
                        {!item.ok && item.actionLabel && (
                            item.href ? (
                                <Link to={item.href} className={styles.action}>
                                    {item.actionLabel}
                                    <ArrowRight size={12} aria-hidden />
                                </Link>
                            ) : item.onAction ? (
                                <button type="button" className={styles.action} onClick={item.onAction}>
                                    {item.actionLabel}
                                    <ArrowRight size={12} aria-hidden />
                                </button>
                            ) : null
                        )}
                    </li>
                ))}
            </ul>
            {missing.some(m => m.consequence) && (
                <p className={styles.consequence}>
                    {missing
                        .filter(m => m.consequence)
                        .map(m => m.consequence)
                        .join(" ")}
                </p>
            )}
        </div>
    );
}
