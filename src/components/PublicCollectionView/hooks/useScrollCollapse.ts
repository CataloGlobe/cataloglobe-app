import { useEffect, useRef, useState } from "react";

/**
 * Contatore condiviso a livello di MODULO delle sheet pubbliche aperte.
 * Ogni PublicSheet lo incrementa all'apertura e lo decrementa alla chiusura
 * (più cleanup di unmount), in modo SINCRONO nel path open/close → già settato
 * PRIMA dello scroll event indotto dal body-lock. Quando >0, useScrollCollapse
 * congela lo stato collapse: copre QUALSIASI sheet basata su PublicSheet
 * (dettaglio, ordine, featured, Assistenza), non solo quelle note al parent.
 *
 * SSR-safe: toccato SOLO da effect/handler client (PublicSheet useLayoutEffect),
 * MAI letto in render.
 */
let openSheetCount = 0;

export function pushSheetOpen(): void {
    openSheetCount += 1;
}

export function popSheetOpen(): void {
    openSheetCount = Math.max(0, openSheetCount - 1);
}

/**
 * Restituisce true quando lo scroll supera il threshold (default 50px).
 * Usato dai FAB della pagina pubblica per collassarsi in forma compatta.
 * Usa requestAnimationFrame per throttle: evita jitter su mobile.
 *
 * Freeze in OR su due fonti:
 * - `freeze` prop: quando true, lo stato collapse NON viene aggiornato dallo
 *   scroll e trattiene l'ultimo valore. Letto da un ref aggiornato SINCRONO ad
 *   ogni render, così vince gli scroll event subito dopo l'apertura.
 * - `openSheetCount > 0`: contatore di modulo delle sheet aperte (vedi sopra).
 *   Ridondante con la prop per dettaglio/ordine, ma copre anche featured/Assistenza
 *   senza toccare il parent. La prop verrà rimossa al cleanup finale.
 * Entrambe servono a evitare il flicker quando una sheet blocca lo scroll del
 * body (window.scrollY torna a 0 → l'hook crederebbe di essere in cima).
 */
export function useScrollCollapse(threshold = 50, freeze = false, enabled = true): boolean {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Aggiornato sincronicamente ad ogni render: già true prima degli scroll
    // event post-apertura sheet.
    const freezeRef = useRef(freeze);
    freezeRef.current = freeze;

    useEffect(() => {
        // Gate viewport-specifico (es. bottom-bar mobile sempre montata ma attiva
        // solo ≤640px): a `enabled=false` NON si attacca il listener su window.
        if (!enabled) return;
        let rafId: number | null = null;

        const handleScroll = () => {
            // Freeze in OR: prop esistente || almeno una sheet aperta (contatore modulo).
            if (freezeRef.current || openSheetCount > 0) return;
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                if (!freezeRef.current && openSheetCount === 0) {
                    setIsCollapsed(window.scrollY > threshold);
                }
                rafId = null;
            });
        };

        // Controllo iniziale: se la pagina è già scrollata al mount, appare già compatto
        handleScroll();

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [threshold, enabled]);

    return isCollapsed;
}
