import {
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";
import { PublicPortalContext } from "@/features/public/components/PublicPortalContext";
import { PUBLIC_MOBILE_QUERY } from "../../publicBreakpoints";
import { useSheetBodyLock } from "../../hooks/useSheetBodyLock";
import {
    ENTER_DURATION_MS,
    EXIT_DURATION_MS,
    PUSH_DURATION_MS,
    SHEET_EASING,
    exitDuration,
    shouldDismissOnRelease,
    trackOffsetPercent
} from "./sheetMotion";
import {
    closeSheet,
    popSheetPage,
    takeSheetOpener,
    useSheetState,
    type SheetPage
} from "./sheetStack";
import styles from "./SheetHost.module.scss";

type Props = {
    /** Contenuto di una pagina del foglio, dalla sua `key`. */
    renderPage: (page: SheetPage) => ReactNode;
    /**
     * Radice della pagina sotto il foglio: riceve `inert` finché il foglio è
     * aperto (niente fuoco né tocchi fuori, senza focus trap). NON deve
     * contenere il punto d'innesto del portal, altrimenti blocca anche il foglio.
     */
    backgroundRef?: RefObject<HTMLElement | null>;
};

const subscribeToQuery = (query: string) => (notify: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", notify);
    return () => mq.removeEventListener("change", notify);
};
const mobileSubscribe = subscribeToQuery(PUBLIC_MOBILE_QUERY);
const reducedSubscribe = subscribeToQuery("(prefers-reduced-motion: reduce)");

function useMediaQuery(query: string, subscribe: (notify: () => void) => () => void): boolean {
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(query).matches,
        () => false
    );
}

/**
 * Il solo foglio della pagina pubblica: una pila di pagine che si spingono da
 * destra, un velo unico, la pagina sotto bloccata (scroll una volta sola, via
 * `useSheetBodyLock`, e `inert`). Mobile = foglio attaccato al fondo, da ≥641px
 * = finestra al centro. Si anima solo `transform` e `opacity` (più l'altezza
 * nella spinta), tutto in WAAPI: gira sul compositor e un solo proprietario per
 * volta scrive il `transform` del pannello (niente framer-motion qui).
 *
 * Non è montato nella pagina di oggi: lo usano le PR del redesign.
 */
export default function SheetHost({ renderPage, backgroundRef }: Props) {
    const state = useSheetState();
    const isOpen = state.pages.length > 0;
    const portalTarget = useContext(PublicPortalContext);
    const isMobile = useMediaQuery(PUBLIC_MOBILE_QUERY, mobileSubscribe);
    const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", reducedSubscribe);

    // Montato anche durante l'uscita: `shown` tiene le pagine, `leaving` quella
    // appena tolta dalla pila finché la spinta all'indietro non è finita.
    const [present, setPresent] = useState(false);
    const [shown, setShown] = useState<readonly SheetPage[]>([]);
    const [leaving, setLeaving] = useState<readonly SheetPage[]>([]);
    if (isOpen && shown !== state.pages) {
        setLeaving(state.move === "pop" ? shown.slice(state.pages.length) : []);
        setShown(state.pages);
    }
    if (isOpen && !present) setPresent(true);

    const panelRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const animations = useRef<Animation[]>([]);
    // La spinta della pista ha un proprietario a parte: il trascinamento del
    // foglio non deve annullarla (resterebbe montata la pagina uscente).
    const trackAnimation = useRef<Animation | null>(null);
    const prevIndex = useRef(0);
    const animateHeight = useRef(false);
    const env = useRef({ isMobile, reducedMotion });
    const drag = useRef({ active: false, startY: 0, lastY: 0, lastT: 0, velocity: 0, offset: 0 });
    const exitFrom = useRef({ offset: 0, velocity: 0 });

    useEffect(() => {
        env.current = { isMobile, reducedMotion };
    }, [isMobile, reducedMotion]);

    useSheetBodyLock(isOpen);

    // Host smontato (cambio di rotta) con il foglio aperto: si chiude lo store e
    // si lascia andare il nodo ricordato per il fuoco.
    useEffect(
        () => () => {
            closeSheet();
            takeSheetOpener();
        },
        []
    );

    const cancelAnimations = useCallback(() => {
        for (const animation of animations.current) animation.cancel();
        animations.current = [];
    }, []);

    const play = useCallback((element: HTMLElement | null, keyframes: Keyframe[], duration: number) => {
        if (!element || typeof element.animate !== "function" || env.current.reducedMotion) return null;
        const animation = element.animate(keyframes, { duration, easing: SHEET_EASING });
        animations.current.push(animation);
        // Via dalla lista a fine corsa: la lista non cresce all'infinito.
        const forget = () => {
            animations.current = animations.current.filter(a => a !== animation);
        };
        animation.finished.then(forget, forget);
        return animation;
    }, []);

    const index = Math.max(0, shown.length - 1);
    const activePage = shown[index];

    // ── Entrata ──────────────────────────────────────────────────────────────
    useLayoutEffect(() => {
        if (!isOpen) return;
        cancelAnimations();
        const panel = panelRef.current;
        if (!panel) return;
        panel.style.transform = "";
        if (backdropRef.current) backdropRef.current.style.opacity = "";
        play(
            panel,
            env.current.isMobile
                ? [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }]
                : [
                      { opacity: 0, transform: "scale(0.97)" },
                      { opacity: 1, transform: "scale(1)" }
                  ],
            ENTER_DURATION_MS
        );
        play(backdropRef.current, [{ opacity: 0 }, { opacity: 1 }], ENTER_DURATION_MS);
        panel.focus({ preventScroll: true });
    }, [isOpen, cancelAnimations, play]);

    // ── Uscita ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (isOpen || !present) return;
        const panel = panelRef.current;
        const backdrop = backdropRef.current;
        const { offset, velocity } = exitFrom.current;
        exitFrom.current = { offset: 0, velocity: 0 };
        let cancelled = false;
        const finish = () => {
            if (cancelled) return;
            cancelAnimations();
            setPresent(false);
            setShown([]);
            setLeaving([]);
            takeSheetOpener()?.focus({ preventScroll: true });
        };
        cancelAnimations();
        const target = env.current.isMobile ? "translateY(110%)" : "scale(0.97)";
        const from = env.current.isMobile ? `translateY(${offset}px)` : "scale(1)";
        const duration = env.current.isMobile
            ? exitDuration((panel?.offsetHeight ?? 0) - offset, velocity)
            : EXIT_DURATION_MS;
        const exiting = play(
            panel,
            env.current.isMobile
                ? [{ transform: from }, { transform: target }]
                : [
                      { opacity: 1, transform: from },
                      { opacity: 0, transform: target }
                  ],
            duration
        );
        play(backdrop, [{ opacity: backdropOpacity(backdrop) }, { opacity: 0 }], duration);
        if (!exiting) {
            finish();
        } else {
            // fill:"none" → a fine animazione pannello e velo tornerebbero visibili
            // per un frame (il velo a opacità piena: un lampo scuro a tutta pagina):
            // si tengono fuori scena finché non si smonta.
            exiting.finished.then(
                () => {
                    if (panel) panel.style.visibility = "hidden";
                    if (backdrop) backdrop.style.visibility = "hidden";
                    finish();
                },
                () => undefined
            );
        }
        return () => {
            cancelled = true;
            if (panel) panel.style.visibility = "";
            if (backdrop) backdrop.style.visibility = "";
        };
    }, [isOpen, present, cancelAnimations, play]);

    // ── Pagina sotto inerte + Esc ────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        const background = backgroundRef?.current ?? null;
        if (background) background.inert = true;
        const onKeyDown = (event: KeyboardEvent) => {
            // Un campo o un menu dentro la pagina può aver già usato Esc.
            if (event.key !== "Escape" || event.defaultPrevented) return;
            event.preventDefault();
            popSheetPage();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            if (background) background.inert = false;
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [isOpen, backgroundRef]);

    // ── Spinta: la pista scorre di una pagina, l'altezza segue ───────────────
    useLayoutEffect(() => {
        const track = trackRef.current;
        if (!present || !track) return;
        const from = trackOffsetPercent(prevIndex.current);
        const to = trackOffsetPercent(index);
        track.style.transform = `translateX(${to}%)`;
        if (from !== to && (state.move === "push" || state.move === "pop")) {
            animateHeight.current = true;
            // Una spinta nuova ferma la precedente (push e subito «‹»): due
            // scorrimenti insieme sulla stessa pista non hanno senso.
            trackAnimation.current?.cancel();
            const animation = play(
                track,
                [{ transform: `translateX(${from}%)` }, { transform: `translateX(${to}%)` }],
                PUSH_DURATION_MS
            );
            trackAnimation.current = animation;
            if (animation) {
                // Solo se è ancora l'ultima: una cancellata non svuota `leaving`.
                animation.finished.then(
                    () => {
                        if (trackAnimation.current === animation) setLeaving([]);
                    },
                    () => undefined
                );
            } else {
                setLeaving([]);
            }
            // Il fuoco segue la spinta: la pagina che lo aveva è diventata inert.
            panelRef.current?.focus({ preventScroll: true });
        }
        prevIndex.current = index;
    }, [present, index, state.move, play]);

    // Altezza: segue il contenuto della pagina attiva (ResizeObserver); nella
    // spinta passa da un'altezza all'altra in animazione, altrimenti si imposta.
    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const content = trackRef.current?.children[index]?.firstElementChild;
        if (!present || !viewport || !content) return;
        const apply = () => {
            const next = (content as HTMLElement).offsetHeight;
            const previous = viewport.getBoundingClientRect().height;
            viewport.style.height = `${next}px`;
            if (animateHeight.current && previous > 0 && previous !== next) {
                play(viewport, [{ height: `${previous}px` }, { height: `${next}px` }], PUSH_DURATION_MS);
            }
            animateHeight.current = false;
        };
        apply();
        const observer = new ResizeObserver(apply);
        observer.observe(content);
        return () => observer.disconnect();
    }, [present, index, shown, play]);

    // ── Trascinamento per chiudere (solo mobile, maniglia e testata) ─────────
    const onDragStart = (event: ReactPointerEvent<HTMLElement>) => {
        if (!env.current.isMobile || (event.target as HTMLElement).closest("button")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        cancelAnimations();
        drag.current = {
            active: true,
            startY: event.clientY,
            lastY: event.clientY,
            lastT: event.timeStamp,
            velocity: 0,
            offset: 0
        };
    };
    const onDragMove = (event: ReactPointerEvent<HTMLElement>) => {
        const d = drag.current;
        const panel = panelRef.current;
        if (!d.active || !panel) return;
        d.offset = Math.max(0, event.clientY - d.startY);
        const dt = event.timeStamp - d.lastT;
        // Campioni sotto gli 8 ms sono rumore (jitter di un tap): si aspetta il prossimo.
        if (dt >= 8) {
            d.velocity = (event.clientY - d.lastY) / dt;
            d.lastY = event.clientY;
            d.lastT = event.timeStamp;
        }
        panel.style.transform = `translateY(${d.offset}px)`;
        if (backdropRef.current) {
            backdropRef.current.style.opacity = String(Math.max(0, 1 - d.offset / (panel.offsetHeight || 1)));
        }
    };
    const onDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
        const d = drag.current;
        const panel = panelRef.current;
        if (!d.active || !panel) return;
        d.active = false;
        // Dito fermo prima del rilascio: la velocità dell'ultimo movimento non vale più.
        if (event.timeStamp - d.lastT > 80) d.velocity = 0;
        if (shouldDismissOnRelease(d.offset, d.velocity)) {
            exitFrom.current = { offset: d.offset, velocity: d.velocity };
            closeSheet();
            return;
        }
        // Rilascio corto: torna su. L'inline si azzera subito, la WAAPI dipinge il ritorno.
        const back = d.offset;
        panel.style.transform = "";
        if (backdropRef.current) backdropRef.current.style.opacity = "";
        if (back > 0) {
            play(panel, [{ transform: `translateY(${back}px)` }, { transform: "translateY(0)" }], EXIT_DURATION_MS);
        }
    };

    if (!present || !activePage) return null;

    const tree = (
        <div className={styles.root}>
            <div ref={backdropRef} className={styles.backdrop} onClick={closeSheet} role="presentation" />
            <div
                ref={panelRef}
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby="pub-sheet-title"
                tabIndex={-1}
                data-size={activePage.size ?? "medium"}
            >
                <div
                    className={styles.dragZone}
                    onPointerDown={onDragStart}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                >
                    <span className={styles.handle} aria-hidden="true" />
                    <div className={styles.header}>
                        {shown.length > 1 ? (
                            <button type="button" className={styles.iconButton} onClick={popSheetPage} aria-label="Indietro">
                                <ChevronLeft size={20} aria-hidden="true" />
                            </button>
                        ) : null}
                        <h2 id="pub-sheet-title" className={styles.title}>
                            {activePage.title}
                        </h2>
                        <button type="button" className={styles.iconButton} onClick={closeSheet} aria-label="Chiudi">
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                </div>
                <div ref={viewportRef} className={styles.viewport}>
                    <div ref={trackRef} className={styles.track}>
                        {[...shown, ...leaving].map((page, i) => (
                            <div
                                key={page.key}
                                className={styles.page}
                                inert={i !== index}
                                aria-hidden={i !== index}
                            >
                                <div className={styles.pageContent}>{renderPage(page)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    return portalTarget ? createPortal(tree, portalTarget) : tree;
}

function backdropOpacity(backdrop: HTMLElement | null): number {
    if (!backdrop) return 1;
    const value = Number.parseFloat(backdrop.style.opacity);
    return Number.isFinite(value) ? value : 1;
}
