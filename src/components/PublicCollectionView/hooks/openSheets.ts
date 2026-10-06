/**
 * Contatore condiviso a livello di MODULO delle superfici modali pubbliche
 * aperte (ogni PublicSheet, SearchOverlay: chi usa `useSheetBodyLock`).
 * Incrementato all'apertura e decrementato alla chiusura (più cleanup di
 * unmount), in modo SINCRONO nel path open/close → già settato PRIMA dello
 * scroll event indotto dal body-lock.
 *
 * SSR-safe: toccato SOLO da effect/handler client (useSheetBodyLock
 * useLayoutEffect), MAI letto in render.
 */
let openSheetCount = 0;

const closeListeners = new Set<() => void>();

export function pushSheetOpen(): void {
    openSheetCount += 1;
}

export function popSheetOpen(): void {
    openSheetCount = Math.max(0, openSheetCount - 1);
    // Notifica in microtask e solo se nessuna sheet resta aperta: un pop seguito
    // da un push nello stesso commit (rimontaggio dell'effect, StrictMode, cambio
    // di contenuto) non è una chiusura; con sheet impilate conta l'ultima.
    queueMicrotask(() => {
        if (openSheetCount === 0) closeListeners.forEach(listener => listener());
    });
}

/**
 * True se almeno una sheet è aperta. Da usare negli scroll handler per
 * ignorare gli scroll event SINTETICI indotti dal body-lock/unlock
 * (position:fixed azzera window.scrollY; il window.scrollTo del rilascio ne
 * genera un altro) — cadono nei frame critici delle animazioni.
 * Fonte unica del freeze di header e bottom bar.
 */
export function hasOpenSheet(): boolean {
    return openSheetCount > 0;
}

/** Notifica quando l'ultima sheet aperta si chiude (la bottom bar ricompare). */
export function subscribeSheetClose(listener: () => void): () => void {
    closeListeners.add(listener);
    return () => {
        closeListeners.delete(listener);
    };
}
