import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Rileva se un contenitore scrollabile orizzontalmente ha contenuto oltre il
 * bordo destro, e se l'utente ha già scrollato via dal bordo sinistro.
 *
 * Usato da `Tabs` e `SegmentedControl` per mostrare la sfumatura sui bordi:
 * il calcolo vive DENTRO il componente (ResizeObserver proprio), non delegato
 * al genitore — così il fade resta corretto anche quando il contenitore cambia
 * larghezza senza che cambi il set di figli (es. passaggio a due righe della
 * header band).
 *
 * Tolleranza 1px: `scrollWidth`/`clientWidth` sono interi arrotondati e su
 * zoom/DPR frazionari differiscono di un pixel anche senza overflow reale.
 */
export function useHorizontalOverflow(ref: RefObject<HTMLElement | null>, signal?: unknown) {
    const [state, setState] = useState({ atStart: true, atEnd: true });
    // Evita un setState (e quindi un re-render) per ogni evento di scroll:
    // scrivere solo quando uno dei due flag cambia davvero.
    const lastRef = useRef(state);

    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) return;

        const maxScroll = el.scrollWidth - el.clientWidth;
        const next = maxScroll <= 1
            ? { atStart: true, atEnd: true }
            : { atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft >= maxScroll - 1 };

        const prev = lastRef.current;
        if (prev.atStart === next.atStart && prev.atEnd === next.atEnd) return;
        lastRef.current = next;
        setState(next);
    }, [ref]);

    useLayoutEffect(() => {
        measure();
    });

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new ResizeObserver(() => measure());
        observer.observe(el);
        // Osserva anche i figli diretti: il set di tab può restare lo stesso
        // mentre il testo cambia (label con conteggio, cambio lingua) — un RO
        // sul solo contenitore non se ne accorgerebbe.
        for (const child of Array.from(el.children)) {
            if (child instanceof HTMLElement) observer.observe(child);
        }

        el.addEventListener("scroll", measure, { passive: true });
        return () => {
            observer.disconnect();
            el.removeEventListener("scroll", measure);
        };
        // `signal` riaggancia gli observer quando cambia il set di figli (le tab
        // di una pagina diversa): i figli sono osservati per riferimento, quindi
        // senza questo il RO resterebbe agganciato ai nodi smontati.
    }, [ref, measure, signal]);

    return state;
}
