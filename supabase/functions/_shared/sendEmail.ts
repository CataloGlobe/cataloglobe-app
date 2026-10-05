// @ts-nocheck
import { Resend } from "npm:resend@4";
import { COMPANY } from "./company-config.ts";

// ---------------------------------------------------------------------------
// Helper email condiviso. Non-throwing per definizione: l'invio è SEMPRE
// best-effort e non può far fallire l'operazione chiamante (es. billing).
// From/reply_to centralizzati su company-config (dominio verificato Resend).
// ---------------------------------------------------------------------------

export async function sendEmail(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
}): Promise<void> {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) {
        console.error("[sendEmail] RESEND_API_KEY mancante");
        return;
    }
    try {
        // Resend v4 non lancia sugli errori API: li restituisce in `error`.
        const { error } = await new Resend(key).emails.send({
            from: COMPANY.email.sender,
            reply_to: COMPANY.contact.support,
            to: opts.to,
            subject: opts.subject,
            html: opts.html,
            text: opts.text
        });
        if (error) console.error("[sendEmail] Resend error:", safeErrorFields(error));
    } catch (err) {
        console.error("[sendEmail] Resend error:", safeErrorFields(err)); // best-effort, NON rilancia
    }
}

/**
 * Come `sendEmail`, ma dice se l'invio è andato: per chi deve riprovare
 * (riepilogo del lunedì del CRM). Non lancia nemmeno questa.
 */
export async function sendEmailWithResult(opts: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) {
        console.error("[sendEmail] RESEND_API_KEY mancante");
        return false;
    }
    try {
        const { error } = await new Resend(key).emails.send({
            from: COMPANY.email.sender,
            reply_to: COMPANY.contact.support,
            to: opts.to,
            subject: opts.subject,
            html: opts.html,
            text: opts.text
        });
        if (error) {
            console.error("[sendEmail] Resend error:", safeErrorFields(error));
            return false;
        }
        return true;
    } catch (err) {
        console.error("[sendEmail] Resend error:", safeErrorFields(err));
        return false;
    }
}

/**
 * Solo name/message/statusCode: l'oggetto d'errore (o la request allegata)
 * può riportare destinatario e corpo dell'email, cioè dati personali.
 */
export function safeErrorFields(err: unknown): { name: string | null; message: string | null; statusCode: number | null } {
    const e = (typeof err === "object" && err !== null ? err : {}) as {
        name?: unknown;
        message?: unknown;
        statusCode?: unknown;
    };
    return {
        name: typeof e.name === "string" ? e.name : null,
        message: typeof e.message === "string" ? e.message : typeof err === "string" ? err : null,
        statusCode: typeof e.statusCode === "number" ? e.statusCode : null
    };
}
