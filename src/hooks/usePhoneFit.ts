import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/** Quanto può scendere il telefono: sotto, il testo dentro non si legge più. */
export const PHONE_MIN_SCALE = 0.7;
/** Quanto si guadagna quando la card «Sul telefono» diventa una riga (84 → 36). */
const SLIM_SAVES = 48;

function scrollParent(el: HTMLElement | null): HTMLElement | null {
    let p = el?.parentElement ?? null;
    while (p) {
        const oy = getComputedStyle(p).overflowY;
        if (oy === "auto" || oy === "scroll") return p;
        p = p.parentElement;
    }
    return (document.scrollingElement as HTMLElement | null) ?? null;
}

export interface PhoneFit {
    /** Il telefono rimpicciolito intero, da 1 a `PHONE_MIN_SCALE`. */
    scale: number;
    /** La card sopra il telefono è una riga sola (il titolo, senza la frase). */
    slim: boolean;
    /** Per il contenitore della colonna: `--phone-s`, che stringe anche la colonna. */
    vars: CSSProperties;
    /** Per la scatola del telefono: la misura che il telefono occupa davvero. */
    boxStyle: CSSProperties;
}

/**
 * Il telefono della Scheda nelle finestre basse (D123, scelta B): non si
 * schiaccia mai. Se la colonna non ci sta nell'altezza che resta, prima la
 * card «Sul telefono» diventa una riga sola, poi il telefono si rimpicciolisce
 * intero, in proporzione, fino al 70%; la sua colonna si stringe con lui.
 *
 * `asideRef` è la colonna (sticky), `boxRef` la scatola attorno al telefono.
 * `hasCard`: la colonna ha la card che può farsi sottile.
 * `topOffset`: l'altezza che la colonna lascia sopra di sé quando resta
 * ferma (i tunnel di creazione: la testata con i passi).
 */
export function usePhoneFit(
    asideRef: RefObject<HTMLElement | null>,
    boxRef: RefObject<HTMLElement | null>,
    hasCard: boolean,
    topOffset = 0
): PhoneFit {
    const [fit, setFit] = useState({ scale: 1, slim: false, w: 300, h: 0 });

    const measure = useCallback(() => {
        const aside = asideRef.current;
        const box = boxRef.current;
        const phone = box?.firstElementChild as HTMLElement | null;
        if (!aside || !box || !phone) return;
        const C = scrollParent(aside);
        if (!C) return;
        const isDoc = C === document.scrollingElement;
        const cs = getComputedStyle(C);
        const avail =
            (isDoc ? window.innerHeight : C.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) - topOffset;
        // Le misure vere del telefono: offsetWidth/Height non sentono la scala.
        const pw = phone.offsetWidth;
        const ph = phone.offsetHeight;
        if (!ph || avail <= 0) return;
        setFit(prev => {
            // Il resto della colonna (card, didascalie, distanze) com'è adesso,
            // riportato alla card piena.
            const others = aside.offsetHeight - box.offsetHeight + (prev.slim ? SLIM_SAVES : 0);
            let slim = false;
            let room = avail - others;
            if (room < ph && hasCard) {
                slim = true;
                room += SLIM_SAVES;
            }
            const scale = Math.max(PHONE_MIN_SCALE, Math.min(1, room / ph));
            const s = Math.round(scale * 1000) / 1000;
            const next = { scale: s, slim, w: pw, h: ph };
            return prev.scale === s && prev.slim === slim && prev.w === pw && prev.h === ph ? prev : next;
        });
    }, [asideRef, boxRef, hasCard, topOffset]);

    useLayoutEffect(() => {
        measure();
    });

    useEffect(() => {
        const aside = asideRef.current;
        const C = scrollParent(aside);
        const ro = new ResizeObserver(() => measure());
        if (C && C !== document.scrollingElement) ro.observe(C);
        if (aside) ro.observe(aside);
        window.addEventListener("resize", measure);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [asideRef, measure]);

    const { scale, slim, w, h } = fit;
    return {
        scale,
        slim,
        vars: { "--phone-s": scale } as CSSProperties,
        boxStyle: h ? { width: Math.round(w * scale), height: Math.round(h * scale) } : {}
    };
}
