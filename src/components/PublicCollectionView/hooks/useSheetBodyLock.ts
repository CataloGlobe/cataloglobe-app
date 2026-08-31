import { useCallback, useLayoutEffect, useRef } from "react";
import { popSheetOpen, pushSheetOpen } from "./useScrollCollapse";

/**
 * Body scroll lock delle superfici modali della pagina pubblica.
 *
 * Meccanica neutra rispetto all'ancoraggio (bottom sheet, pannello top, dialog):
 * blocca il body all'apertura, lo rilascia al cleanup, ed espone lock/release
 * per i consumer che devono anticipare o annullare il rilascio.
 *
 * Il QUANDO del rilascio resta del consumer: l'uscita animata di PublicSheet
 * rilascia il lock a inizio animazione (vincolo di interattività), non a fine.
 * Il cleanup dell'effect qui sotto è solo la rete di sicurezza per le chiusure
 * che non passano dal path animato.
 */
export function useSheetBodyLock(isOpen: boolean): {
    releaseBodyLock: () => void;
    lockBody: () => void;
} {
    // ── Body lock state in refs — accessibili sia da useLayoutEffect che da triggerClose ──
    // Salviamo i valori originali qui invece che nella closure del useLayoutEffect,
    // così triggerClose può rilasciare il lock direttamente senza aspettare React.
    const savedScrollYRef = useRef(0);
    const prevBodyStyleRef = useRef({ overflow: "", position: "", top: "", width: "" });
    // true = lock non attivo (iniziale o già rilasciato); false = lock attivo
    const bodyLockReleasedRef = useRef(true);

    // ── Rilascio body lock — sicuro da chiamare più volte (idempotente) ──────
    const releaseBodyLock = useCallback(() => {
        if (bodyLockReleasedRef.current) return;
        bodyLockReleasedRef.current = true;
        const prev = prevBodyStyleRef.current;
        document.body.style.overflow = prev.overflow;
        document.body.style.position = prev.position;
        document.body.style.top = prev.top;
        document.body.style.width = prev.width;
        window.scrollTo(0, savedScrollYRef.current);
    }, []);

    // ── Re-lock body — riapplica il lock rilasciato eagermente da animateOutMobile
    // durante una close-interruption (vedi useLayoutEffect contentKey).
    // Idempotente: no-op se già lockato.
    const lockBody = useCallback(() => {
        if (!bodyLockReleasedRef.current) return;
        savedScrollYRef.current = window.scrollY;
        prevBodyStyleRef.current = {
            overflow: document.body.style.overflow,
            position: document.body.style.position,
            top: document.body.style.top,
            width: document.body.style.width,
        };
        bodyLockReleasedRef.current = false;
        // Stesso ordine atomico del useLayoutEffect open: top+width PRIMA di
        // position:fixed, per evitare la finestra "position==='fixed' && top===''"
        // che innesca il thrash su iOS Safari.
        document.body.style.top = `-${savedScrollYRef.current}px`;
        document.body.style.width = "100%";
        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";
    }, []);

    // ── iOS Safari scroll lock — useLayoutEffect per rilascio sincrono pre-paint ─
    // useLayoutEffect cleanup esegue PRIMA del paint, eliminando il frame dove il body
    // è ancora bloccato ma il sheet è già stato rimosso dal DOM.
    useLayoutEffect(() => {
        if (!isOpen) return;

        // Contatore sheet aperte (modulo) — incrementato SINCRONO qui, PRIMA che
        // il body-lock sotto (position:fixed) induca lo scroll event. Così
        // useScrollCollapse vede già freeze>0 e non rimpicciolisce la bottom bar.
        // Decremento nel cleanup → copre close (isOpen=false) e unmount.
        pushSheetOpen();

        savedScrollYRef.current = window.scrollY;
        prevBodyStyleRef.current = {
            overflow: document.body.style.overflow,
            position: document.body.style.position,
            top: document.body.style.top,
            width: document.body.style.width,
        };
        bodyLockReleasedRef.current = false;

        // Ordine atomico per evitare frame thrash su iOS Safari: `top` e `width`
        // PRIMA di `position:fixed`. Su body static, top/width sono no-op visivi.
        // Quando position diventa fixed (commit), top è GIÀ settato → invariante
        // "position==='fixed' ⇒ top valorizzato" preservata. readScroll in
        // PublicCollectionHeader (defensive read di body.style.top) non cade
        // nell'else con bodyTop="" → niente reset di scrollY a 0 → niente
        // header→hero → niente ResizeObserver → niente sticky-nav reposition.
        document.body.style.top = `-${savedScrollYRef.current}px`;
        document.body.style.width = "100%";
        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";

        return () => {
            // Decremento sincrono del contatore sheet aperte: pareggia il push
            // sopra su close/unmount, niente contatore appeso.
            popSheetOpen();
            // Fallback: se triggerClose non ha già rilasciato il lock (es. isOpen settato
            // a false dall'esterno senza passare per triggerClose), lo rilascia qui.
            releaseBodyLock();
        };
    }, [isOpen, releaseBodyLock]);

    return { releaseBodyLock, lockBody };
}
