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
        await new Resend(key).emails.send({
            from: COMPANY.email.sender,
            reply_to: COMPANY.contact.support,
            to: opts.to,
            subject: opts.subject,
            html: opts.html,
            text: opts.text
        });
    } catch (err) {
        console.error("[sendEmail] Resend error:", err); // best-effort, NON rilancia
    }
}
