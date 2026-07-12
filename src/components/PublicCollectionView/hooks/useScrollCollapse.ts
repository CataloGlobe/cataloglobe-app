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
 * True se almeno una PublicSheet è aperta. Da usare negli scroll handler su
 * window per ignorare gli scroll event SINTETICI indotti dal body-lock/unlock
 * di PublicSheet (position:fixed azzera window.scrollY; il window.scrollTo del
 * rilascio ne genera un altro) — cadono nei frame critici delle animazioni.
 * Stessa fonte del freeze di useScrollCollapse: nessun meccanismo parallelo.
 */
export function hasOpenSheet(): boolean {
    return openSheetCount > 0;
}

/**
 * Tolleranza direzionale (px): quantità di movimento SOSTENUTO nella stessa
 * direzione necessaria prima di ribaltare lo stato. Implementata come
 * accumulatore con isteresi (non soglia per-evento), così assorbe i piccoli
 * eventi correttivi dello scroll-anchoring del browser (~8px quando contenuto
 * sopra cambia altezza: immagini lazy, catalogo async) senza ribaltarsi, ma
 * resta reattiva agli scroll-up lenti (delta piccoli per frame che si sommano).
 */
const DIR_TOLERANCE = 10;

/**
 * Restituisce true quando la barra deve mostrarsi in forma COMPATTA.
 * Modello DIREZIONALE (non più soglia assoluta):
 * - scroll giù              → compatta (true);
 * - scroll su               → piena (false), a qualunque altezza;
 * - vicino alla cima (<=threshold) → sempre piena (false).
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
 *
 * Re-baseline post-freeze: mentre frozen si fa early-return SENZA toccare
 * `lastScrollYRef` e si arma `needsResyncRef`. Alla prima esecuzione dopo il
 * freeze si ri-sincronizza `lastScrollYRef = y` senza cambiare stato, così il
 * primo delta utile non è spurio (il body-lock azzera/ripristina window.scrollY).
 */
export function useScrollCollapse(threshold = 50, freeze = false, enabled = true): boolean {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Aggiornato sincronicamente ad ogni render: già true prima degli scroll
    // event post-apertura sheet.
    const freezeRef = useRef(freeze);
    freezeRef.current = freeze;

    // Ultima posizione di scroll osservata (per il calcolo del delta direzionale).
    const lastScrollYRef = useRef(0);
    // Accumulatori di movimento sostenuto per direzione (px). Si azzerano a vicenda
    // ad ogni inversione: assorbono i micro-eventi correttivi dello scroll-anchoring.
    const downAccRef = useRef(0);
    const upAccRef = useRef(0);
    // Armato durante il freeze: forza un re-baseline al primo tick utile dopo.
    const needsResyncRef = useRef(false);

    useEffect(() => {
        // Gate viewport-specifico (es. bottom-bar mobile sempre montata ma attiva
        // solo ≤640px): a `enabled=false` NON si attacca il listener su window.
        if (!enabled) return;
        let rafId: number | null = null;

        const handleScroll = () => {
            // Freeze in OR: prop esistente || almeno una sheet aperta (contatore modulo).
            // Early-return SENZA toccare lastScrollYRef + arma il resync.
            if (freezeRef.current || openSheetCount > 0) {
                needsResyncRef.current = true;
                return;
            }
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                // Ri-controllo dentro al frame: il freeze può essere scattato nel frattempo.
                if (freezeRef.current || openSheetCount > 0) {
                    needsResyncRef.current = true;
                    return;
                }

                const y = Math.max(0, window.scrollY); // clamp anti rubber-band iOS

                // Primo tick dopo un freeze: solo baseline, nessun cambio di stato
                // e accumulatori azzerati (il body-lock ha falsato window.scrollY).
                if (needsResyncRef.current) {
                    needsResyncRef.current = false;
                    lastScrollYRef.current = y;
                    downAccRef.current = 0;
                    upAccRef.current = 0;
                    return;
                }

                // Near-top → sempre piena, reset accumulatori per ripartenza pulita.
                if (y <= threshold) {
                    downAccRef.current = 0;
                    upAccRef.current = 0;
                    setIsCollapsed(false);
                    lastScrollYRef.current = y;
                    return;
                }

                const diff = y - lastScrollYRef.current;
                if (diff > 0) {
                    // Movimento giù: accumula, azzera l'opposto. Oltre tolleranza → compatta.
                    downAccRef.current += diff;
                    upAccRef.current = 0;
                    if (downAccRef.current > DIR_TOLERANCE) setIsCollapsed(true);
                } else if (diff < 0) {
                    // Movimento su: accumula, azzera l'opposto. Oltre tolleranza → piena.
                    upAccRef.current += -diff;
                    downAccRef.current = 0;
                    if (upAccRef.current > DIR_TOLERANCE) setIsCollapsed(false);
                }
                // diff === 0 → nessun cambio
                lastScrollYRef.current = y;
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
