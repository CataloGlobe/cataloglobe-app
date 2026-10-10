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
 * Dati della registrazione in corso (mai la password): «Email sbagliata?
 * Correggila» riporta il modulo compilato, va riscritta solo la password.
 */
export const SIGNUP_DRAFT_KEY = "cg.signupDraft";

export type SignupDraft = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
};

export function saveSignupDraft(draft: SignupDraft): void {
    try {
        sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft));
    } catch {
        // storage non disponibile: resta solo lo stato del router
    }
}

export function readSignupDraft(): SignupDraft | undefined {
    try {
        const raw = sessionStorage.getItem(SIGNUP_DRAFT_KEY);
        if (!raw) return undefined;
        const d = JSON.parse(raw) as Partial<SignupDraft>;
        if (typeof d.email !== "string") return undefined;
        return {
            firstName: typeof d.firstName === "string" ? d.firstName : "",
            lastName: typeof d.lastName === "string" ? d.lastName : "",
            email: d.email,
            phone: typeof d.phone === "string" ? d.phone : ""
        };
    } catch {
        return undefined;
    }
}

/**
 * Uscita chiesta dall'utente: il redirect salvato e l'email della registrazione
 * non devono passare a chi entra dopo sullo stesso browser. Non si chiama
 * dove l'uscita fa parte del giro (EmailConfirmed «Esci e conferma»).
 */
export function clearSignupLeftovers(): void {
    clearPendingRedirect();
    try {
        sessionStorage.removeItem(SIGNUP_EMAIL_KEY);
        sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
    } catch {
        // niente da fare
    }
}
