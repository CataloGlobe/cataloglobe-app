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
import { useTranslation } from "react-i18next";
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
    notifySheetShown,
    popSheetPage,
    takeSheetOpener,
    takePageOpener,
    useSheetState,
    type SheetPage
} from "./sheetStack";
import styles from "./SheetHost.module.scss";

/** Finestra a tendina o popover: 8 px sotto il suo aggancio (spec §13), larga 560 se non dice altro. */
const ANCHOR_GAP_PX = 8;
const ANCHORED_WIDTH_PX = 560;
/** Distanza minima dai bordi della finestra del browser. */
const ANCHOR_MARGIN_PX = 24;

type Props = {
    /** Contenuto di una pagina del foglio, dalla sua `key`. */
    renderPage: (page: SheetPage) => ReactNode;
    /**
     * Piede della pagina in cima (es. il pulsante d'azione): fuori dall'area che
     * scorre, sempre visibile. Null se la pagina non ne ha.
     */
    renderFooter?: (page: SheetPage) => ReactNode;
    /**
     * Testata su misura della pagina in cima (es. il campo della ricerca con
     * «Annulla») al posto di «‹ Madre», titolo e chiudi. Il titolo resta per i
     * lettori di schermo. Null = testata normale.
     */
    renderHeader?: (page: SheetPage) => ReactNode;
    /** Riga sotto il titolo di una pagina `stacked` (il prezzo del piatto). Null = niente. */
    renderHeading?: (page: SheetPage) => ReactNode;
    /**
     * Radice della pagina sotto il foglio: riceve `inert` finché il foglio è
     * aperto (niente fuoco né tocchi fuori, senza focus trap). NON deve
     * contenere il punto d'innesto del portal, altrimenti blocca anche il foglio.
     */
    backgroundRef?: RefObject<HTMLElement | null>;
};

/** Righe più alte di così (sezioni intere) non si tagliano a metà. */
const MAX_HALF_ROW_PX = 120;

/**
 * Altezza della finestra del foglio. Di norma quella del contenuto; se il tetto
 * del pannello la taglia, si ferma a metà della riga che resta sotto il bordo,
 * così si vede che la lista continua (spec §5). Imposta lo stile e ritorna il valore.
 */
function cutAtHalfRow(viewport: HTMLElement, content: HTMLElement): number {
    const full = content.offsetHeight;
    viewport.style.height = `${full}px`;
    // Misure di layout (offset*), non getBoundingClientRect: all'entrata il
    // pannello è già in scala 0.97 su desktop e i rettangoli sarebbero scalati.
    const shown = viewport.clientHeight;
    if (shown >= full - 1) return full;
    // La riga sotto il bordo (anche se il bordo cade esattamente fra due righe,
    // che sembrerebbe la fine della lista); se se ne vede appena un filo, la precedente.
    const rows = Array.from(content.firstElementChild?.children ?? []) as HTMLElement[];
    const halfOf = (row: HTMLElement | undefined) =>
        row && row.offsetHeight <= MAX_HALF_ROW_PX ? row.offsetTop - content.offsetTop + row.offsetHeight / 2 : null;
    for (let i = 0; i < rows.length; i += 1) {
        const rowTop = rows[i].offsetTop - content.offsetTop;
        if (rowTop < shown && rowTop + rows[i].offsetHeight >= shown) {
            let half = halfOf(rows[i]);
            if (half !== null && half >= shown) half = halfOf(rows[i - 1]);
            if (half === null || half >= shown) break;
            viewport.style.height = `${half}px`;
            return half;
        }
    }
    return full;
}

/** Cenno di scorrimento: quanto sale il contenuto e in quanto torna (spec §5). */
const NUDGE_PX = 12;
const NUDGE_DURATION_MS = 600;
/** Pagine che hanno già fatto il cenno in questa visita. */
const nudgedPages = new Set<string>();

function hasMore(page: HTMLElement): boolean {
    return page.scrollHeight - page.scrollTop - page.clientHeight > 1;
}

function markMore(page: HTMLElement): void {
    const more = hasMore(page);
    if ((page.dataset.more === "true") !== more) page.dataset.more = String(more);
}

// Host montati adesso: uno solo nella pagina, ma lo smontaggio va contato (vedi sotto).
let mountedHosts = 0;

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
export default function SheetHost({ renderPage, renderFooter, renderHeader, renderHeading, backgroundRef }: Props) {
    const { t } = useTranslation("public");
    const state = useSheetState();
    const isOpen = state.pages.length > 0;
    // Letta dall'entrata senza farne una dipendenza: conta solo all'apertura.
    const growFrom = useRef<number | undefined>(undefined);
    growFrom.current = state.pages[0]?.growFrom;
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

    const rootRef = useRef<HTMLDivElement>(null);
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
    const heightAnimation = useRef<Animation | null>(null);
    const env = useRef({ isMobile, reducedMotion });
    const drag = useRef({ active: false, startY: 0, lastY: 0, lastT: 0, velocity: 0, offset: 0, height: 1 });
    const exitFrom = useRef({ offset: 0, velocity: 0 });

    useEffect(() => {
        env.current = { isMobile, reducedMotion };
    }, [isMobile, reducedMotion]);

    useSheetBodyLock(isOpen);

    // Host smontato (cambio di rotta) con il foglio aperto: si chiude lo store e
    // si lascia andare il nodo ricordato per il fuoco. Si aspetta un microtask:
    // lo smontaggio finto di StrictMode (o un host montato a foglio già aperto,
    // come quello caricato al primo tocco) rimonta subito e non deve chiudere.
    useEffect(() => {
        mountedHosts += 1;
        return () => {
            mountedHosts -= 1;
            queueMicrotask(() => {
                if (mountedHosts > 0) return;
                closeSheet();
                takeSheetOpener();
                // Pagina nuova, visita nuova: il cenno torna a valere.
                nudgedPages.clear();
            });
        };
    }, []);

    // Dopo una spinta in avanti `leaving` è già vuoto: lo stesso stato, nessun render
    // proprio nel frame in cui finisce la corsa.
    const clearLeaving = useCallback(() => setLeaving(prev => (prev.length ? [] : prev)), []);

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
    const parentPage = index > 0 ? shown[index - 1] : undefined;

    // ── Finestra a tendina (desktop) ─────────────────────────────────────────
    // La prima pagina decide: la ricerca si apre sotto l'isola, non al centro.
    // Misura dopo il blocco del body (layout effect dichiarato prima), e a ogni resize.
    const anchor = shown[0]?.anchor;
    useLayoutEffect(() => {
        const root = rootRef.current;
        const panel = panelRef.current;
        if (!root || !panel) return;
        const clear = () => {
            delete root.dataset.anchored;
            root.style.removeProperty("--sheet-veil-clip");
            for (const name of [
                "--sheet-anchor-top",
                "--sheet-anchor-left",
                "--sheet-anchor-width",
                "--sheet-field-top",
                "--sheet-field-height"
            ]) {
                panel.style.removeProperty(name);
            }
        };
        if (!present || isMobile || !anchor) {
            clear();
            return;
        }
        const place = () => {
            const below = document.getElementById(anchor.below)?.getBoundingClientRect();
            if (!below || below.width === 0) {
                clear();
                return;
            }
            const align = anchor.align ? document.getElementById(anchor.align)?.getBoundingClientRect() : undefined;
            const aligned = !!align && align.width > 0;
            const width = aligned
                ? align.width
                : Math.min(anchor.width ?? ANCHORED_WIDTH_PX, window.innerWidth - 2 * ANCHOR_MARGIN_PX);
            const left = aligned
                ? align.left
                : Math.min(
                      window.innerWidth - ANCHOR_MARGIN_PX - width,
                      Math.max(ANCHOR_MARGIN_PX, below.right - (anchor.inset ?? 0) - width)
                  );
            // «field»: a tendina sotto il campo; «end»: popover dal bordo destro del pulsante.
            root.dataset.anchored = aligned ? "field" : "end";
            const top = Math.round(below.bottom + ANCHOR_GAP_PX);
            panel.style.setProperty("--sheet-anchor-top", `${top}px`);
            panel.style.setProperty("--sheet-anchor-left", `${Math.round(left)}px`);
            panel.style.setProperty("--sheet-anchor-width", `${Math.round(width)}px`);
            if (!aligned || !align) {
                root.style.removeProperty("--sheet-veil-clip");
                return;
            }
            // Mockup v38: il campo è quello dell'isola. La testata della pagina (il campo
            // vero) si posa sopra il campo dell'isola, che si nasconde (SearchHeader); il
            // velo lascia un buco sull'isola, che resta nitida. Il tocco sul buco chiude.
            panel.style.setProperty("--sheet-field-top", `${Math.round(align.top) - top}px`);
            panel.style.setProperty("--sheet-field-height", `${Math.round(align.height)}px`);
            const island = document.getElementById(anchor.below);
            // Il raggio è quello del vetro dell'isola, il suo primo figlio.
            const shell = island?.firstElementChild;
            const radius = shell ? Number.parseFloat(getComputedStyle(shell).borderTopLeftRadius) || 0 : 0;
            root.style.setProperty("--sheet-veil-clip", veilWithHole(below, radius));
        };
        place();
        window.addEventListener("resize", place);
        // Anche se cambia solo l'isola (font del locale che arriva, isola che si compatta).
        const target = document.getElementById(anchor.below);
        const ro = target ? new ResizeObserver(place) : null;
        if (target) ro?.observe(target);
        return () => {
            window.removeEventListener("resize", place);
            ro?.disconnect();
            clear();
        };
    }, [present, isMobile, anchor]);

    // ── Entrata ──────────────────────────────────────────────────────────────
    useLayoutEffect(() => {
        if (!isOpen) return;
        cancelAnimations();
        const panel = panelRef.current;
        if (!panel) return;
        panel.style.transform = "";
        if (backdropRef.current) backdropRef.current.style.opacity = "";
        // Dalla modale del voto: si vede già la sua parte alta, il resto cresce sotto.
        // In percentuale: segue l'altezza vera anche se il contenuto arriva dopo.
        const grow = growFrom.current;
        const from = grow ? `translateY(calc(100% - ${Math.round(grow)}px))` : "translateY(100%)";
        const entering = [
            play(
                panel,
                env.current.isMobile
                    ? [{ transform: from }, { transform: "translateY(0)" }]
                    : [
                          { opacity: 0, transform: "scale(0.97)" },
                          { opacity: 1, transform: "scale(1)" }
                      ],
                ENTER_DURATION_MS
            ),
            play(backdropRef.current, [{ opacity: 0 }, { opacity: 1 }], ENTER_DURATION_MS)
        ].filter((animation): animation is Animation => !!animation);
        let stopWaiting: (() => void) | undefined;
        if (entering.length) {
            stopWaiting = startAfterHeavyFrame(entering, notifySheetShown);
        } else {
            notifySheetShown();
        }
        // Un campo della pagina può aver già preso il fuoco (la ricerca, nel gesto
        // della lente): rubarlo chiuderebbe la tastiera su iOS.
        if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
        return () => stopWaiting?.();
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
            // Il fuoco torna a chi ha aperto il foglio solo se nessun altro l'ha preso:
            // «Filtri» chiude il foglio e apre la ricerca, che ha già il suo fuoco.
            const opener = takeSheetOpener();
            const active = document.activeElement;
            if (!active || active === document.body || panel?.contains(active)) {
                opener?.focus({ preventScroll: true });
            }
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
        const fading = play(backdrop, [{ opacity: backdropOpacity(backdrop) }, { opacity: 0 }], duration);
        // Chiusura da ×, Esc o velo: la pagina sotto si sblocca nello stesso frame
        // (vedi startAfterHeavyFrame). Dopo un trascinamento no: il foglio deve
        // seguire il dito senza fermarsi.
        const stopWaiting =
            exiting && offset === 0 && velocity === 0
                ? startAfterHeavyFrame([exiting, fading].filter((a): a is Animation => !!a))
                : undefined;
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
            stopWaiting?.();
            if (panel) panel.style.visibility = "";
            if (backdrop) backdrop.style.visibility = "";
        };
    }, [isOpen, present, cancelAnimations, play]);

    // ── Pagina sotto inerte + Esc ────────────────────────────────────────────
    // Layout effect: alla chiusura `inert` va via prima che i layout effect di
    // chi si apre al suo posto (la ricerca dai Filtri) mettano il fuoco.
    useLayoutEffect(() => {
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
                        if (trackAnimation.current === animation) clearLeaving();
                    },
                    () => undefined
                );
            } else {
                clearLeaving();
            }
            // Il fuoco segue la spinta: la pagina che lo aveva è diventata inert.
            // Resta dov'è se la pagina nuova (o la sua testata) l'ha già preso.
            // Altrimenti, con «‹», torna a chi aveva aperto la pagina lasciata, se c'è ancora.
            const panel = panelRef.current;
            const back = state.move === "pop" ? takePageOpener() : null;
            const active = document.activeElement;
            const kept = !!active && active !== panel && !!panel?.contains(active) && !active.closest("[inert]");
            if (panel && !kept) {
                if (back && back !== panel && panel.contains(back) && !back.closest("[inert]")) {
                    back.focus({ preventScroll: true });
                } else {
                    panel.focus({ preventScroll: true });
                }
            }
        }
        prevIndex.current = index;
    }, [present, index, state.move, play, clearLeaving]);

    // Altezza: segue il contenuto della pagina attiva (ResizeObserver); nella
    // spinta passa da un'altezza all'altra in animazione, altrimenti si imposta.
    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const content = trackRef.current?.children[index]?.firstElementChild;
        if (!present || !viewport || !content) return;
        const fill = shown[index]?.fill === true;
        const apply = () => {
            const previous = viewport.getBoundingClientRect().height;
            // Il ResizeObserver scatta anche a metà spinta (la prima chiamata arriva
            // sempre): l'altezza in corsa coprirebbe quella nuova e il taglio a metà
            // riga misurerebbe la vecchia. Si ferma e si riparte da dove era.
            const running = heightAnimation.current?.playState === "running" ? heightAnimation.current : null;
            heightAnimation.current = null;
            running?.cancel();
            let next: number;
            if (fill) {
                // Più alta del tetto: il flex del pannello la riporta al massimo disponibile.
                viewport.style.height = "200vh";
                next = viewport.clientHeight;
            } else {
                next = cutAtHalfRow(viewport, content as HTMLElement);
            }
            if ((animateHeight.current || running) && previous > 0 && Math.abs(previous - next) > 0.5) {
                heightAnimation.current = play(viewport, [{ height: `${previous}px` }, { height: `${next}px` }], PUSH_DURATION_MS);
            }
            animateHeight.current = false;
        };
        apply();
        const observer = new ResizeObserver(apply);
        observer.observe(content);
        return () => observer.disconnect();
    }, [present, index, shown, play]);

    // Segnali di scorrimento (spec §5): sfumatura in fondo finché c'è altro sotto
    // (`data-more` sulla pagina, letto dal CSS), e una volta per pagina per visita
    // il contenuto sale di 12 px e torna, dopo l'entrata o la spinta.
    useLayoutEffect(() => {
        const page = trackRef.current?.children[index] as HTMLElement | undefined;
        const content = page?.firstElementChild as HTMLElement | null | undefined;
        if (!present || !page || !content || !activePage) return;
        const update = () => markMore(page);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(page);
        observer.observe(content);
        // Fuori da `play`: un'altra entrata o un trascinamento non lo annullano a metà
        // (resta sul contenuto, non tocca pannello né binario).
        // «C'è altro sotto» si guarda quando il movimento parte, non adesso: durante
        // l'entrata o la spinta l'altezza del foglio è ancora quella di partenza
        // (animata) e il contenuto sembrava scorrere anche quando ci stava tutto.
        let nudge: number | undefined;
        if (!nudgedPages.has(activePage.key) && !env.current.reducedMotion && typeof content.animate === "function") {
            const key = activePage.key;
            nudge = window.setTimeout(
                () => {
                    if (nudgedPages.has(key) || !hasMore(page)) return;
                    nudgedPages.add(key);
                    content.animate(
                        [{ transform: "translateY(0)" }, { transform: `translateY(-${NUDGE_PX}px)` }, { transform: "translateY(0)" }],
                        { duration: NUDGE_DURATION_MS, easing: "ease-in-out" }
                    );
                },
                // qualche ms in più: l'altezza animata deve aver chiuso il suo ultimo fotogramma
                (state.move === "open" ? ENTER_DURATION_MS : PUSH_DURATION_MS) + 50
            );
        }
        return () => {
            window.clearTimeout(nudge);
            observer.disconnect();
        };
        // `state.move` si legge al momento della pagina nuova, non è un motivo per rifare il giro.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [present, index, activePage]);

    // ── Trascinamento per chiudere (solo mobile, maniglia e testata) ─────────
    const onDragStart = (event: ReactPointerEvent<HTMLElement>) => {
        if (!env.current.isMobile || (event.target as HTMLElement).closest("button, input, textarea, select, a")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        cancelAnimations();
        drag.current = {
            active: true,
            startY: event.clientY,
            lastY: event.clientY,
            lastT: event.timeStamp,
            velocity: 0,
            offset: 0,
            // Misurata una volta: durante il gesto niente letture di layout (WebKit).
            height: panelRef.current?.offsetHeight || 1
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
            backdropRef.current.style.opacity = String(Math.max(0, 1 - d.offset / d.height));
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
    const footer = renderFooter?.(activePage) ?? null;
    const customHeader = renderHeader?.(activePage) ?? null;
    const heading = activePage.stacked ? (renderHeading?.(activePage) ?? null) : null;
    // Spinta normale: solo «‹». Il nome della madre solo dove il
    // ritorno non è ovvio (`named`, mockup v38); senza nome si legge «Indietro».
    const backButton = parentPage ? (
        <button
            type="button"
            className={styles.backButton}
            data-named={parentPage.named || undefined}
            onClick={popSheetPage}
            aria-label={parentPage.named ? t("sheet.back_to", { title: parentPage.title }) : t("sheet.back")}
        >
            <ChevronLeft size={22} aria-hidden="true" />
            {parentPage.named ? <span className={styles.backLabel}>{parentPage.title}</span> : null}
        </button>
    ) : null;
    const closeButton = (
        <button type="button" className={styles.closeButton} onClick={closeSheet} aria-label={t("sheet.close")}>
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
        </button>
    );

    const tree = (
        <div ref={rootRef} className={styles.root}>
            <div ref={backdropRef} className={styles.backdrop} onClick={closeSheet} role="presentation" />
            <div
                ref={panelRef}
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby="pub-sheet-title"
                tabIndex={-1}
                data-size={activePage.size ?? "medium"}
                data-custom={customHeader ? "" : undefined}
                data-accent={activePage.accent}
            >
                <div
                    className={styles.dragZone}
                    onPointerDown={onDragStart}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                >
                    <span className={styles.handle} aria-hidden="true" />
                    {customHeader ? (
                        <div key={activePage.key} className={styles.header}>
                            <h2 id="pub-sheet-title" className={styles.hiddenTitle}>
                                {activePage.title}
                            </h2>
                            {customHeader}
                        </div>
                    ) : activePage.floatingClose ? (
                        <div className={styles.header} data-floating="">
                            <h2 id="pub-sheet-title" className={styles.hiddenTitle}>
                                {activePage.title}
                            </h2>
                            {closeButton}
                        </div>
                    ) : activePage.stacked ? (
                        // Scheda prodotto (mockup v38): «‹ Madre» sopra, nome che va a capo
                        // e prezzo sotto; restano fermi mentre il corpo scorre.
                        <div className={styles.header} data-stacked="">
                            {parentPage?.named ? null : backButton}
                            <div className={styles.headText}>
                                {parentPage?.named ? backButton : null}
                                <h2 id="pub-sheet-title" className={styles.title}>
                                    {activePage.title}
                                </h2>
                                {heading}
                            </div>
                            {closeButton}
                        </div>
                    ) : (
                        <div className={styles.header}>
                            {backButton}
                            <h2
                                id="pub-sheet-title"
                                className={styles.title}
                                data-hidden={activePage.titleHidden || undefined}
                            >
                                {activePage.title}
                            </h2>
                            {closeButton}
                        </div>
                    )}
                </div>
                <div ref={viewportRef} className={styles.viewport}>
                    <div ref={trackRef} className={styles.track}>
                        {[...shown, ...leaving].map((page, i) => (
                            <div
                                key={page.key}
                                className={styles.page}
                                inert={i !== index}
                                aria-hidden={i !== index}
                                onScroll={event => markMore(event.currentTarget)}
                            >
                                <div className={styles.pageContent}>{renderPage(page)}</div>
                            </div>
                        ))}
                    </div>
                </div>
                {footer ? (
                    <div key={activePage.key} className={styles.footer}>
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );

    return portalTarget ? createPortal(tree, portalTarget) : tree;
}

/** Velo a tutto schermo con un buco a rettangolo arrotondato (evenodd) dove sta `hole`. */
function veilWithHole(hole: DOMRect, radius: number): string {
    const W = Math.ceil(window.innerWidth);
    const H = Math.ceil(window.innerHeight);
    const x = Math.round(hole.left);
    const y = Math.round(hole.top);
    const w = Math.round(hole.width);
    const h = Math.round(hole.height);
    const r = Math.min(Math.round(radius), w / 2, h / 2);
    const arc = (dx: number, dy: number) => `A${r} ${r} 0 0 1 ${dx} ${dy}`;
    const box =
        `M${x + r} ${y}H${x + w - r}${arc(x + w, y + r)}V${y + h - r}${arc(x + w - r, y + h)}` +
        `H${x + r}${arc(x, y + h - r)}V${y + r}${arc(x + r, y)}Z`;
    return `path(evenodd, "M0 0H${W}V${H}H0Z ${box}")`;
}

/**
 * Su iPhone il frame in cui il foglio si monta, o la pagina sotto si blocca e si
 * sblocca (ridisegno di tutta la pagina), può durare 40-60 ms: con la corsa già
 * partita Safari ne salta l'inizio e il foglio compare o sparisce quasi di colpo.
 * La corsa resta ferma al primo fotogramma e parte due frame dopo, a lavoro fatto.
 * Restituisce l'annullamento dell'attesa.
 */
function startAfterHeavyFrame(animations: Animation[], onStart?: () => void): () => void {
    for (const animation of animations) animation.pause();
    let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
            // Un trascinamento nel frattempo l'ha già annullata: non riparte.
            for (const animation of animations) if (animation.playState === "paused") animation.play();
            onStart?.();
        });
    });
    return () => cancelAnimationFrame(frame);
}

function backdropOpacity(backdrop: HTMLElement | null): number {
    if (!backdrop) return 1;
    const value = Number.parseFloat(backdrop.style.opacity);
    return Number.isFinite(value) ? value : 1;
}
