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
/** Dopo un'aggiunta al carrello serve più scroll giù per nasconderla. */
export const HIDE_AFTER_CART_PX = 80;
/** Finestra in cui gli scroll programmatici (categoria, Menu → cima) non contano. */
export const PROGRAMMATIC_IGNORE_MS = 900;
/** Smooth scroll lungo: dove c'è `scrollend`, si continua a ignorare fino a
 *  quello, al massimo per tanto oltre la finestra. */
export const PROGRAMMATIC_MAX_EXTRA_MS = 1500;
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
    /** Scroll giù richiesto per nascondere: HIDE_AFTER_PX, o HIDE_AFTER_CART_PX dopo il carrello. */
    hideAfter: number;
};

export function initialBarState(y = 0): BarVisibilityState {
    return { hidden: false, lastY: y, downAcc: 0, upAcc: 0, hideAfter: HIDE_AFTER_PX };
}

/** Nuova posizione di scroll. `maxY` = scrollHeight - clientHeight. */
export function stepScroll(
    state: BarVisibilityState,
    y: number,
    maxY: number
): BarVisibilityState {
    const clampedY = Math.max(0, y); // rubber-band iOS
    if (clampedY <= TOP_ZONE_PX || (maxY > 0 && clampedY >= maxY - END_EPSILON_PX)) {
        return { ...state, hidden: false, lastY: clampedY, downAcc: 0, upAcc: 0 };
    }

    const diff = clampedY - state.lastY;
    if (diff > 0) {
        const downAcc = state.downAcc + diff;
        if (!state.hidden && downAcc >= state.hideAfter) {
            return { hidden: true, lastY: clampedY, downAcc: 0, upAcc: 0, hideAfter: HIDE_AFTER_PX };
        }
        return { ...state, lastY: clampedY, downAcc, upAcc: 0 };
    }
    if (diff < 0) {
        const upAcc = state.upAcc - diff;
        if (state.hidden && upAcc >= SHOW_AFTER_PX) {
            return { ...state, hidden: false, lastY: clampedY, downAcc: 0, upAcc: 0 };
        }
        return { ...state, lastY: clampedY, downAcc: 0, upAcc };
    }
    return state;
}

/** Riporta la barra in vista. `afterCart`: per nasconderla servono HIDE_AFTER_CART_PX. */
export function revealBar(
    state: BarVisibilityState,
    afterCart = false
): BarVisibilityState {
    return {
        ...state,
        hidden: false,
        downAcc: 0,
        upAcc: 0,
        hideAfter: afterCart ? HIDE_AFTER_CART_PX : state.hideAfter,
    };
}

/** Nuovo riferimento senza cambiare stato (dopo freeze o scroll programmatico). */
export function resyncScroll(state: BarVisibilityState, y: number): BarVisibilityState {
    return { ...state, lastY: Math.max(0, y), downAcc: 0, upAcc: 0 };
}
