// =============================================================================
// remind-unconfirmed-accounts — promemoria a chi non ha confermato l'email
// =============================================================================
//
// Invocata da pg_cron ogni giorno alle 8:00 UTC (20261010150000). Chiede al
// database chi si è registrato da 2-7 giorni senza confermare
// (`claim_signup_reminders`, che segna anche l'invio) e manda a ciascuno una
// mail sola con la data entro cui confermare: dopo 7 giorni la pulizia
// notturna cancella l'account (`purge_unconfirmed_accounts`).
//
// Se una mail non parte si cancella la riga di `signup_reminders`: il giorno
// dopo si riprova.
//
// AUTENTICAZIONE: `X-Internal-Secret` = INTERNAL_EDGE_SECRET (lo stesso di
// send-tenant-invite; nel vault è `internal_edge_secret`).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { COMPANY } from "../_shared/company-config.ts";
import { buildSignupReminderEmail } from "../_shared/accountEmails.ts";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_SECRET = Deno.env.get("INTERNAL_EDGE_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// APP_URL via getPublicSiteUrl: senza slash finale, null se non è un URL valido.
const APP_URL = getPublicSiteUrl();

/** Giorni dalla registrazione alla cancellazione (D30). */
const DAYS_TO_PURGE = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

/**
 * Ultimo giorno pieno per confermare, "YYYY-MM-DD" a Roma. La pulizia gira
 * ogni notte alle 3:40 UTC e cancella chi ha più di 7 giorni: l'account sparisce
 * alla prima passata dopo registrazione + 7 giorni, e la mail dice il giorno
 * prima di quella notte.
 */
function deleteAfter(createdAt: string): string {
    const due = new Date(new Date(createdAt).getTime() + DAYS_TO_PURGE * DAY_MS);
    const purge = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate(), 3, 40));
    if (purge <= due) purge.setUTCDate(purge.getUTCDate() + 1);
    return new Date(purge.getTime() - DAY_MS).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const provided = req.headers.get("X-Internal-Secret");
    if (!INTERNAL_SECRET || !provided || !timingSafeEqualStr(provided, INTERNAL_SECRET)) {
        return json(401, { error: "unauthorized" });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !RESEND_API_KEY || !APP_URL) {
        console.error("[remind-unconfirmed-accounts] env mancante");
        return json(500, { error: "misconfigured" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const resend = new Resend(RESEND_API_KEY);

    const { data, error } = await admin.rpc("claim_signup_reminders", { p_limit: 200 });
    if (error) {
        console.error("[remind-unconfirmed-accounts] claim:", error.message);
        return json(500, { error: "claim_failed" });
    }

    const rows = (data ?? []) as { user_id: string; email: string; created_at: string }[];
    const loginUrl = `${APP_URL}/login`;
    let sent = 0;
    let failed = 0;

    for (const [i, row] of rows.entries()) {
        // Resend accetta poche richieste al secondo: una pausa tra un invio e l'altro.
        if (i > 0) await new Promise(r => setTimeout(r, 600));
        // resend@4 non lancia sugli errori dell'API: li restituisce in `error`.
        const { error: sendError } = await resend.emails.send({
            from: COMPANY.email.sender,
            replyTo: COMPANY.contact.support,
            to: row.email,
            ...buildSignupReminderEmail({ deleteAfter: deleteAfter(row.created_at), loginUrl })
        }).catch((err: unknown) => ({ error: err }));

        if (sendError) {
            failed++;
            console.error("[remind-unconfirmed-accounts] invio non riuscito:", row.user_id, sendError);
            await admin.from("signup_reminders").delete().eq("user_id", row.user_id);
        } else {
            sent++;
        }
    }

    console.log(`[remind-unconfirmed-accounts] scelti ${rows.length}, mandati ${sent}, falliti ${failed}`);
    return json(200, { claimed: rows.length, sent, failed });
});
