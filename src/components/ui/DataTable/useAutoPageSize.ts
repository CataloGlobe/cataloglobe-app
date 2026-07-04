// src/components/ui/DataTable/useAutoPageSize.ts
import { RefObject, useEffect, useRef, useState } from "react";
import {
    AMBIGUITY_TOLERANCE_PX,
    applyHysteresis,
    averageRowHeight,
    computeFit,
    resolveAvailable,
    type HysteresisState
} from "./autoPageSize";

const ROW_SAMPLE_SIZE = 5;
// Bordi top/bottom del root .table (1px + 1px) non inclusi in header/footer.
const BORDERS_PX = 2;

/**
 * Segnale STRUTTURALE (non basato sull'altezza) per distinguere probe vincolato
 * da contenitore non vincolato. Il probe è stretchato quando il suo genitore è
 * un flex/grid a colonna e il probe ha `flex-grow > 0`: in quel caso l'altezza
 * del probe è imposta dal parent (catena flex vincolata a monte), indipendente
 * dal contenuto. Un genitore block dà invece probe = altezza-contenuto → NON
 * stretchato → si applica il fallback diff-based di `resolveAvailable`.
 */
function isProbeStretchedByParent(probe: HTMLElement): boolean {
    const parent = probe.parentElement;
    if (!parent) return false;
    const ps = getComputedStyle(parent);
    const isFlexOrGrid =
        ps.display === "flex" || ps.display === "inline-flex" || ps.display === "grid";
    if (!isFlexOrGrid) return false;
    // grid: l'asse di blocco è verticale; flex: serve la colonna.
    const column = ps.display === "grid" || ps.flexDirection === "column";
    if (!column) return false;
    return (parseFloat(getComputedStyle(probe).flexGrow) || 0) > 0;
}

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
    /** true se il chiamante ha passato `maxHeight` esplicitamente (tetto voluto). */
    maxHeightIsExplicit: boolean;
}

export interface AutoPageSizeResult {
    /** Righe per pagina calcolate dallo spazio reale. null finché non misurato. */
    fit: number | null;
    /**
     * Altezza reale (px) da applicare come `max-height` inline sul `.table`,
     * quando `maxHeightIsExplicit` è false e il probe è vincolato/non-ambiguo.
     * null quando il chiamante deve continuare a usare il proprio `maxHeight`
     * (esplicito, o nessuna misura ancora disponibile/ramo ambiguo) — vedi
     * `resolveAvailable`: il default CSS è solo rete di sicurezza pre-misura,
     * NON deve capare un box che il probe misura più alto.
     */
    measuredHeightPx: number | null;
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
    sampleKey,
    maxHeightIsExplicit
}: UseAutoPageSizeArgs): AutoPageSizeResult {
    const [fit, setFit] = useState<number | null>(null);
    const [measuredHeightPx, setMeasuredHeightPx] = useState<number | null>(null);
    const hysteresisRef = useRef<HysteresisState | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!enabled) {
            // Uscita dalla modalità auto: lo stato di isteresi vale solo per
            // continuità DENTRO una sessione di misura viva — azzerarlo qui fa
            // sì che il rientro in auto riparta dal ramo "prima misura".
            // `fit` resta: alla riattivazione evita il flash sul fallback 25.
            hysteresisRef.current = null;
            setMeasuredHeightPx(null);
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

            const probeHeightPx = probe.offsetHeight;
            const contentHeightPx = table.scrollHeight;
            const isProbeStretched = isProbeStretchedByParent(probe);
            const available = resolveAvailable({
                probeHeightPx,
                contentHeightPx,
                maxHeightPx,
                maxHeightIsExplicit,
                isProbeStretched
            });
            const candidate = computeFit(available, chromePx, avg);
            if (candidate == null) return;

            const next: HysteresisState =
                hysteresisRef.current == null
                    ? { applied: candidate, pending: null } // prima misura: applica
                    : applyHysteresis(hysteresisRef.current, candidate);
            hysteresisRef.current = next;
            setFit(prev => (prev === next.applied ? prev : next.applied));

            // Ramo non-ambiguo + maxHeight default: il box del `.table` deve
            // poter crescere fino al probe reale, non restare capato dal
            // default CSS (vedi resolveAvailable). Ramo ambiguo/esplicito:
            // nessun override, il chiamante continua a usare il proprio
            // `maxHeight` statico — comportamento invariato.
            // Stessa logica di resolveAvailable: il probe stretchato non è mai
            // ambiguo anche con diff piccolo (tabella che riempie il probe).
            const ambiguous =
                Math.abs(probeHeightPx - contentHeightPx) <= AMBIGUITY_TOLERANCE_PX &&
                !isProbeStretched;
            const nextMeasuredHeightPx =
                !ambiguous && !maxHeightIsExplicit ? available : null;
            setMeasuredHeightPx(prev =>
                prev === nextMeasuredHeightPx ? prev : nextMeasuredHeightPx
            );
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
    }, [
        enabled,
        sampleKey,
        probeRef,
        tableRef,
        headerRef,
        footerRef,
        bodyRef,
        rowClassName,
        maxHeightIsExplicit
    ]);

    return enabled
        ? { fit, measuredHeightPx }
        : { fit: null, measuredHeightPx: null };
}
