import { createContext, useContext } from "react";

/**
 * Il posto del dettaglio dal vivo, reso da `MainLayout`: l'`<aside>` accanto
 * al contenuto (`slot`, `null` finché non è montato o fuori dal layout:
 * allora il pannello si apre da solo, fisso a destra) e se c'è un dettaglio
 * aperto lì dentro. Le pagine larghe lo leggono per stringersi (D131, punto 2).
 */
export interface DetailPaneHost {
    slot: HTMLElement | null;
    open: boolean;
    /** Il pannello si annuncia aperto nella colonna; la funzione restituita lo toglie. */
    register: () => () => void;
}

export const DetailPaneHostContext = createContext<DetailPaneHost>({
    slot: null,
    open: false,
    register: () => () => {}
});

/** C'è un dettaglio aperto accanto: il contenuto ha meno spazio. */
export function useDetailPaneOpen(): boolean {
    return useContext(DetailPaneHostContext).open;
}

/**
 * Cosa sa chi sta dentro un `DetailPane` (letto da `DrawerLayout`): le frecce
 * per passare al precedente e al successivo, e al telefono il ritorno
 * «‹ Comande» al posto della X.
 */
export interface DetailPaneNav {
    onPrev?: () => void;
    onNext?: () => void;
    /** Dove si è nell'elenco: «2 di 5» fra le frecce (D141). `index` parte da 0. */
    position?: { index: number; total: number };
    /** Al telefono il pannello è una pagina: in alto «‹ backLabel». */
    phone: boolean;
    backLabel: string;
}

export const DetailPaneNavContext = createContext<DetailPaneNav | null>(null);

export function useDetailPaneNav(): DetailPaneNav | null {
    return useContext(DetailPaneNavContext);
}
