import { useCallback, useEffect, useRef, useState } from "react";
import { PUBLIC_MOBILE_QUERY } from "../publicBreakpoints";
import {
    IDLE_REVEAL_MS,
    initialBarState,
    lockRemaining,
    PROGRAMMATIC_IGNORE_MS,
    PROGRAMMATIC_MAX_EXTRA_MS,
    resyncScroll,
    revealBar,
    stepScroll,
    VIEWPORT_RESIZE_IGNORE_MS,
} from "./bottomBarVisibility";
import { hasOpenSheet, subscribeSheetClose } from "./openSheets";

type Options = {
    /** Barra montata (pagina pubblica, o preview su device mobile). */
    mounted: boolean;
    /** Style Editor: lo scroll è quello del device frame, non della finestra. */
    preview: boolean;
    /** Scroll container del device frame (solo preview). */
    scrollContainerEl?: HTMLElement | null;
    /** Sheet note al parent aperte (dettaglio, ordine): in OR con hasOpenSheet(). */
    frozen: boolean;
};

export type BottomBarAutoHide = {
    hidden: boolean;
    /** Riporta in vista; per nasconderla di nuovo servono ~80px di scroll giù. */
    reveal: () => void;
    /** Da chiamare PRIMA di uno scroll programmatico: per ~900ms lo scroll non conta
     *  (fino a `scrollend` se lo smooth scroll dura di più, vedi PROGRAMMATIC_MAX_EXTRA_MS). */
    ignoreProgrammaticScroll: () => void;
};

/**
 * Nascondi/mostra della bottom bar pubblica: tutto o niente, regole in
 * `bottomBarVisibility.ts`. Listener passive + rAF; stato congelato a sheet
 * aperta (stessa fonte dell'header: prop `frozen` + `hasOpenSheet()`), con
 * re-baseline al primo scroll utile dopo il freeze (il body-lock falsa lo
 * scroll). Da fermo, nascosta e senza sheet, ricompare dopo IDLE_REVEAL_MS.
 * Pubblica: scroll indotti dal resize della toolbar (visualViewport) ignorati.
 * Pagina pubblica: solo sotto PUBLIC_MOBILE_QUERY, sopra la barra non c'è e
 * non si nasconde mai. Preview: scroll del device frame.
 */
export function useBottomBarAutoHide({
    mounted,
    preview,
    scrollContainerEl,
    frozen,
}: Options): BottomBarAutoHide {
    const [hidden, setHidden] = useState(false);
    const stateRef = useRef(initialBarState());
    const needsResyncRef = useRef(true);
    const ignoreUntilRef = useRef(0);
    const awaitScrollEndUntilRef = useRef(0);
    const viewportIgnoreUntilRef = useRef(0);
    const frozenRef = useRef(frozen);
    frozenRef.current = frozen;

    // Pubblico: attiva solo sotto la soglia mobile. matchMedia letto in effect
    // (client-only), mai in render. Preview: lo decide il device frame.
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    useEffect(() => {
        if (preview || !mounted) return;
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia(PUBLIC_MOBILE_QUERY);
        const update = () => setIsMobileViewport(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, [preview, mounted]);

    const active = mounted && (preview ? !!scrollContainerEl : isMobileViewport);

    const commitHidden = useCallback((next: boolean) => {
        setHidden(prev => (prev === next ? prev : next));
    }, []);

    const reveal = useCallback(() => {
        stateRef.current = revealBar(stateRef.current, performance.now());
        needsResyncRef.current = true;
        commitHidden(false);
    }, [commitHidden]);

    const ignoreProgrammaticScroll = useCallback(() => {
        const now = performance.now();
        ignoreUntilRef.current = now + PROGRAMMATIC_IGNORE_MS;
        awaitScrollEndUntilRef.current =
            typeof window !== "undefined" && "onscrollend" in window
                ? now + PROGRAMMATIC_IGNORE_MS + PROGRAMMATIC_MAX_EXTRA_MS
                : 0;
    }, []);

    useEffect(() => {
        if (!active) {
            stateRef.current = initialBarState();
            commitHidden(false);
            return;
        }
        const target: HTMLElement | Window = preview && scrollContainerEl ? scrollContainerEl : window;
        let rafId: number | null = null;
        let idleTimer: ReturnType<typeof setTimeout> | null = null;
        let lockTimer: ReturnType<typeof setTimeout> | null = null;

        const isFrozen = () => frozenRef.current || hasOpenSheet();
        const isIgnoring = (now: number) =>
            now < ignoreUntilRef.current ||
            now < awaitScrollEndUntilRef.current ||
            now < viewportIgnoreUntilRef.current;

        const clearIdle = () => {
            if (idleTimer !== null) clearTimeout(idleTimer);
            idleTimer = null;
        };
        // Ricomparsa da fermo: armato dopo uno scroll dell'utente che lascia la
        // barra nascosta. Allo scadere ricontrolla sheet e scroll programmatico,
        // e che la posizione non sia cambiata dall'armo: se lo scroll è ancora
        // in corso (inerzia iOS con eventi diradati) riparte da capo.
        const armIdle = (fromY: number) => {
            clearIdle();
            idleTimer = setTimeout(() => {
                idleTimer = null;
                if (!stateRef.current.hidden || isFrozen()) return;
                if (isIgnoring(performance.now())) return;
                const { y } = readScroll();
                if (Math.abs(y - fromY) > 1) {
                    armIdle(y);
                    return;
                }
                reveal();
            }, IDLE_REVEAL_MS);
        };

        // Fine isteresi: un cambio rimasto in sospeso (es. si è fermato in cima
        // subito dopo essersi nascosta) si applica senza aspettare un altro scroll.
        const scheduleLockRecheck = () => {
            if (lockTimer !== null) clearTimeout(lockTimer);
            const wait = lockRemaining(stateRef.current, performance.now());
            if (wait <= 0) {
                lockTimer = null;
                return;
            }
            lockTimer = setTimeout(() => {
                lockTimer = null;
                if (isFrozen() || needsResyncRef.current) return;
                const now = performance.now();
                if (isIgnoring(now)) return;
                const { y, maxY } = readScroll();
                stateRef.current = stepScroll(stateRef.current, y, maxY, now);
                commitHidden(stateRef.current.hidden);
                if (stateRef.current.hidden) armIdle(y);
            }, wait + 16);
        };

        // Stessa lettura di PublicCollectionHeader.readScroll: col body in lock
        // (position:fixed) la posizione reale sta in body.style.top.
        const readScroll = (): { y: number; maxY: number } => {
            if (preview && scrollContainerEl) {
                return {
                    y: scrollContainerEl.scrollTop,
                    maxY: scrollContainerEl.scrollHeight - scrollContainerEl.clientHeight,
                };
            }
            const maxY = document.documentElement.scrollHeight - window.innerHeight;
            const bodyTop = document.body.style.top;
            if (document.body.style.position === "fixed" && bodyTop) {
                const parsed = parseInt(bodyTop, 10);
                return { y: Number.isNaN(parsed) ? window.scrollY : -parsed, maxY };
            }
            return { y: window.scrollY, maxY };
        };

        const handleScroll = () => {
            // Ogni scroll azzera il conto della ricomparsa da fermo.
            clearIdle();
            if (isFrozen()) {
                needsResyncRef.current = true;
                return;
            }
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (isFrozen()) {
                    needsResyncRef.current = true;
                    return;
                }
                const { y, maxY } = readScroll();
                const now = performance.now();
                if (isIgnoring(now)) {
                    stateRef.current = resyncScroll(stateRef.current, y);
                    return;
                }
                if (needsResyncRef.current) {
                    needsResyncRef.current = false;
                    stateRef.current = resyncScroll(stateRef.current, y);
                    return;
                }
                stateRef.current = stepScroll(stateRef.current, y, maxY, now);
                commitHidden(stateRef.current.hidden);
                scheduleLockRecheck();
                if (stateRef.current.hidden) armIdle(y);
            });
        };

        // Fine di uno scroll (programmatico o no): chiude l'attesa dello smooth
        // scroll lungo. La finestra base dei 900ms resta comunque.
        const handleScrollEnd = () => {
            awaitScrollEndUntilRef.current = 0;
        };

        // Toolbar del browser che entra/esce: cambia visualViewport.height e lo
        // scroll che ne segue non è dell'utente (iOS Safari e Chrome).
        const viewport = preview ? null : window.visualViewport;
        let lastViewportHeight = viewport?.height ?? 0;
        const handleViewportResize = () => {
            if (!viewport || viewport.height === lastViewportHeight) return;
            lastViewportHeight = viewport.height;
            viewportIgnoreUntilRef.current = performance.now() + VIEWPORT_RESIZE_IGNORE_MS;
        };

        const handleVisibility = () => {
            if (document.visibilityState === "visible") reveal();
        };

        needsResyncRef.current = true;
        handleScroll();
        target.addEventListener("scroll", handleScroll, { passive: true });
        target.addEventListener("scrollend", handleScrollEnd, { passive: true });
        document.addEventListener("visibilitychange", handleVisibility);
        viewport?.addEventListener("resize", handleViewportResize);
        const unsubscribeSheetClose = subscribeSheetClose(() => reveal());
        return () => {
            target.removeEventListener("scroll", handleScroll);
            target.removeEventListener("scrollend", handleScrollEnd);
            document.removeEventListener("visibilitychange", handleVisibility);
            viewport?.removeEventListener("resize", handleViewportResize);
            unsubscribeSheetClose();
            clearIdle();
            if (lockTimer !== null) clearTimeout(lockTimer);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [active, preview, scrollContainerEl, reveal, commitHidden]);

    return { hidden, reveal, ignoreProgrammaticScroll };
}
