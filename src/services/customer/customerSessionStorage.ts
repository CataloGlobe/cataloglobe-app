/**
 * Storage helper per customer session JWT in sessionStorage.
 *
 * Scope: per activity_id (cliente in catena multi-sede non eredita
 * sessione di una sede su un'altra).
 *
 * Chiave: cataloglobe-customer-${activityId}
 *
 * Validazione: expiresAt > now() per essere considerata valida.
 */

const STORAGE_KEY_PREFIX = "cataloglobe-customer-";

export interface CustomerSessionBlob {
    jwt: string;
    expiresAt: string;
    sessionId: string;
    tableId: string;
    tableLabel: string;
    activityId: string;
    tenantId: string;
    customerName?: string | null;
}

function storageKey(activityId: string): string {
    return `${STORAGE_KEY_PREFIX}${activityId}`;
}

export function loadCustomerSession(activityId: string): CustomerSessionBlob | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(storageKey(activityId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CustomerSessionBlob;
        if (!parsed.jwt || !parsed.expiresAt || !parsed.sessionId || !parsed.activityId) {
            return null;
        }
        const expMs = new Date(parsed.expiresAt).getTime();
        if (isNaN(expMs) || expMs <= Date.now()) {
            sessionStorage.removeItem(storageKey(activityId));
            return null;
        }
        if (parsed.activityId !== activityId) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function saveCustomerSession(blob: CustomerSessionBlob): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(storageKey(blob.activityId), JSON.stringify(blob));
    } catch (err) {
        console.error("[customerSessionStorage] save failed", err);
    }
}

export function clearCustomerSession(activityId: string): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.removeItem(storageKey(activityId));
    } catch {
        /* noop */
    }
}

export function updateCustomerSessionName(activityId: string, name: string | null): void {
    const session = loadCustomerSession(activityId);
    if (!session) return;
    saveCustomerSession({ ...session, customerName: name });
}
