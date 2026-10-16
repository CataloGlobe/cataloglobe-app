import { useSyncExternalStore } from "react";

/**
 * Foto del cappello al posto della copertina dell'isola (v38 «Unica»): la mette
 * la pagina Storia quando il contenuto c'è, l'isola la mostra in dissolvenza.
 * A parte dai dati delle storie: l'isola sta nel bundle iniziale.
 */
let cappelloCover: string | null = null;
const listeners = new Set<() => void>();

export function setCappelloCover(url: string | null): void {
    if (cappelloCover === url) return;
    cappelloCover = url;
    listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useCappelloCover(): string | null {
    return useSyncExternalStore(
        subscribe,
        () => cappelloCover,
        () => null
    );
}
