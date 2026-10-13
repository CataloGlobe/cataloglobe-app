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
    /** Alta quanto il tetto anche con poco contenuto (la ricerca: non salta mentre si scrive). */
    fill?: boolean;
    /** Titolo invisibile in testata (resta per i lettori di schermo e per «‹ Titolo» nelle figlie): il corpo lo mostra da sé. */
    titleHidden?: boolean;
    /**
     * Testata a più righe (scheda prodotto, mockup v38): «‹ Madre» sopra, titolo
     * che va a capo, sotto la riga di `SheetHost.renderHeading` (il prezzo).
     */
    stacked?: boolean;
    /**
     * Niente riga di testata: la × sta sospesa in alto a destra e il corpo parte
     * sotto la maniglia (modale del voto, mockup v38). Il titolo resta per i
     * lettori di schermo.
     */
    floatingClose?: boolean;
    /**
     * Solo telefono, sulla prima pagina: il foglio entra già alto questi px e
     * cresce, invece di salire dal fondo. È la modale piccola del voto che
     * diventa modulo: la stessa testata, al posto suo (spec §11).
     */
    growFrom?: number;
    /**
     * Chi sta sopra torna qui col nome: «‹ Info e orari» invece della sola freccia.
     * Solo dove il ritorno non è ovvio: link diretto a una figlia (Orari dalla
     * pillola), elenco «In evidenza», un piatto sotto l'altro (mockup v38).
     */
    named?: boolean;
    /**
     * Solo desktop, sulla prima pagina della pila: la finestra si apre 8 px sotto
     * l'elemento `below` invece che al centro, larga e allineata come `align` se
     * si vede (il campo di ricerca), altrimenti larga `width` (560) col bordo
     * destro a `inset` px da quello di `below`. Se `below` non si vede, al centro.
     */
    anchor?: { below: string; align?: string; width?: number; inset?: number };
};

/** Come si è arrivati allo stato corrente: serve a scegliere il verso dell'animazione. */
export type SheetMove = "open" | "push" | "pop" | "close";

export type SheetState = {
    pages: readonly SheetPage[];
    move: SheetMove;
};

export type SheetAction =
    | { type: "open"; page: SheetPage }
    /** Apre già su una figlia, con le madri sotto (es. Orari con «‹ Informazioni»). */
    | { type: "openAt"; pages: readonly SheetPage[] }
    | { type: "push"; page: SheetPage }
    | { type: "pop" }
    | { type: "close" };

export const CLOSED_SHEET: SheetState = { pages: [], move: "close" };

export function sheetReducer(state: SheetState, action: SheetAction): SheetState {
    switch (action.type) {
        case "open":
            return { pages: [action.page], move: "open" };
        case "openAt":
            if (action.pages.length === 0) return state.pages.length === 0 ? state : CLOSED_SHEET;
            return { pages: action.pages, move: "open" };
        case "push": {
            // Foglio chiuso: la spinta è un'apertura. Stessa pagina in cima: niente da fare.
            if (state.pages.length === 0) return { pages: [action.page], move: "open" };
            // Chiave già in pila: «‹» fino a quella pagina, mai due pagine con la stessa chiave.
            const at = state.pages.findIndex(page => page.key === action.page.key);
            if (at === state.pages.length - 1) return state;
            if (at >= 0) return { pages: state.pages.slice(0, at + 1), move: "pop" };
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
let pendingOpener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function dispatch(action: SheetAction): void {
    const next = sheetReducer(current, action);
    if (next === current) return;
    // Il fuoco torna al pulsante che ha aperto il foglio: lo si ricorda
    // all'apertura, prima che il foglio stesso prenda il fuoco.
    if (current.pages.length === 0 && next.pages.length > 0 && typeof document !== "undefined") {
        const active = pendingOpener ?? document.activeElement;
        opener = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    pendingOpener = null;
    current = next;
    listeners.forEach(listener => listener());
}

export const openSheet = (page: SheetPage): void => dispatch({ type: "open", page });
export const openSheetAt = (pages: readonly SheetPage[]): void => dispatch({ type: "openAt", pages });
export const pushSheetPage = (page: SheetPage): void => dispatch({ type: "push", page });
export const popSheetPage = (): void => dispatch({ type: "pop" });
export const closeSheet = (): void => dispatch({ type: "close" });

/**
 * Chi apre il foglio quando il fuoco, al momento dell'apertura, sta altrove: la
 * lente passa il fuoco al campo fantasma (tastiera iOS) prima di aprire, e alla
 * chiusura il fuoco deve tornare alla lente, non a un campo invisibile.
 */
export function rememberSheetOpener(element: HTMLElement): void {
    pendingOpener = element;
}

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

/**
 * Il pannello è montato e sta entrando. Il primo foglio arriva da un pezzo a
 * parte: chi gli passa il posto (la modale del voto) resta a vista fino a qui.
 */
const shownListeners = new Set<() => void>();

export function onSheetShown(listener: () => void): () => void {
    shownListeners.add(listener);
    return () => shownListeners.delete(listener);
}

export function notifySheetShown(): void {
    for (const listener of [...shownListeners]) listener();
}

export function useSheetState(): SheetState {
    return useSyncExternalStore(subscribeSheet, getSheetState, () => CLOSED_SHEET);
}
