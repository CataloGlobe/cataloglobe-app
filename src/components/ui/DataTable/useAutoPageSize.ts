// src/components/ui/DataTable/useAutoPageSize.ts
import { RefObject, useEffect, useRef, useState } from "react";
import {
    applyHysteresis,
    averageRowHeight,
    computeFit,
    resolveAvailable,
    type HysteresisState
} from "./autoPageSize";

const ROW_SAMPLE_SIZE = 5;
// Bordi top/bottom del root .table (1px + 1px) non inclusi in header/footer.
const BORDERS_PX = 2;

interface UseAutoPageSizeArgs {
    /** false quando la selezione è manuale/"all": nessuna misura. */
    enabled: boolean;
    probeRef: RefObject<HTMLDivElement | null>;
    tableRef: RefObject<HTMLDivElement | null>;
    headerRef: RefObject<HTMLDivElement | null>;
    footerRef: RefObject<HTMLDivElement | null>;
    bodyRef: RefObject<HTMLDivElement | null>;
    /** Classe CSS-module delle righe (styles.row) per il campionamento. */
    rowClassName: string;
    /** Cambia quando cambia il set di righe visibili (pagina/filtri/dataset). */
    sampleKey: string;
}

/**
 * Righe per pagina calcolate dallo spazio reale. null finché non misurato
 * (il chiamante usa FALLBACK_PAGE_SIZE). Ricalcola su resize del probe e su
 * cambio del set visibile (sampleKey), con cap di 1 misura per frame e
 * isteresi anti-oscillazione (vedi autoPageSize.ts).
 */
export function useAutoPageSize({
    enabled,
    probeRef,
    tableRef,
    headerRef,
    footerRef,
    bodyRef,
    rowClassName,
    sampleKey
}: UseAutoPageSizeArgs): number | null {
    const [fit, setFit] = useState<number | null>(null);
    const hysteresisRef = useRef<HysteresisState | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!enabled) {
            // Uscita dalla modalità auto: lo stato di isteresi vale solo per
            // continuità DENTRO una sessione di misura viva — azzerarlo qui fa
            // sì che il rientro in auto riparta dal ramo "prima misura".
            // `fit` resta: alla riattivazione evita il flash sul fallback 25.
            hysteresisRef.current = null;
            return;
        }
        const probe = probeRef.current;
        const table = tableRef.current;
        if (!probe || !table) return;

        const measure = () => {
            rafRef.current = null;
            const body = bodyRef.current;
            if (!body) return;

            const rows = Array.from(
                body.querySelectorAll<HTMLElement>(`.${rowClassName}`)
            ).slice(0, ROW_SAMPLE_SIZE);
            const avg = averageRowHeight(rows.map(r => r.offsetHeight));
            if (avg == null) return; // loading/empty: nessuna riga da misurare

            const maxHeightPx = parseFloat(getComputedStyle(table).maxHeight);
            if (!Number.isFinite(maxHeightPx) || maxHeightPx <= 0) return;

            const chromePx =
                (headerRef.current?.offsetHeight ?? 0) +
                (footerRef.current?.offsetHeight ?? 0) +
                BORDERS_PX;

            const available = resolveAvailable({
                probeHeightPx: probe.offsetHeight,
                contentHeightPx: table.scrollHeight,
                maxHeightPx
            });
            const candidate = computeFit(available, chromePx, avg);
            if (candidate == null) return;

            const next: HysteresisState =
                hysteresisRef.current == null
                    ? { applied: candidate, pending: null } // prima misura: applica
                    : applyHysteresis(hysteresisRef.current, candidate);
            hysteresisRef.current = next;
            setFit(prev => (prev === next.applied ? prev : next.applied));
        };

        const schedule = () => {
            if (rafRef.current != null) return; // cap: 1 misura per frame
            rafRef.current = requestAnimationFrame(measure);
        };

        schedule();
        const ro = new ResizeObserver(schedule);
        ro.observe(probe);
        // Window resize: necessario per il caso fallback (contenitore non
        // vincolato) — lì il probe NON cambia dimensione al resize finestra,
        // ma maxHeight (calc su 100dvh) sì. Senza questo listener il ricalcolo
        // non scatterebbe mai al ridimensionamento su quelle pagine.
        window.addEventListener("resize", schedule, { passive: true });
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", schedule);
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        };
    }, [enabled, sampleKey, probeRef, tableRef, headerRef, footerRef, bodyRef, rowClassName]);

    return enabled ? fit : null;
}
