import { useLayoutEffect, useRef, useState } from "react";

/**
 * Riga compatta della D (Recensioni e Clienti, v28 `.tight`): dice se i chip
 * interi non ci stanno nella riga `el`. Allora la pagina lascia solo il chip
 * scelto, invece di tagliarne uno a metà parola.
 *
 * La larghezza piena si misura quando i chip sono tutti a vista (`data-tight`
 * assente sulla riga o su un suo contenitore), così nascondendoli non si torna
 * subito indietro.
 */
export function useTightRow(el: HTMLElement | null, on: boolean): boolean {
    const [tight, setTight] = useState(false);
    const full = useRef(0);

    useLayoutEffect(() => {
        if (!on || !el) {
            setTight(false);
            return;
        }
        const check = () => {
            if (!el.closest("[data-tight]")) full.current = el.scrollWidth;
            setTight(full.current > el.clientWidth + 1);
        };
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [el, on]);

    return tight;
}
