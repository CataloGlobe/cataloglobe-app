import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, useDragControls, useReducedMotion } from "framer-motion";
import { popSheetOpen, pushSheetOpen } from "../hooks/useScrollCollapse";
import { PublicPortalContext } from "@/features/public/components/PublicPortalContext";
import styles from "./PublicSheet.module.scss";

// ── Uscita mobile: WAAPI sul compositor ─────────────────────────────────────
// La spring framer su motion value gira in rAF sul MAIN thread: il reflow
// full-page del rilascio body-lock (sincrono a INIZIO uscita — vincolo di
// interattività, non spostare) la stalla al primo frame. element.animate()
// su transform/opacity è compositor-accelerated su WebKit → immune al reflow.
// La velocity del drag viene convertita in durata (flick veloce = uscita più
// rapida); l'easing decelerante è la curva standard degli sheet iOS.
const EXIT_DURATION_MS = 280;
const EXIT_MIN_DURATION_MS = 140;
const EXIT_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

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
    /**
     * Opzionale: contenuto footer della sheet (es. azioni Reset/Applica di un
     * filtro multi-selezione). Renderizzato SOTTO i children ma fuori dall'area
     * scrollabile del panel (`.panel` è flex-column + overflow:hidden; solo il
     * contenitore scrollabile che il consumer mette nei children scrolla) →
     * resta sempre visibile indipendentemente dallo scroll del contenuto sopra.
     */
    footerContent?: React.ReactNode;
    /**
     * Opzionale: identificatore del contenuto corrente (es. item.id).
     * Se passato, abilita "close interruption": quando contentKey cambia mentre
     * la sheet sta animando in uscita (es. user tap su un altro prodotto durante
     * la chiusura), l'animazione viene abortita, body lock ripristinato, panel
     * ri-animato a y=0 col nuovo contenuto, onClose NON chiamato.
     * Se omesso (undefined), comportamento byte-identico a prima.
     */
    contentKey?: string;
};

export default function PublicSheet({ isOpen, onClose, children, ariaLabel, headerContent, footerContent, contentKey }: Props) {
    const isMobile = useIsMobile();
    const dragControls = useDragControls();
    const prefersReducedMotion = useReducedMotion();
    // Target del portal: nodo plain dentro il theme scope (eredita --pub-*,
    // fuori da .tabPatternSurface). Null finché non montato → fallback al
    // render in-place (transitorio: gli sheet si aprono dopo il mount).
    const portalTarget = useContext(PublicPortalContext);

    // ── Mobile: motion value drives BOTH drag and programmatic animation ────
    // Drag e animazione scrivono sullo stesso valore → nessun conflitto di posizione.
    // vh in state (non costante one-shot): su rotazione/resize l'altezza viewport
    // cambia, e backdropOpacity sotto deve ricalcolare il range su quella nuova
    // altezza — altrimenti il backdrop può restare a opacity≈0 (invisibile) pur
    // essendo montato e cliccabile, bloccando l'input silenziosamente.
    const [vh, setVh] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
    useEffect(() => {
        const updateVh = () => setVh(window.innerHeight);
        window.addEventListener("resize", updateVh);
        window.addEventListener("orientationchange", updateVh);
        return () => {
            window.removeEventListener("resize", updateVh);
            window.removeEventListener("orientationchange", updateVh);
        };
    }, []);
    const y = useMotionValue(vh);
    // L'opacity dell'overlay segue la posizione y della sheet in tempo reale
    const backdropOpacity = useTransform(y, [0, vh * 0.6], [1, 0]);

    // ── Mobile: mounting state separato da isOpen ────────────────────────────
    // Non smontare il componente finché l'animazione di chiusura non è completata.
    const [shouldRender, setShouldRender] = useState(false);
    const isClosingRef = useRef(false);

    // ── will-change: transform SOLO durante l'entrata, poi auto ───────────────
    // Hint perf per l'animazione d'ingresso del panel; rimosso a transizione
    // conclusa (onAnimationComplete desktop / promise dell'animate mobile) per
    // non lasciare un layer di composizione permanente. Non tocca il drag.
    const [panelWillChange, setPanelWillChange] = useState<"transform" | "auto">("transform");

    // ── Guard unmount esterno ─────────────────────────────────────────────────
    // Evita setState/onClose su elemento già rimosso dal parent durante animazione.
    const isMountedRef = useRef(true);
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

    // ── Animazioni WAAPI di uscita in volo (panel + backdrop) ───────────────
    // fill:"forwards" tiene la posizione finale finché non si smonta o cancella:
    // vanno SEMPRE cancellate prima di ridare il controllo al motion value y
    // (close-interruption, riapertura), altrimenti l'effetto WAAPI sovrasta il
    // transform inline scritto da framer.
    const exitAnimationsRef = useRef<Animation[]>([]);

    const cancelExitAnimations = useCallback(() => {
        for (const anim of exitAnimationsRef.current) anim.cancel();
        exitAnimationsRef.current = [];
    }, []);

    // Riversa la translateY corrente del panel (matrice computata: include
    // l'effetto WAAPI in corso) nel motion value + inline style, così il frame
    // dopo il cancel riparte esattamente dalla posizione visibile — niente
    // salto a zero né flash alla posizione pre-uscita.
    const syncYFromComputedTransform = useCallback(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const computed = getComputedStyle(panel).transform;
        if (!computed || computed === "none") return;
        const currentY = new DOMMatrixReadOnly(computed).m42;
        y.set(currentY);
        panel.style.transform = `translateY(${currentY}px)`;
    }, [y]);

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

    // ── Close-interruption (opt-in via contentKey) ──────────────────────────
    // Se il parent fornisce contentKey e questa cambia mentre la chiusura è in
    // volo (isClosingRef=true), abortisce la chiusura: re-locka body, ripristina
    // pointer-events, ri-anima y → 0 col nuovo contenuto. Il flag abortCloseRef
    // viene letto da triggerClose dopo l'await per skippare onClose.
    // MUST run BEFORE il reset useLayoutEffect sottostante: quello azzera
    // isClosingRef ad ogni commit, qui leggiamo lo stato pre-reset.
    const contentKeyRef = useRef(contentKey);
    const abortCloseRef = useRef(false);
    useLayoutEffect(() => {
        const prev = contentKeyRef.current;
        contentKeyRef.current = contentKey;
        if (contentKey === undefined) return;
        if (prev === contentKey) return;
        if (!isClosingRef.current) return;
        abortCloseRef.current = true;
        isClosingRef.current = false;
        if (backdropRef.current) backdropRef.current.style.pointerEvents = "";
        if (panelRef.current) panelRef.current.style.pointerEvents = "";
        if (isMobile && shouldRender) {
            // Uscita WAAPI in volo: leggi la posizione corrente e riversala nel
            // motion value PRIMA del cancel, così la spring di rientro riparte
            // da dov'è il panel (non da zero né dalla posizione pre-uscita).
            if (exitAnimationsRef.current.length > 0) {
                syncYFromComputedTransform();
                cancelExitAnimations();
            }
            lockBody();
            animate(y, 0, { type: "spring", damping: 32, stiffness: 320 });
        }
    }, [contentKey, isMobile, shouldRender, lockBody, y, syncYFromComputedTransform, cancelExitAnimations]);

    // ── Reset chiusura stale — ogni commit dove isOpen=true ──────────────────
    // useLayoutEffect senza dipendenze: garantisce che isClosingRef e pointer-events
    // inline vengano resettati PRIMA che l'utente possa interagire.
    // Copre l'edge case dove React batchizza close+reopen nella stessa renderizzata
    // (isOpen resta true → l'open effect con dep [isOpen] non ri-esegue →
    // isClosingRef resterebbe true e tutti i close sarebbero bloccati).
    useLayoutEffect(() => {
        if (!isOpen) return;
        isClosingRef.current = false;
        // Stale pointer-events: triggerClose muta il DOM direttamente per zero-latency,
        // ma se il componente non si smonta tra chiusura e riapertura le mutazioni persistono.
        if (backdropRef.current) backdropRef.current.style.pointerEvents = "";
        if (overlayRef.current) overlayRef.current.style.pointerEvents = "";
        if (panelRef.current) panelRef.current.style.pointerEvents = "";
    });

    // ── Open trigger ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;

        if (isMobile) {
            // Riapertura durante un'uscita WAAPI in volo (external close →
            // reopen): senza cancel, fill:"forwards" terrebbe il panel fuori
            // schermo sovrastando il transform inline del motion value.
            cancelExitAnimations();
            if (prefersReducedMotion) {
                // Reduced motion: apertura istantanea, niente spring → nessun hint.
                y.set(0);
                setShouldRender(true);
                setPanelWillChange("auto");
                return;
            }
            // Posiziona il panel sotto lo schermo, poi anima verso l'alto
            setPanelWillChange("transform");
            y.set(window.innerHeight);
            setShouldRender(true);
            requestAnimationFrame(() => {
                animate(y, 0, { type: "spring", damping: 32, stiffness: 320 }).then(() => {
                    // Entrata conclusa: rimuovi l'hint (se ancora montato).
                    if (isMountedRef.current) setPanelWillChange("auto");
                });
            });
        } else {
            setPanelWillChange("transform");
            setShouldRender(true);
        }
    }, [isOpen, isMobile, y, prefersReducedMotion, cancelExitAnimations]);

    // ── Animate-out mobile — estratto per riuso (triggerClose + external close) ─
    // Esegue SOLO la sequenza pointer-events off → body lock release → animazione
    // di uscita, SENZA chiamare onClose né setShouldRender. Idempotente sul
    // body lock (releaseBodyLock usa bodyLockReleasedRef come guard).
    // Uscita su WAAPI (compositor): il rilascio del lock qui sopra innesca un
    // reflow full-page sincrono che stallerebbe una spring JS al primo frame.
    // Il DRAG resta su motion value (deve seguire il dito): solo il release
    // passa al compositor. Fallback spring framer se WAAPI assente.
    const animateOutMobile = useCallback(
        async (velocityY = 0) => {
            if (backdropRef.current) backdropRef.current.style.pointerEvents = "none";
            if (panelRef.current) panelRef.current.style.pointerEvents = "none";
            releaseBodyLock();

            // Ferma QUALSIASI animazione in corso sul motion value (spring di
            // snap-back, residui di drag): da qui in poi il transform ha un solo
            // proprietario per volta. Senza stop, un'animazione ancora attiva su
            // y continuerebbe a riscrivere l'inline style sotto la WAAPI e al
            // cancel l'elemento ricadrebbe su una posizione stale del drag.
            y.stop();

            const panel = panelRef.current;
            const targetY = window.innerHeight * 1.1;

            if (!panel || typeof panel.animate !== "function") {
                await animate(y, targetY, {
                    type: "spring",
                    damping: 28,
                    stiffness: 260,
                    velocity: velocityY,
                    restDelta: 1,
                });
                return;
            }

            const startY = y.get();
            const distance = targetY - startY;
            if (distance <= 0) {
                y.set(targetY);
                return;
            }
            // velocity (px/s, >0 = verso il basso) → durata: un flick chiude in
            // proporzione alla velocità del gesto, un tap usa la durata base.
            const duration =
                velocityY > 0
                    ? Math.min(
                          EXIT_DURATION_MS,
                          Math.max(EXIT_MIN_DURATION_MS, (distance / velocityY) * 1000)
                      )
                    : EXIT_DURATION_MS;

            // Opacity di partenza del backdrop letta PRIMA di spostare y (sotto):
            // dopo y.set(targetY) la derivata backdropOpacity varrebbe già 0.
            const startBackdropOpacity = backdropOpacity.get();

            // Single-owner del transform durante l'uscita: il motion value (e
            // quindi l'inline style su cui l'elemento ricade quando la WAAPI
            // finisce o viene cancellata) va SUBITO alla posizione finale. La
            // WAAPI dipinge l'interpolazione sopra; qualunque cancel/finish fa
            // atterrare l'elemento su translateY(targetY) — mai sulla posizione
            // stale in cui il dito ha lasciato il panel (glitch drag-close).
            y.set(targetY);

            // will-change SOLO per la durata dell'uscita (l'entrata usa lo state
            // panelWillChange): scrittura DOM diretta, nessun re-render in mezzo.
            panel.style.willChange = "transform";

            const animations: Animation[] = [
                panel.animate(
                    [
                        { transform: `translateY(${startY}px)` },
                        { transform: `translateY(${targetY}px)` },
                    ],
                    { duration, easing: EXIT_EASING, fill: "forwards" }
                ),
            ];
            const backdrop = backdropRef.current;
            if (backdrop && typeof backdrop.animate === "function") {
                // y è già a targetY → backdropOpacity (derivata) è già 0 inline:
                // il fade visivo lo dipinge la WAAPI dal valore registrato sopra.
                animations.push(
                    backdrop.animate(
                        [{ opacity: startBackdropOpacity }, { opacity: 0 }],
                        { duration, easing: EXIT_EASING, fill: "forwards" }
                    )
                );
            }
            exitAnimationsRef.current = animations;

            try {
                await Promise.all(animations.map(anim => anim.finished));
                // Cancella subito: niente fill:"forwards" residuo che sovrasterebbe
                // l'inline style se una close-interruption arriva tra fine uscita e
                // unmount. L'inline è già a targetY (y.set sopra) → nessun salto.
                for (const anim of animations) anim.cancel();
            } catch {
                // cancel() da close-interruption o riapertura: la posizione è già
                // stata risincronizzata dal chiamante che ha cancellato.
            } finally {
                exitAnimationsRef.current = [];
                if (panel.isConnected) panel.style.willChange = "";
            }
        },
        [releaseBodyLock, y, backdropOpacity]
    );

    // ── Close con animazione (trigger interni: drag, button, overlay, Escape) ─
    // Mobile path: wrapper su animateOutMobile + onClose + unmount.
    // Desktop path: pointer-events off + release lock + onClose; l'exit
    // animation è gestita da AnimatePresence sul motion overlay/panel.
    const triggerClose = useCallback(
        async (velocityY = 0) => {
            if (isClosingRef.current) return;
            isClosingRef.current = true;
            // Reset del flag abort all'avvio della chiusura: se una precedente
            // close-interruption non avesse resettato (es. animation interruption
            // non ha rilasciato la promise), evitiamo che onClose venga skippato qui.
            abortCloseRef.current = false;

            if (isMobile) {
                await animateOutMobile(velocityY);
                if (!isMountedRef.current) return;
                // Abort: contentKey è cambiata durante l'await (parent ha
                // sostituito il contenuto). Non chiamare onClose, lascia
                // visibile il nuovo contenuto già animato a y=0.
                if (abortCloseRef.current) {
                    abortCloseRef.current = false;
                    return;
                }
                onClose();
                if (isClosingRef.current) setShouldRender(false);
            } else {
                if (overlayRef.current) overlayRef.current.style.pointerEvents = "none";
                if (panelRef.current) panelRef.current.style.pointerEvents = "none";
                releaseBodyLock();
                onClose();
            }
        },
        [isMobile, onClose, releaseBodyLock, animateOutMobile]
    );

    // ── External-close detector mobile ──────────────────────────────────────
    // Il parent può settare isOpen=false direttamente senza passare per
    // triggerClose (es. MoreSheet che apre InfoSheet/AllergensSheet su tap).
    // Desktop: AnimatePresence gestisce l'exit. Mobile: serve trigger esplicito
    // dell'animate-out — altrimenti il panel resta appiccicato a y=0 finché
    // shouldRender non viene cambiato (mai, in quel flow) e si vedono i due
    // sheet sovrapposti.
    const isOpenRef = useRef(isOpen);
    useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

    useEffect(() => {
        if (!isMobile) return;
        if (isOpen) return;
        if (!shouldRender) return;
        if (isClosingRef.current) return;

        isClosingRef.current = true;
        void (async () => {
            await animateOutMobile();
            if (!isMountedRef.current) return;
            // Riaperto durante l'exit: lascia che l'open useEffect gestisca,
            // non smontare il panel.
            if (isOpenRef.current) {
                isClosingRef.current = false;
                return;
            }
            setShouldRender(false);
            isClosingRef.current = false;
        })();
    }, [isOpen, isMobile, shouldRender, animateOutMobile]);

    // ── Resync shouldRender su cambio breakpoint ────────────────────────────
    // Il ramo mobile monta/smonta in base a `shouldRender`, azzerato SOLO dal
    // path di chiusura mobile (animateOutMobile). Il path desktop chiude via
    // onClose+AnimatePresence senza mai toccare `shouldRender` — se il
    // breakpoint viene attraversato due volte (mobile→desktop→mobile) con una
    // chiusura in mezzo fatta dal ramo desktop, `shouldRender` resta stale
    // `true` e al rientro su mobile rimonta backdrop+panel anche a isOpen=false,
    // bloccando l'input silenziosamente. Risincronizza ad ogni cambio ramo.
    useEffect(() => {
        setShouldRender(isOpen);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMobile]);

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
        const desktopTree = (
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
                            style={{ willChange: panelWillChange }}
                            onAnimationComplete={() => setPanelWillChange("auto")}
                            onClick={e => e.stopPropagation()}
                        >
                            {headerContent && (
                                <div className={styles.dragZone}>
                                    {headerContent}
                                </div>
                            )}
                            {children}
                            {footerContent && (
                                <div className={styles.footerZone}>
                                    {footerContent}
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        );
        return portalTarget ? createPortal(desktopTree, portalTarget) : desktopTree;
    }

    // ── Mobile: motion value + shouldRender (no AnimatePresence sul panel) ──
    if (!shouldRender) return null;

    const mobileTree = (
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
                style={{ y, touchAction: "pan-y", willChange: panelWillChange }}
                drag="y"
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0 }}
                dragElastic={{ top: 0, bottom: 0.35 }}
                // Niente inerzia post-rilascio: al release il transform passa a un
                // solo proprietario (WAAPI in uscita, oppure spring di snap-back).
                // Col momentum attivo framer continuerebbe a scrivere y/inline
                // style SOTTO la WAAPI → al cancel il panel ricadrebbe su una
                // posizione stale (glitch drag-close).
                dragMomentum={false}
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
                {footerContent && (
                    <div className={styles.footerZone}>
                        {footerContent}
                    </div>
                )}
            </motion.div>
        </div>
    );

    return portalTarget ? createPortal(mobileTree, portalTarget) : mobileTree;
}
