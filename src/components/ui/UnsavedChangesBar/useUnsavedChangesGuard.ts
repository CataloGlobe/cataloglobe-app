import { useEffect, useSyncExternalStore } from "react";

/**
 * Guardia "modifiche non salvate" per la navigazione interna e il refresh.
 *
 * Due pezzi:
 * - `useUnsavedChangesGuard(isDirty)` — lo chiama la pagina (o la sezione)
 *   che possiede un draft, accanto a `UnsavedChangesBar`. Non blocca nulla
 *   da solo: registra il proprio stato "sporco" in un registro condiviso.
 * - `UnsavedChangesGuardHost` — montato UNA volta nel layout, legge il
 *   registro e chiama `useBlocker` (react-router) + `beforeunload`.
 *
 * Perché un registro e non `useBlocker` in ogni pagina: il data router
 * supporta UN solo blocker alla volta (warning «A router only supports one
 * blocker at a time» e il primo registrato vince, anche se non deve bloccare).
 * Le tab della sede possono avere più sezioni sporche insieme, quindi il
 * blocker deve essere unico e derivato dall'unione degli stati.
 */

const dirtyOwners = new Set<symbol>();
/** Chi ha la bozza dentro un dettaglio nell'indirizzo (`?guest=`): per lui conta anche la query. */
const searchOwners = new Set<symbol>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
    version += 1;
    listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

const getSnapshot = () => version;

/**
 * Registra `isDirty` per il chiamante; si deregistra allo smontaggio.
 * `search: true` per una bozza dentro un dettaglio dal vivo (D131): anche
 * cambiare la query (un altro elemento, chiudere, indietro) la butterebbe.
 */
export function useUnsavedChangesGuard(isDirty: boolean, options?: { search?: boolean }) {
    const search = options?.search === true;
    useEffect(() => {
        if (!isDirty) return;
        const owner = Symbol("unsaved-changes");
        dirtyOwners.add(owner);
        if (search) searchOwners.add(owner);
        notify();
        return () => {
            dirtyOwners.delete(owner);
            searchOwners.delete(owner);
            notify();
        };
    }, [isDirty, search]);
}

/** True se almeno un chiamante ha modifiche pendenti. Usato dall'host. */
export function useHasUnsavedChanges(): boolean {
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return dirtyOwners.size > 0;
}

/** True se una bozza pendente si perde anche cambiando solo la query. */
export function useUnsavedChangesWatchSearch(): boolean {
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return searchOwners.size > 0;
}
