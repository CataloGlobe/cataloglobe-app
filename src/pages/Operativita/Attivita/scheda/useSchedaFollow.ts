import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { FOLLOW_ANCHORS, type SchedaZone } from "./schedaCopy";

/** Il primo antenato che scorre davvero (il contenuto del layout). */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
    let p = el?.parentElement ?? null;
    while (p) {
        const oy = getComputedStyle(p).overflowY;
        if (oy === "auto" || oy === "scroll") return p;
        p = p.parentElement;
    }
    return (document.scrollingElement as HTMLElement | null) ?? null;
}

/**
 * La scheda guida il telefono (prototipo C+++, `qFollow`): un aggancio per
 * riga — quando la riga arriva in cima alla scheda, la sua parte arriva in
 * cima al telefono — e in mezzo si interpola. Passare col puntatore non lo
 * muove mai. Ritorna la zona a cui si è arrivati, per la card «Sul telefono».
 */
export function useSchedaFollow(
    rootRef: RefObject<HTMLElement | null>,
    scrRef: RefObject<HTMLElement | null>,
    paused: boolean
): SchedaZone {
    const [zone, setZone] = useState<SchedaZone>("locale");
    const pausedRef = useRef(paused);
    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);

    const follow = useCallback(() => {
        const root = rootRef.current;
        const scr = scrRef.current;
        if (!root || !scr) return;
        const C = scrollParent(root);
        if (!C) return;
        const isDoc = C === document.scrollingElement;
        const cTop = isDoc ? 0 : C.getBoundingClientRect().top;
        const viewH = isDoc ? window.innerHeight : C.clientHeight;
        const cMax = C.scrollHeight - viewH;
        const pMax = Math.max(0, scr.scrollHeight - scr.clientHeight);
        if (cMax <= 0) return;
        const sTop = scr.getBoundingClientRect().top;

        // La zona per la card «Sul telefono» non dipende da quanto scorre il
        // telefono: anche quando ci sta quasi tutto, la card segue la scheda.
        if (!pausedRef.current) {
            let z: SchedaZone = "locale";
            for (const k of FOLLOW_ANCHORS) {
                const t = root.querySelector<HTMLElement>(`[data-k="${k}"]`);
                if (t && t.getBoundingClientRect().top - cTop < viewH * 0.45) z = k as SchedaZone;
            }
            if (C.scrollTop >= cMax - 2) z = "dove";
            setZone(prev => (prev === z ? prev : z));
        }
        if (pMax <= 0) return;

        const A: [number, number][] = [[0, 0]];
        for (const k of FOLLOW_ANCHORS) {
            const t = root.querySelector<HTMLElement>(`[data-k="${k}"]`);
            const pe = scr.querySelector<HTMLElement>(`[data-part="${k}"]`);
            if (!t || !pe) continue;
            const sy = Math.min(cMax, t.getBoundingClientRect().top - cTop + C.scrollTop - 24);
            const py = Math.min(pMax, Math.max(0, pe.getBoundingClientRect().top - sTop + scr.scrollTop - 40));
            const last = A[A.length - 1];
            if (sy > last[0] && py >= last[1]) A.push([sy, py]);
        }
        if (A[A.length - 1][0] < cMax) A.push([cMax, pMax]);
        else A[A.length - 1][1] = pMax;

        const y = C.scrollTop;
        let i = 0;
        while (i < A.length - 2 && y > A[i + 1][0]) i++;
        const [d0, p0] = A[i];
        const [d1, p1] = A[i + 1];
        const target = p0 + (p1 - p0) * Math.min(1, Math.max(0, (y - d0) / (d1 - d0 || 1)));

        scr.scrollTop = Math.round(target);
    }, [rootRef, scrRef]);

    useEffect(() => {
        const C = scrollParent(rootRef.current);
        const target: HTMLElement | Window | null = C === document.scrollingElement ? window : C;
        if (!target) return;
        const onScroll = () => follow();
        target.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            target.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, [follow, rootRef]);

    // Dopo ogni disegno (un testo più lungo sposta gli agganci).
    useEffect(() => {
        follow();
    });

    return zone;
}
