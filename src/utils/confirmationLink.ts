export type ConfirmationType = "signup" | "magiclink" | "recovery" | "email_change" | "invite";

export interface ConfirmationLink {
    tokenHash: string;
    type: ConfirmationType;
}

const TYPES: readonly ConfirmationType[] = ["signup", "magiclink", "recovery", "email_change", "invite"];

function fromParams(params: URLSearchParams): ConfirmationLink | null {
    const tokenHash = params.get("token_hash") || params.get("token");
    const type = params.get("type");
    if (!tokenHash || !type || !(TYPES as readonly string[]).includes(type)) return null;
    return { tokenHash, type: type as ConfirmationType };
}

/**
 * Legge il link di conferma dalla query di `/email-confirmed`. Due formati:
 * - `?confirmation_url=<url codificato>`: il modello di mail personalizzato
 *   (oggi solo nel pannello Supabase) passa l'URL di verifica intero;
 * - `?token_hash=...&type=signup`: il formato standard dei modelli Supabase.
 * Null se il link manca o è incompleto.
 */
export function parseConfirmationLink(search: string): ConfirmationLink | null {
    const params = new URLSearchParams(search);
    const direct = fromParams(params);
    if (direct) return direct;

    const confirmationUrl = params.get("confirmation_url");
    if (!confirmationUrl) return null;
    try {
        // URLSearchParams decodifica già una volta; un secondo decode serve ai
        // modelli che codificano l'URL due volte. Se non è un URL si rinuncia.
        const raw = /^https?:\/\//.test(confirmationUrl) ? confirmationUrl : decodeURIComponent(confirmationUrl);
        return fromParams(new URL(raw).searchParams);
    } catch {
        return null;
    }
}
