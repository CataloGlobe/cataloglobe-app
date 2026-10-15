/**
 * Dopo un deploy Vercel i pezzi (chunk) della versione di prima non sono più
 * serviti: chi ha l'app già aperta, al primo cambio di pagina che carica un
 * pezzo nuovo, riceve "Failed to fetch dynamically imported module" e vede
 * l'errore di React Router. Vite emette `vite:preloadError` quando un import
 * dinamico fallisce: ricarichiamo la pagina, che prende la versione nuova.
 *
 * Al massimo un ricaricamento ogni RELOAD_COOLDOWN_MS: se il pezzo manca anche
 * dopo il ricaricamento (rete giù, deploy rotto) non si entra in un ciclo e
 * l'errore resta visibile come oggi.
 */
export const RELOAD_STORAGE_KEY = "cg:stale-chunk-reload-at";
export const RELOAD_COOLDOWN_MS = 10_000;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** true se si può ricaricare adesso; in quel caso segna l'ora del ricaricamento. */
export function shouldReloadForStaleChunk(storage: Storage | null, now: number): boolean {
    if (!storage) return true;
    try {
        const last = Number(storage.getItem(RELOAD_STORAGE_KEY));
        if (Number.isFinite(last) && last > 0 && now - last < RELOAD_COOLDOWN_MS) return false;
        storage.setItem(RELOAD_STORAGE_KEY, String(now));
        return true;
    } catch {
        // sessionStorage non disponibile (navigazione privata, permessi): si ricarica una volta.
        return true;
    }
}

function safeSessionStorage(): Storage | null {
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

export function installStaleChunkReload(): void {
    window.addEventListener("vite:preloadError", () => {
        if (shouldReloadForStaleChunk(safeSessionStorage(), Date.now())) {
            window.location.reload();
        }
    });
}
