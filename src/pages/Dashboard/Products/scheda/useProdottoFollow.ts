import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ProdottoPart, ProdottoZone } from "./prodottoCopy";

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
 * Gli agganci fra pagina e telefono (artifact, `ANCH`): quando il primo
 * riquadro di un gruppo arriva in cima alla pagina, la prima delle sue parti
 * che c'è sul telefono arriva in cima allo schermo.
 */
const ANCHORS: { zone: ProdottoZone; parts: ProdottoPart[] }[] = [
    { zone: "sotto", parts: ["caratteristiche", "allergeni", "prezzo"] },
    { zone: "ordina", parts: ["scelte", "abbinamenti"] },
    { zone: "basso", parts: ["ingredienti", "note"] }
];

/**
 * La pagina guida il telefono (C+++ della sede, `useSchedaFollow`): un
 * aggancio per gruppo, in mezzo si interpola; passare col puntatore non lo
 * muove mai. Ritorna la zona a cui si è arrivati, per la card «Sul telefono».
 */
export function useProdottoFollow(
    rootRef: RefObject<HTMLElement | null>,
    scrRef: RefObject<HTMLElement | null>,
    paused: boolean
): ProdottoZone {
    const [zone, setZone] = useState<ProdottoZone>("cima");
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
        const sRect = scr.getBoundingClientRect();
        const sTop = sRect.top;
        // Il telefono può essere rimpicciolito (D123): le distanze a schermo
        // dentro di lui si riportano alla sua misura vera prima di sommarle a scrollTop.
        const ratio = scr.clientHeight ? sRect.height / scr.clientHeight || 1 : 1;
        const firstTile = (z: ProdottoZone) => root.querySelector<HTMLElement>(`[data-g="${z}"] [data-k]`);

        if (!pausedRef.current) {
            let z: ProdottoZone = "cima";
            for (const k of [...ANCHORS.map(a => a.zone), "voi" as const]) {
                const t = firstTile(k);
                if (t && t.getBoundingClientRect().top - cTop < viewH * 0.45) z = k;
            }
            if (cMax > 0 && C.scrollTop >= cMax - 2 && firstTile("voi")) z = "voi";
            setZone(prev => (prev === z ? prev : z));
        }
        if (cMax <= 0 || pMax <= 0) return;

        const A: [number, number][] = [[0, 0]];
        for (const { zone: z, parts } of ANCHORS) {
            const t = firstTile(z);
            const pe = parts
                .map(p => scr.querySelector<HTMLElement>(`[data-part="${p}"]`))
                .find(Boolean);
            if (!t || !pe) continue;
            const sy = Math.min(cMax, t.getBoundingClientRect().top - cTop + C.scrollTop - 24);
            const py = Math.min(pMax, Math.max(0, (pe.getBoundingClientRect().top - sTop) / ratio + scr.scrollTop - 40));
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
