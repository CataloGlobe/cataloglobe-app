import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, useDragControls } from "framer-motion";
import type { AnimationPlaybackControlsWithThen } from "framer-motion";
import styles from "./PublicSheet.module.scss";

function useIsMobile(breakpoint = 640) {
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== "undefined" && window.innerWidth < breakpoint
    );
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        setIsMobile(mq.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [breakpoint]);
    return isMobile;
}

type Props = {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    ariaLabel?: string;
    /**
     * Opzionale: contenuto header della sheet (titolo + pulsante chiudi).
     * Se fornito, viene renderizzato in una zona draggabile sopra i children,
     * espandendo l'area di drag oltre la sola handle bar (solo su mobile).
     */
    headerContent?: React.ReactNode;
};

export default function PublicSheet({ isOpen, onClose, children, ariaLabel, headerContent }: Props) {
    const isMobile = useIsMobile();
    const dragControls = useDragControls();

    // ── Mobile: motion value drives BOTH drag and programmatic animation ────
    // Drag e animazione scrivono sullo stesso valore → nessun conflitto di posizione.
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const y = useMotionValue(vh);
    // L'opacity dell'overlay segue la posizione y della sheet in tempo reale
    const backdropOpacity = useTransform(y, [0, vh * 0.6], [1, 0]);

    // ── Mobile: mounting state separato da isOpen ────────────────────────────
    // Non smontare il componente finché l'animazione di chiusura non è completata.
    const [shouldRender, setShouldRender] = useState(false);
    const isClosingRef = useRef(false);

    // ── Guard unmount esterno ─────────────────────────────────────────────────
    // Evita setState/onClose su elemento già rimosso dal parent durante animazione.
    const isMountedRef = useRef(true);

    // ── Controls animazione di uscita — permette di fermarla se l'utente ───────
    // riapre la modale (es. clicca un nuovo prodotto) durante i 280ms di uscita.
    const closeAnimationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // ── Refs per disabilitare pointer-events immediatamente alla chiusura ───
    // Mutazione DOM diretta: sincrona, zero-latency, nessun re-render React.
    // Senza questo, overlay+panel (opacity ~0) bloccano click/scroll per 50-320ms
    // durante l'animazione di uscita.
    const backdropRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

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

    // ── iOS Safari scroll lock — useLayoutEffect per rilascio sincrono pre-paint ─
    // useLayoutEffect cleanup esegue PRIMA del paint, eliminando il frame dove il body
    // è ancora bloccato ma il sheet è già stato rimosso dal DOM.
    useLayoutEffect(() => {
        if (!isOpen) return;

        savedScrollYRef.current = window.scrollY;
        prevBodyStyleRef.current = {
            overflow: document.body.style.overflow,
            position: document.body.style.position,
            top: document.body.style.top,
            width: document.body.style.width,
        };
        bodyLockReleasedRef.current = false;

        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.top = `-${savedScrollYRef.current}px`;
        document.body.style.width = "100%";

        return () => {
            // Fallback: se triggerClose non ha già rilasciato il lock (es. isOpen settato
            // a false dall'esterno senza passare per triggerClose), lo rilascia qui.
            releaseBodyLock();
        };
    }, [isOpen, releaseBodyLock]);

    // ── Reset chiusura stale — ogni commit dove isOpen=true ──────────────────
    // useLayoutEffect senza dipendenze: garantisce che isClosingRef e pointer-events
    // inline vengano resettati PRIMA che l'utente possa interagire.
    // Copre l'edge case dove React batchizza close+reopen nella stessa renderizzata
    // (isOpen resta true → l'open effect con dep [isOpen] non ri-esegue →
    // isClosingRef resterebbe true e tutti i close sarebbero bloccati).
    // Gestisce anche "reopen-during-close": se l'utente seleziona un nuovo item
    // mentre il panel sta uscendo, ferma l'animazione e ri-avvia l'apertura.
    useLayoutEffect(() => {
        if (!isOpen) return;

        // Reopen-during-close: c'è un'animazione di uscita ancora in volo.
        // Fermarla subito: il panel è ancorato al viewport via .mobileRoot,
        // quindi .stop() lo congela visivamente dove si trova.
        if (closeAnimationRef.current) {
            closeAnimationRef.current.stop();
            closeAnimationRef.current = null;

            if (isMobile) {
                // Reset y sotto schermo: evita che la ri-apertura parta da una
                // posizione intermedia (metà discesa → metà schermo → aspetto strano).
                y.set(window.innerHeight);
                requestAnimationFrame(() => {
                    animate(y, 0, { type: "spring", damping: 32, stiffness: 320 });
                });
            }
        }

        // Stale pointer-events: triggerClose muta il DOM direttamente per zero-latency,
        // ma se il componente non si smonta tra chiusura e riapertura le mutazioni persistono.
        isClosingRef.current = false;
        if (backdropRef.current) backdropRef.current.style.pointerEvents = "";
        if (overlayRef.current) overlayRef.current.style.pointerEvents = "";
        if (panelRef.current) panelRef.current.style.pointerEvents = "";
    });

    // ── Open trigger ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;

        if (isMobile) {
            // Posiziona il panel sotto lo schermo, poi anima verso l'alto
            y.set(window.innerHeight);
            setShouldRender(true);
            requestAnimationFrame(() => {
                animate(y, 0, { type: "spring", damping: 32, stiffness: 320 });
            });
        } else {
            setShouldRender(true);
        }
    }, [isOpen, isMobile, y]);

    // ── Close con animazione (tutti i trigger: drag, button, overlay, Escape) ─
    const triggerClose = useCallback(
        async (velocityY = 0) => {
            if (isClosingRef.current) return;
            isClosingRef.current = true;

            // ⚡ IMMEDIATO — pointer-events off su TUTTI gli elementi.
            // Impedisce interazioni durante l'animazione di uscita.
            if (isMobile) {
                if (backdropRef.current) backdropRef.current.style.pointerEvents = "none";
            } else {
                if (overlayRef.current) overlayRef.current.style.pointerEvents = "none";
            }
            if (panelRef.current) panelRef.current.style.pointerEvents = "none";

            // ⚡ IMMEDIATO — rilascio body lock: la pagina sotto torna interactive
            // subito (scroll libero, tap affidabili su iOS Safari). Il panel è
            // position:fixed via .mobileRoot (ancorato al viewport, non al body)
            // → rilasciare body.position non sposta visivamente il panel.
            releaseBodyLock();

            if (isMobile) {
                // Animazione completata PRIMA di notificare il parent: evita il re-render
                // di React che nella versione precedente interferiva con i frame di animazione.
                // La pagina sotto è già libera mentre il panel scende.
                // I controls sono salvati in closeAnimationRef per permettere cancellazione
                // dall'esterno (es. useLayoutEffect reset-stale su reopen-during-close).
                const controls = animate(y, window.innerHeight * 1.1, {
                    type: "spring",
                    damping: 28,
                    stiffness: 260,
                    velocity: velocityY,
                    restDelta: 1,
                });
                closeAnimationRef.current = controls;
                try {
                    await controls;
                } finally {
                    closeAnimationRef.current = null;
                }

                // Guard: componente rimosso dal parent esternamente durante l'animazione.
                if (!isMountedRef.current) return;
            }

            // Guard reopen-during-close: isClosingRef è stato resettato dall'useLayoutEffect
            // reset-stale perché l'utente ha selezionato un nuovo item durante l'uscita.
            // Non chiamare onClose: cancellerebbe il nuovo selectedItem appena settato.
            if (!isClosingRef.current) return;

            // Notifica parent dopo animazione completata.
            onClose();

            if (isMobile && isClosingRef.current) {
                setShouldRender(false);
            }
        },
        [isMobile, onClose, releaseBodyLock, y]
    );

    // ── Escape key ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            triggerClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, triggerClose]);

    // ── Desktop: AnimatePresence (nessun drag, nessun conflitto) ────────────
    if (!isMobile) {
        return (
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        ref={overlayRef}
                        className={styles.overlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={() => triggerClose()}
                        role="presentation"
                    >
                        <motion.div
                            ref={panelRef}
                            className={styles.panel}
                            role="dialog"
                            aria-modal="true"
                            aria-label={ariaLabel}
                            initial={{ opacity: 0, y: 28, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.98 }}
                            transition={{ type: "spring", duration: 0.32, bounce: 0.15 }}
                            onClick={e => e.stopPropagation()}
                        >
                            {headerContent && (
                                <div className={styles.dragZone}>
                                    {headerContent}
                                </div>
                            )}
                            {children}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }

    // ── Mobile: motion value + shouldRender (no AnimatePresence sul panel) ──
    if (!shouldRender) return null;

    return (
        <div className={styles.mobileRoot}>
            {/* Backdrop: opacity derivata da y in tempo reale — fade sincronizzato col drag */}
            <motion.div
                ref={backdropRef}
                className={styles.backdrop}
                style={{ opacity: backdropOpacity }}
                onClick={() => triggerClose()}
                role="presentation"
            />
            {/* Panel: style={{ y }} — drag e animate() scrivono sullo stesso motion value */}
            <motion.div
                ref={panelRef}
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                style={{ y, touchAction: "pan-y" }}
                drag="y"
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0 }}
                dragElastic={{ top: 0, bottom: 0.35 }}
                onDragEnd={(_, info) => {
                    if (info.offset.y > 100 || info.velocity.y > 400) {
                        triggerClose(info.velocity.y);
                    } else {
                        // Snap elastico: torna in posizione
                        animate(y, 0, { type: "spring", damping: 32, stiffness: 320 });
                    }
                }}
                onClick={e => e.stopPropagation()}
            >
                <div
                    className={styles.handle}
                    onPointerDown={e => dragControls.start(e)}
                >
                    <span className={styles.handleBar} />
                </div>
                {headerContent && (
                    <div
                        className={styles.dragZone}
                        onPointerDown={e => {
                            if ((e.target as HTMLElement).closest("button")) return;
                            dragControls.start(e);
                        }}
                    >
                        {headerContent}
                    </div>
                )}
                {children}
            </motion.div>
        </div>
    );
}
