// @ts-nocheck
// =============================================================================
// send-notification-emails (Edge Function) — coda email del motore notifiche
// =============================================================================
//
// Invocata da pg_cron ogni minuto, solo se c'è lavoro (migration
// 20261015020200). Auth via header X-Job-Secret
// (NOTIFICATION_EMAIL_JOB_SECRET). Niente CORS: chiamata interna dal DB.
//
// Tick:
//   1. claim_pending_notification_emails(BATCH, MAX_ATTEMPTS) — cap poison lato DB;
//   2. per ogni email: modello da `_shared/notificationEmails.ts`, invio con
//      `sendEmailWithResult`;
//        - inviata → 'sent';
//        - modello sconosciuto o dati insufficienti → 'failed' subito;
//        - invio fallito → 'pending' con run_after spostato
//          (nextRetryDelayMinutes), oppure 'failed' al cap;
//   3. finally: le email prese ma non risolte (crash a metà) tornano
//      'pending' (guard status='processing', come process-print-jobs).
//
// Una mail per destinatario, mai BCC: le righe sono già una per utente.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailWithResult } from "../_shared/sendEmail.ts";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";
import {
    buildNotificationEmail,
    nextRetryDelayMinutes,
    NOTIFICATION_EMAIL_MAX_ATTEMPTS
} from "../_shared/notificationEmails.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("NOTIFICATION_EMAIL_JOB_SECRET");

const BATCH_SIZE = 25;
const LOG = "[send-notification-emails]";

interface ClaimedEmail {
    id: string;
    user_id: string;
    tenant_id: string | null;
    to_email: string;
    event_type: string;
    template: string;
    data: Record<string, unknown> | null;
    attempts: number;
}

function jsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

Deno.serve(async (req: Request) => {
    // 1. Auth — secret mancante dall'env = rifiuta (fail-safe).
    const providedSecret = req.headers.get("X-Job-Secret");
    if (!JOB_SECRET || !providedSecret || !timingSafeEqualStr(providedSecret, JOB_SECRET)) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    const counters = { claimed: 0, sent: 0, retried: 0, failed: 0, orphans_reset: 0 };

    // 2. Claim
    const { data: claimedRaw, error: claimErr } = await supabase.rpc(
        "claim_pending_notification_emails",
        { p_limit: BATCH_SIZE, p_max_attempts: NOTIFICATION_EMAIL_MAX_ATTEMPTS }
    );
    if (claimErr) {
        console.error(`${LOG} claim failed`, { error: claimErr.message });
        return jsonResponse({ error: "claim_failed", ...counters }, 500);
    }
    const claimed = (claimedRaw ?? []) as ClaimedEmail[];
    counters.claimed = claimed.length;
    if (claimed.length === 0) return jsonResponse(counters, 200);

    const unresolved = new Set(claimed.map(e => e.id));
    const ctx = { siteUrl: getPublicSiteUrl() };

    async function finish(id: string, patch: Record<string, unknown>): Promise<void> {
        const { error } = await supabase
            .from("notification_emails")
            .update(patch)
            .eq("id", id)
            .eq("status", "processing");
        if (error) {
            console.error(`${LOG} update failed`, { id, error: error.message });
            return;
        }
        unresolved.delete(id);
    }

    try {
        for (const row of claimed) {
            const email = buildNotificationEmail(row.template, row.data ?? {}, ctx);
            if (!email) {
                console.error(`${LOG} template not buildable`, {
                    id: row.id,
                    template: row.template,
                    event_type: row.event_type
                });
                await finish(row.id, { status: "failed", last_error: "template_not_buildable" });
                counters.failed++;
                continue;
            }

            const ok = await sendEmailWithResult({
                to: row.to_email,
                subject: email.subject,
                html: email.html,
                text: email.text
            });

            if (ok) {
                await finish(row.id, {
                    status: "sent",
                    sent_at: new Date().toISOString(),
                    last_error: null
                });
                counters.sent++;
                continue;
            }

            const delay = nextRetryDelayMinutes(row.attempts);
            if (delay === null) {
                await finish(row.id, { status: "failed", last_error: "send_failed" });
                counters.failed++;
            } else {
                await finish(row.id, {
                    status: "pending",
                    last_error: "send_failed",
                    run_after: new Date(Date.now() + delay * 60_000).toISOString()
                });
                counters.retried++;
            }
        }
    } finally {
        // 3. Le email prese ma non risolte tornano in coda.
        if (unresolved.size > 0) {
            const ids = Array.from(unresolved);
            const { error } = await supabase
                .from("notification_emails")
                .update({ status: "pending" })
                .in("id", ids)
                .eq("status", "processing");
            if (error) {
                console.error(`${LOG} orphan reset failed`, { error: error.message });
            } else {
                counters.orphans_reset = ids.length;
            }
        }
    }

    console.log(`${LOG} tick`, counters);
    return jsonResponse(counters, 200);
});
