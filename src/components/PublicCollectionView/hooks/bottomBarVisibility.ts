/**
 * Regole di visibilità della bottom bar pubblica (mobile): tutto o niente,
 * la barra intera si nasconde scorrendo giù e ricompare scorrendo su.
 * Puro, senza DOM: il hook `useBottomBarAutoHide` legge lo scroll e chiama
 * `stepScroll` / `revealBar` / `resyncScroll`. Provato in
 * `src/tests/bottomBarVisibility.test.ts`.
 */

/** Entro questa distanza dalla cima la barra resta sempre visibile. */
export const TOP_ZONE_PX = 120;
/** Scroll giù cumulativo che nasconde la barra. */
export const HIDE_AFTER_PX = 6;
/** Scroll su cumulativo che la fa ricomparire. */
export const SHOW_AFTER_PX = 12;
/** Dopo ogni ricomparsa (scroll su, cima, fine pagina, carrello, sheet chiusa,
 *  da fermo) serve più scroll giù per nasconderla di nuovo. */
export const HIDE_AFTER_REVEAL_PX = 80;
/** Isteresi: dopo un cambio di stato, nessun cambio opposto per la durata
 *  dell'animazione (entrata 280ms, uscita 220ms). Contro il «blink». */
export const TRANSITION_LOCK_MS = 300;
/** Finestra in cui gli scroll programmatici (categoria, Menu → cima) non contano. */
export const PROGRAMMATIC_IGNORE_MS = 900;
/** Smooth scroll lungo: dove c'è `scrollend`, si continua a ignorare fino a
 *  quello, al massimo per tanto oltre la finestra. */
export const PROGRAMMATIC_MAX_EXTRA_MS = 1500;
/** Resize della toolbar del browser (visualViewport.height cambia): gli scroll
 *  che ne seguono non sono dell'utente e non contano per tanto. */
export const VIEWPORT_RESIZE_IGNORE_MS = 150;
/** Da fermo: nascosta e senza sheet aperte, ricompare dopo tanto dall'ultimo
 *  scroll. Ogni scroll azzera il conto; gli scroll programmatici non lo avviano. */
export const IDLE_REVEAL_MS = 1500;
/** Margine per riconoscere la fine pagina (arrotondamenti subpixel). */
const END_EPSILON_PX = 2;

export type BarVisibilityState = {
    hidden: boolean;
    lastY: number;
    downAcc: number;
    upAcc: number;
    /** Scroll giù richiesto per nascondere: HIDE_AFTER_PX, o HIDE_AFTER_REVEAL_PX dopo una ricomparsa. */
    hideAfter: number;
    /** Istante (performance.now) dell'ultimo cambio di stato, per l'isteresi. */
    changedAt: number;
};

export function initialBarState(y = 0): BarVisibilityState {
    return {
        hidden: false,
        lastY: Math.max(0, y),
        downAcc: 0,
        upAcc: 0,
        hideAfter: HIDE_AFTER_PX,
        changedAt: Number.NEGATIVE_INFINITY,
    };
}

/** Millisecondi che restano dell'isteresi (0 = libera). */
export function lockRemaining(state: BarVisibilityState, now: number): number {
    return Math.max(0, state.changedAt + TRANSITION_LOCK_MS - now);
}

function shown(state: BarVisibilityState, now: number): BarVisibilityState {
    return {
        ...state,
        hidden: false,
        downAcc: 0,
        upAcc: 0,
        hideAfter: HIDE_AFTER_REVEAL_PX,
        changedAt: now,
    };
}

/**
 * Nuova posizione di scroll. `maxY` = scrollHeight - clientHeight, `now` =
 * performance.now(). Con lo stesso `y` rivaluta gli accumuli: il hook lo
 * richiama a fine isteresi per applicare un cambio rimasto in sospeso.
 */
export function stepScroll(
    state: BarVisibilityState,
    y: number,
    maxY: number,
    now: number
): BarVisibilityState {
    // Rimbalzo iOS (rubber-band) sopra la cima o oltre la fine: delta ignorati.
    if (y < 0 || (maxY > 0 && y > maxY)) return state;

    const diff = y - state.lastY;
    const next: BarVisibilityState = {
        ...state,
        lastY: y,
        downAcc: diff > 0 ? state.downAcc + diff : diff < 0 ? 0 : state.downAcc,
        upAcc: diff < 0 ? state.upAcc - diff : diff > 0 ? 0 : state.upAcc,
    };
    const locked = lockRemaining(state, now) > 0;

    if (y <= TOP_ZONE_PX || (maxY > 0 && y >= maxY - END_EPSILON_PX)) {
        if (!state.hidden) return { ...next, downAcc: 0, upAcc: 0 };
        return locked ? next : shown(next, now);
    }
    // Durante l'isteresi gli accumuli crescono ma lo stato resta.
    if (locked) return next;
    if (!state.hidden && next.downAcc >= state.hideAfter) {
        return { ...next, hidden: true, downAcc: 0, upAcc: 0, hideAfter: HIDE_AFTER_PX, changedAt: now };
    }
    if (state.hidden && next.upAcc >= SHOW_AFTER_PX) return shown(next, now);
    return next;
}

/** Riporta la barra in vista (carrello, sheet chiusa, realtime, da fermo,
 *  ritorno sulla pagina). Gesto esplicito: non aspetta l'isteresi. Per
 *  nasconderla di nuovo servono HIDE_AFTER_REVEAL_PX. */
export function revealBar(state: BarVisibilityState, now: number): BarVisibilityState {
    return shown(state, state.hidden ? now : state.changedAt);
}

/** Nuovo riferimento senza cambiare stato (dopo freeze o scroll programmatico). */
export function resyncScroll(state: BarVisibilityState, y: number): BarVisibilityState {
    return { ...state, lastY: Math.max(0, y), downAcc: 0, upAcc: 0 };
}
