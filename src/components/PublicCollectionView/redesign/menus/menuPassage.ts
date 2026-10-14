/**
 * Il passaggio tra «Scegli il menu» e il menu (mockup v38 `mpkGo`/`mpkBack`): il menu
 * entra da destra mentre la scelta scivola a sinistra e si scurisce; «Tutti i menu»
 * fa il contrario. Con le View Transitions del browser: si animano due fotografie,
 * non la pagina viva (una trasformazione sulla pagina sposterebbe barra e isola
 * fisse). Il CSS sta in `MenuChooser.module.scss` e legge `data-menu-passage`.
 * Senza View Transitions il cambio è secco; col movimento ridotto è una dissolvenza.
 */
export type PassageDirection = "go" | "back";

let running = false;

/** C'è un passaggio in corso («Tutti i menu», una card): la scelta entra ferma, anima lui. */
export function passageRunning(): boolean {
    return running;
}

/**
 * Indietro del browser verso la scelta. Un View Transition qui non si può: React
 * disegna lo stato nuovo prima che il browser fotografi il vecchio. La scelta
 * entra allora da sinistra con un'animazione sua (`data-entrance="back"`), ma
 * solo se il browser non ha già animato lui il gesto (`hasUAVisualTransition`,
 * lo swipe di Safari): due movimenti uno dopo l'altro sarebbero peggio di uno.
 * Dove il browser non lo dice, sul telefono si sta fermi (lo swipe è probabile).
 */
let lastPop: { at: number; uaAnimated: boolean } | null = null;
/** Indietro chiesto dal codice («Tutti i menu» con la scelta dietro): anima il passaggio, non questo. */
let ownBack = false;
/** Navigation API, dove c'è: dice se l'ultimo spostamento nella cronologia è andato indietro o avanti. */
let lastTraverse: { at: number; back: boolean } | null = null;

type NavigationLike = EventTarget & { currentEntry: { index: number } | null };
type EntryChangeEvent = Event & { navigationType?: string; from?: { index: number } };

if (typeof window !== "undefined") {
    // In cattura: prima del router, che al popstate fa già disegnare lo stato nuovo.
    window.addEventListener(
        "popstate",
        event => {
            const ua = (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition;
            const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
            lastPop = { at: performance.now(), uaAnimated: ownBack || (ua ?? coarse) };
            ownBack = false;
        },
        { capture: true }
    );
    const navigation = (window as Window & { navigation?: NavigationLike }).navigation;
    navigation?.addEventListener("currententrychange", event => {
        const { navigationType, from } = event as EntryChangeEvent;
        const to = navigation.currentEntry?.index;
        if (navigationType !== "traverse" || from === undefined || to === undefined) return;
        lastTraverse = { at: performance.now(), back: to < from.index };
    });
}

/** Da chiamare subito prima di un `navigate(-1)` del codice. */
export function markOwnBack(): void {
    ownBack = true;
}

/** L'ultimo indietro del browser (meno di un secondo fa) va animato da noi; l'avanti no. */
export function animateBrowserBack(): boolean {
    const now = performance.now();
    if (lastPop === null || now - lastPop.at >= 1000 || lastPop.uaAnimated) return false;
    return lastTraverse === null || now - lastTraverse.at >= 1000 || lastTraverse.back;
}

export function reducedMotion(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * `update` cambia lo stato (l'indirizzo); `ready` si risolve quando React ha
 * disegnato lo stato nuovo: solo allora il browser fotografa l'arrivo. `done`
 * a passaggio finito (o subito, se il passaggio non c'è).
 */
export function runMenuPassage(
    direction: PassageDirection,
    update: () => void,
    ready: () => Promise<void>,
    done?: () => void
): void {
    if (typeof document.startViewTransition !== "function" || running) {
        try {
            update();
        } finally {
            done?.();
        }
        return;
    }
    running = true;
    const root = document.documentElement;
    root.dataset.menuPassage = direction;
    const transition = document.startViewTransition(() => {
        const drawn = ready();
        update();
        return drawn;
    });
    // Passaggio saltato (scheda nascosta): `ready` rifiuta, il cambio è già avvenuto.
    transition.ready.catch(() => undefined);
    void transition.finished
        .finally(() => {
            running = false;
            delete root.dataset.menuPassage;
            done?.();
        })
        .catch(() => undefined);
}
