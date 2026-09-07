import { useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import { useReadPageHeader } from "@/context/useReadPageHeader";
import { useCompactToolbar } from "@/hooks/useCompactToolbar";
import { PageHeaderCompactBar } from "./PageHeaderCompactBar";
import styles from "./PageHeaderSlot.module.scss";

interface PageHeaderSlotProps {
    /** Mantenuto per API stabilità (chiamato da MainLayout). Non più usato qui:
     *  l'animazione di shrink al scroll era legata al titolo, eliminato in questa
     *  fase. Verrà rimosso nel cleanup finale del refactor header. */
    scrollContainerRef?: RefObject<HTMLElement | null>;
}

/**
 * Banda contestuale della pagina: rende `leading` (sinistra) + `actions` (destra).
 * Il titolo/sottotitolo passati via `usePageHeader` vengono ignorati (vivono nel
 * NavbarBreadcrumb post-refactor).
 *
 * Due modalità, scelte da `useCompactToolbar` misurando il contenuto reale
 * contro lo spazio disponibile — mai da un breakpoint in px:
 *
 * - **comoda**: riga singola, tab a sinistra e cluster azioni a destra;
 * - **compatta**: `PageHeaderCompactBar`, una UI diversa costruita per
 *   progressive disclosure.
 *
 * Una pagina che non dichiara `compact` resta sempre in comoda: oggi non ne
 * esiste nessuna (tutte migrate), ma se ne nascesse una si comprimerebbe invece
 * di riorganizzarsi — è il segnale che le manca la config, non un ripiego da
 * mantenere.
 *
 * Il markup raw resta montato anche in compatto, nascosto e `inert`: è ciò che
 * si continua a misurare. Smontarlo azzererebbe la misura che ha deciso il
 * passaggio, e la banda oscillerebbe fra le due modalità a ogni frame.
 */
export function PageHeaderSlot(props: PageHeaderSlotProps) {
    void props;
    const config = useReadPageHeader();
    const { pathname } = useLocation();

    const rowRef = useRef<HTMLDivElement>(null);
    const leadingRef = useRef<HTMLDivElement>(null);
    const actionsRef = useRef<HTMLDivElement>(null);

    const isCompact = useCompactToolbar(rowRef, leadingRef, actionsRef, config);

    if (!config?.leading && !config?.actions) return null;

    const showCompactBar = isCompact && Boolean(config.compact);

    return (
        <div className={`${styles.slot} ${showCompactBar ? styles.compactMode : ""}`}>
            <div
                ref={rowRef}
                className={styles.rawRow}
                inert={showCompactBar || undefined}
                aria-hidden={showCompactBar || undefined}
            >
                {config.leading && (
                    <div ref={leadingRef} className={styles.leading}>
                        {config.leading}
                    </div>
                )}
                {config.actions && (
                    <div ref={actionsRef} className={styles.actions}>
                        {config.actions}
                    </div>
                )}
            </div>

            {/* `key={pathname}`: la banda vive nel layout e non si smonta cambiando
                pagina, quindi lo stato transiente della barra compatta —
                l'overlay di ricerca aperto, un menu a tendina aperto (lo stato è
                interno a Radix, non nostro) — sopravviverebbe alla navigazione e
                si ritroverebbe sulla pagina nuova. La chiave rimonta la sola
                barra compatta: la riga raw, che è ciò che si misura, resta
                intatta. Non dipende dalla query string di proposito — cambiare
                sezione (`?tab=`) non deve chiudere la ricerca in corso. */}
            {showCompactBar && config.compact && (
                <PageHeaderCompactBar key={pathname} config={config.compact} />
            )}
        </div>
    );
}
