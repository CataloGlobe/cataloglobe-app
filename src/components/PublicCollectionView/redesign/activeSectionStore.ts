import { useSyncExternalStore } from "react";

/**
 * Sezione attiva della pagina pubblica (pill e indice). Uno store a parte, non
 * uno `useState` in cima: a ogni cambio di sezione durante lo scroll si
 * ridisegnano solo i componenti che la leggono, non tutto il catalogo.
 */
let activeSectionId: string | null = null;
const listeners = new Set<() => void>();

export function getActiveSectionId(): string | null {
    return activeSectionId;
}

export function setActiveSectionId(next: string | null): void {
    if (next === activeSectionId) return;
    activeSectionId = next;
    listeners.forEach(listener => listener());
}

export function subscribeActiveSection(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Ridisegna solo quando cambia la sezione attiva. */
export function useActiveSectionId(): string | null {
    return useSyncExternalStore(subscribeActiveSection, getActiveSectionId, () => null);
}

/** Ridisegna solo quando `id` entra o esce dallo stato attivo. */
export function useIsSectionActive(id: string): boolean {
    return useSyncExternalStore(
        subscribeActiveSection,
        () => activeSectionId === id,
        () => false
    );
}
