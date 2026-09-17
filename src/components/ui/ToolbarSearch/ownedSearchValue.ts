// ============================================================
// COMPENSAZIONE, non forma giusta. Questo hook esiste solo perché
// il valore di ciò che si sta digitando attraversa
// `PageHeaderContext`, e non dovrebbe: un campo di testo non ha
// motivo di ricevere il proprio valore da un giro che passa per un
// `useEffect` del layout. La coda delle eco qui sotto è corretta,
// ma compensa quel giro. Chi rifarà `PageHeaderContext` — tenendo il
// valore digitato fuori dal context, o consegnandolo nello stesso
// render — può cancellare questo hook e tornare a un `<ToolbarSearch>`
// controllato semplice.
//
// Il valore di un campo di ricerca che passa da un context.
//
// La banda in testata è resa dal layout, non dalla pagina: la
// pagina dichiara `<ToolbarSearch value onChange>` via
// `usePageHeader`, che spedisce la config nel context con un
// `useEffect`. Il `value` arriva quindi al campo UN RENDER DOPO la
// battuta. Con un input controllato è fatale: a ogni evento React
// ripristina il DOM al `value` corrente della prop, cioè a quello
// della battuta precedente, e la lettera appena scritta sparisce
// (`abcdef` → `bdf`, FASE 5.2c).
//
// Regola: ciò che si sta digitando NON fa il giro del context. Lo
// stato locale è la verità su cosa c'è scritto; il context viene
// informato. Un `value` diverso da fuori (cambio tab, azzeramento)
// resta un reset esplicito — ma va distinto dall'eco in ritardo di
// ciò che abbiamo appena emesso, altrimenti l'eco riaprirebbe il
// difetto. Da qui la coda dei valori emessi e non ancora
// riconosciuti: `reconcileOwnedValue` è la parte pura, testata.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";

export interface Reconciled {
    /** Valori emessi che il context non ha ancora restituito. */
    pending: string[];
    /** Valore arrivato da fuori, da applicare al campo. `null` = era un'eco. */
    external: string | null;
}

/**
 * Un `value` è appena arrivato dalla prop. Se è in coda è l'eco di una
 * nostra emissione: si scarta tutto fino a lì compreso (React può saltare
 * i render intermedi, quindi non è sempre la testa). Altrimenti è un
 * cambio da fuori: la coda non vale più e il campo si allinea.
 */
export function reconcileOwnedValue(pending: readonly string[], incoming: string): Reconciled {
    const idx = pending.indexOf(incoming);
    if (idx >= 0) return { pending: pending.slice(idx + 1), external: null };
    return { pending: [], external: incoming };
}

/**
 * `value`/`onChange` di un campo controllato il cui `value` torna in
 * ritardo. Ritorna il valore da mostrare e il gestore da collegare
 * all'input: il gestore aggiorna subito lo stato locale (React ripristina
 * il DOM a QUESTO, sincrono) e poi avvisa il chiamante.
 */
export function useOwnedSearchValue(
    value: string,
    onChange: (next: string) => void
): [string, (next: string) => void] {
    const [local, setLocal] = useState(value);
    const pendingRef = useRef<string[]>([]);

    useEffect(() => {
        const next = reconcileOwnedValue(pendingRef.current, value);
        pendingRef.current = next.pending;
        if (next.external !== null) setLocal(next.external);
    }, [value]);

    const handleChange = useCallback(
        (next: string) => {
            pendingRef.current.push(next);
            setLocal(next);
            onChange(next);
        },
        [onChange]
    );

    return [local, handleChange];
}
