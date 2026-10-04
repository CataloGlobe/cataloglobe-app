import { useCallback, useEffect, useRef, useState } from "react";
import { PUBLIC_MOBILE_QUERY } from "../publicBreakpoints";
import {
    initialBarState,
    PROGRAMMATIC_IGNORE_MS,
    PROGRAMMATIC_MAX_EXTRA_MS,
    resyncScroll,
    revealBar,
    stepScroll,
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
    /** Riporta in vista. `afterCart`: per nasconderla servono ~80px di scroll giù. */
    reveal: (afterCart?: boolean) => void;
    /** Da chiamare PRIMA di uno scroll programmatico: per ~900ms lo scroll non conta
     *  (fino a `scrollend` se lo smooth scroll dura di più, vedi PROGRAMMATIC_MAX_EXTRA_MS). */
    ignoreProgrammaticScroll: () => void;
};

/**
 * Nascondi/mostra della bottom bar pubblica: tutto o niente, regole in
 * `bottomBarVisibility.ts`. Listener passive + rAF; stato congelato a sheet
 * aperta (stessa fonte dell'header: prop `frozen` + `hasOpenSheet()`), con
 * re-baseline al primo scroll utile dopo il freeze (il body-lock falsa lo
 * scroll). Pagina pubblica: solo sotto PUBLIC_MOBILE_QUERY, sopra la barra
 * non c'è e non si nasconde mai. Preview: scroll del device frame.
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

    const reveal = useCallback(
        (afterCart = false) => {
            stateRef.current = revealBar(stateRef.current, afterCart);
            needsResyncRef.current = true;
            commitHidden(false);
        },
        [commitHidden]
    );

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

        const isFrozen = () => frozenRef.current || hasOpenSheet();

        const handleScroll = () => {
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
                if (now < ignoreUntilRef.current || now < awaitScrollEndUntilRef.current) {
                    stateRef.current = resyncScroll(stateRef.current, y);
                    return;
                }
                if (needsResyncRef.current) {
                    needsResyncRef.current = false;
                    stateRef.current = resyncScroll(stateRef.current, y);
                    return;
                }
                stateRef.current = stepScroll(stateRef.current, y, maxY);
                commitHidden(stateRef.current.hidden);
            });
        };

        // Fine di uno scroll (programmatico o no): chiude l'attesa dello smooth
        // scroll lungo. La finestra base dei 900ms resta comunque.
        const handleScrollEnd = () => {
            awaitScrollEndUntilRef.current = 0;
        };

        const handleVisibility = () => {
            if (document.visibilityState === "visible") reveal();
        };

        needsResyncRef.current = true;
        handleScroll();
        target.addEventListener("scroll", handleScroll, { passive: true });
        target.addEventListener("scrollend", handleScrollEnd, { passive: true });
        document.addEventListener("visibilitychange", handleVisibility);
        const unsubscribeSheetClose = subscribeSheetClose(() => reveal());
        return () => {
            target.removeEventListener("scroll", handleScroll);
            target.removeEventListener("scrollend", handleScrollEnd);
            document.removeEventListener("visibilitychange", handleVisibility);
            unsubscribeSheetClose();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [active, preview, scrollContainerEl, reveal, commitHidden]);

    return { hidden, reveal, ignoreProgrammaticScroll };
}
