import { useSyncExternalStore } from "react";

/**
 * Pila di pagine di UN solo foglio della pagina pubblica.
 *
 * Regola di prodotto: mai un foglio sopra un altro. Si va avanti con la spinta
 * (`pushSheetPage`) e indietro con «‹» (`popSheetPage`) dentro lo stesso foglio;
 * un secondo `openSheet` sostituisce la pila. Qui c'è solo lo stato, senza React
 * né DOM: il contenuto delle pagine lo disegna `SheetHost` dalla `key`.
 */
export type SheetSize = "medium" | "large";

export type SheetPage = {
    /** Chiave stabile della pagina: `SheetHost.renderPage` la trasforma in contenuto. */
    key: string;
    title: string;
    /** Altezza massima: media lascia visibile l'isola, grande arriva sotto la barra di stato. */
    size?: SheetSize;
};

/** Come si è arrivati allo stato corrente: serve a scegliere il verso dell'animazione. */
export type SheetMove = "open" | "push" | "pop" | "close";

export type SheetState = {
    pages: readonly SheetPage[];
    move: SheetMove;
};

export type SheetAction =
    | { type: "open"; page: SheetPage }
    | { type: "push"; page: SheetPage }
    | { type: "pop" }
    | { type: "close" };

export const CLOSED_SHEET: SheetState = { pages: [], move: "close" };

export function sheetReducer(state: SheetState, action: SheetAction): SheetState {
    switch (action.type) {
        case "open":
            return { pages: [action.page], move: "open" };
        case "push": {
            // Foglio chiuso: la spinta è un'apertura. Stessa pagina in cima: niente da fare.
            if (state.pages.length === 0) return { pages: [action.page], move: "open" };
            if (state.pages[state.pages.length - 1].key === action.page.key) return state;
            return { pages: [...state.pages, action.page], move: "push" };
        }
        case "pop":
            // Dall'ultima pagina «‹» non esiste: si chiude.
            if (state.pages.length <= 1) return CLOSED_SHEET;
            return { pages: state.pages.slice(0, -1), move: "pop" };
        case "close":
            return state.pages.length === 0 ? state : CLOSED_SHEET;
    }
}

// ── Store di modulo ─────────────────────────────────────────────────────────
// Un foglio solo per pagina: uno stato di modulo basta e permette di aprirlo da
// qualunque punto (isola, barra, scheda) senza passare dai props.
let current: SheetState = CLOSED_SHEET;
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function dispatch(action: SheetAction): void {
    const next = sheetReducer(current, action);
    if (next === current) return;
    // Il fuoco torna al pulsante che ha aperto il foglio: lo si ricorda
    // all'apertura, prima che il foglio stesso prenda il fuoco.
    if (current.pages.length === 0 && next.pages.length > 0 && typeof document !== "undefined") {
        const active = document.activeElement;
        opener = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    current = next;
    listeners.forEach(listener => listener());
}

export const openSheet = (page: SheetPage): void => dispatch({ type: "open", page });
export const pushSheetPage = (page: SheetPage): void => dispatch({ type: "push", page });
export const popSheetPage = (): void => dispatch({ type: "pop" });
export const closeSheet = (): void => dispatch({ type: "close" });

export function getSheetState(): SheetState {
    return current;
}

/** Elemento a cui restituire il fuoco alla chiusura (già staccato dal DOM: null). */
export function takeSheetOpener(): HTMLElement | null {
    const element = opener;
    opener = null;
    return element?.isConnected ? element : null;
}

export function subscribeSheet(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useSheetState(): SheetState {
    return useSyncExternalStore(subscribeSheet, getSheetState, () => CLOSED_SHEET);
}
