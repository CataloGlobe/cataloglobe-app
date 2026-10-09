import { isInternalPath } from "@/utils/internalPath";

/**
 * Dove tornare dopo il primo accesso, quando in mezzo c'è la registrazione:
 * login → «Registrati» → mail di conferma (spesso aperta in un'altra scheda)
 * → login → OTP. Lo stato del router non sopravvive a quel giro, quindi si
 * tiene in localStorage per due giorni. Serve agli inviti al team: senza,
 * l'invito non veniva mai accettato.
 */
const KEY = "cg.pendingRedirect";
const TTL_MS = 2 * 24 * 60 * 60 * 1000;

export function savePendingRedirect(path: string, now: number = Date.now()): void {
    if (!isInternalPath(path)) return;
    try {
        localStorage.setItem(KEY, JSON.stringify({ path, savedAt: now }));
    } catch {
        // storage non disponibile (navigazione privata): si rinuncia
    }
}

/** Il percorso salvato se ancora valido, senza toglierlo. */
export function peekPendingRedirect(now: number = Date.now()): string | undefined {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return undefined;
        const { path, savedAt } = JSON.parse(raw) as { path?: unknown; savedAt?: unknown };
        if (!isInternalPath(path) || typeof savedAt !== "number" || now - savedAt > TTL_MS) {
            localStorage.removeItem(KEY);
            return undefined;
        }
        return path;
    } catch {
        return undefined;
    }
}

export function clearPendingRedirect(): void {
    try {
        localStorage.removeItem(KEY);
    } catch {
        // niente da fare
    }
}

/** Email della registrazione in corso, tenuta da /check-email per la scheda. */
export const SIGNUP_EMAIL_KEY = "cg.signupEmail";

/**
 * Uscita chiesta dall'utente: il redirect salvato e l'email della registrazione
 * non devono passare a chi entra dopo sullo stesso browser. Non si chiama
 * dove l'uscita fa parte del giro (EmailConfirmed «Esci e conferma»).
 */
export function clearSignupLeftovers(): void {
    clearPendingRedirect();
    try {
        sessionStorage.removeItem(SIGNUP_EMAIL_KEY);
    } catch {
        // niente da fare
    }
}
