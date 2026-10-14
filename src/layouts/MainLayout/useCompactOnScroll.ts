import { useEffect, useState, type RefObject } from "react";

/** Si compatta oltre questo scorrimento… */
const COMPACT_AT = 20;
/** …e si riapre solo tornando quasi in cima: i 12 px in mezzo tolgono lo sfarfallio (v30). */
const OPEN_AT = 8;

/**
 * D, tablet e telefono (artifact v30): scorrendo il contenuto la testata e la
 * riga dei comandi si compattano, tornando in cima si riaprono.
 *
 * Compattare la testata allunga il riquadro che scorre: su una pagina corta
 * il browser riporterebbe indietro lo scorrimento e la testata si
 * riaprirebbe, in un giro senza fine. Per questo in fondo al contenuto c'è un
 * distanziatore (`spacerRef`) alto quanto serve a non far tornare indietro lo
 * scorrimento, e mai di più: su una pagina lunga resta a zero.
 */
export function useCompactOnScroll(
    contentRef: RefObject<HTMLElement | null>,
    spacerRef: RefObject<HTMLElement | null>,
    enabled: boolean
): boolean {
    const [compact, setCompact] = useState(false);

    useEffect(() => {
        const content = contentRef.current;
        const spacer = spacerRef.current;
        if (!enabled || !content || !spacer) {
            setCompact(false);
            return;
        }
        let on = false;
        // Mentre la testata si stringe (380 ms) il distanziatore resta largo.
        let settling = 0;

        // Alto quanto basta a tenere lo scorrimento dov'è: scorrendo in su si
        // accorcia da solo, e non cresce mai scorrendo in giù.
        const fit = () => {
            if (settling) return;
            const current = spacer.offsetHeight;
            const base = content.scrollHeight - current;
            const need = on ? Math.max(0, Math.ceil(content.scrollTop + content.clientHeight - base)) : 0;
            if (need !== current) spacer.style.height = `${need}px`;
        };
        const onScroll = () => {
            const top = content.scrollTop;
            if (!on && top > COMPACT_AT) {
                on = true;
                // Prima che la testata si stringa: al massimo cresce quanto sta
                // sopra al contenuto.
                const main = content.closest("main") ?? content.parentElement;
                const above = content.getBoundingClientRect().top - (main?.getBoundingClientRect().top ?? 0);
                spacer.style.height = `${Math.max(0, Math.ceil(above))}px`;
                window.clearTimeout(settling);
                settling = window.setTimeout(() => {
                    settling = 0;
                    fit();
                }, 450);
                setCompact(true);
            } else if (on && top < OPEN_AT) {
                on = false;
                window.clearTimeout(settling);
                settling = 0;
                setCompact(false);
            }
            fit();
        };
        const ro = new ResizeObserver(fit);
        ro.observe(content);
        content.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return () => {
            window.clearTimeout(settling);
            ro.disconnect();
            content.removeEventListener("scroll", onScroll);
            spacer.style.height = "0px";
        };
    }, [contentRef, spacerRef, enabled]);

    return compact;
}
