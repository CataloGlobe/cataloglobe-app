import { useEffect, type RefObject } from "react";

/**
 * Quanto la tastiera copre il fondo dello schermo (iOS: il layout non si
 * accorcia, si accorcia solo la finestra visibile). Scritto in
 * `--keyboard-inset` sull'elemento, che lo usa come spazio in fondo: gli
 * ultimi risultati si possono portare sopra la tastiera.
 */
export function useKeyboardInset(ref: RefObject<HTMLElement | null>): void {
    useEffect(() => {
        const viewport = window.visualViewport;
        const element = ref.current;
        if (!viewport || !element) return;
        let frame = 0;
        const update = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
                element.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
            });
        };
        update();
        viewport.addEventListener("resize", update);
        viewport.addEventListener("scroll", update);
        return () => {
            cancelAnimationFrame(frame);
            viewport.removeEventListener("resize", update);
            viewport.removeEventListener("scroll", update);
        };
    }, [ref]);
}
