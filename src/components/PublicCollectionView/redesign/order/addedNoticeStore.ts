import { useSyncExternalStore } from "react";

/**
 * «Aggiunto · nome» con Annulla (spec §7): un avviso alla volta, l'ultimo vince.
 * Lo chiamano la scheda del foglio e il + della lista; lo mostra `AddedNotice`.
 */
export type AddedNoticeState = { id: number; name: string; undo: () => void } | null;

let state: AddedNoticeState = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: AddedNoticeState) {
    state = next;
    for (const listener of listeners) listener();
}

export function showAdded(name: string, undo: () => void): void {
    emit({ id: nextId++, name, undo });
}

/** Chiude l'avviso `id` (se è ancora quello a vista). */
export function dismissAdded(id: number): void {
    if (state?.id === id) emit(null);
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useAddedNotice(): AddedNoticeState {
    return useSyncExternalStore(subscribe, () => state, () => null);
}
