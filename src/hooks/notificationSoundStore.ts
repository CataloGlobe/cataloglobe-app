/**
 * notificationSoundStore — store esterno condiviso per il "muto" dei suoni
 * operativi (ordini / conto / cameriere / campanello prenotazioni).
 *
 * Single source of truth in-memory, seedato da localStorage
 * (`cataloglobe-notifications-sound`, default ON). Pensato per
 * `useSyncExternalStore`: ogni componente che lo consuma reagisce **dal vivo
 * same-tab** a un cambio, senza context provider né `storage` event (che
 * peraltro non scatta nella tab che scrive).
 *
 * Consumer attuali (via `useNotificationChime`): `OperationalAlerts`
 * (dispatcher), `HeaderNotifications` (campanello), icona muto in `Orders`.
 */

const STORAGE_KEY = "cataloglobe-notifications-sound";

function readStored(): boolean {
    if (typeof window === "undefined") return true;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return true;
        return raw === "true";
    } catch {
        return true;
    }
}

function writeStored(value: boolean): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
        /* private mode / quota — ignora */
    }
}

let soundEnabled = readStored();
const listeners = new Set<() => void>();

/** Subscribe per `useSyncExternalStore`. Ritorna l'unsubscribe. */
export function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Snapshot corrente (stabile finché non cambia → safe per useSyncExternalStore). */
export function getSnapshot(): boolean {
    return soundEnabled;
}

/** Snapshot SSR/robustezza: default ON. */
export function getServerSnapshot(): boolean {
    return true;
}

/** Imposta il valore: in-memory + localStorage + notifica i listener. */
export function setSoundEnabled(value: boolean): void {
    if (value === soundEnabled) return;
    soundEnabled = value;
    writeStored(value);
    for (const listener of listeners) listener();
}

/** Toggle di comodità. */
export function toggleSoundEnabled(): void {
    setSoundEnabled(!soundEnabled);
}
