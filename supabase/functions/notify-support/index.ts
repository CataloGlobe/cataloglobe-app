// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/sendEmail.ts";
import {
    buildSupportCustomerReplyEmail,
    buildSupportPlatformAlertEmail
} from "../_shared/supportEmails.ts";
import {
    buildSupportAdminTicketUrl,
    buildSupportTicketUrl
} from "../_shared/publicSiteUrl.ts";

// =============================================================================
// notify-support
// =============================================================================
//
// Fires the notifications for ONE support message that has ALREADY been
// written. The message is never inserted here: the RLS policies on
// `support_messages` are the security boundary and are covered by 31 test
// cases — a notification is not a reason to route a write around them. This
// function is a side effect, and it is called after the fact.
//
// Consequence, and it is deliberate: if this function fails, the message stays
// saved and the user sees nothing. An email is not part of the transaction.
//
// ── Who gets notified, and why it is a decision ─────────────────────────────
// On the customer side the recipients are the people INVOLVED in the ticket:
// `support_tickets.created_by` plus the DISTINCT `author_user_id` of the
// `customer` messages on that ticket. NOT every member of the tenant holding
// `support.read`.
//
// This is a product decision, not a technical limitation. Fanning out to
// everyone with the permission is perfectly possible; it is just noise.
// Telling a member of staff about a request they have never touched trains
// them to ignore the bell, and then the notification that mattered goes
// unread too. The people in the thread are the people waiting for an answer.
//
// (`get_users_with_activity_permission`, used by the reservations fan-out,
// would not fit anyway: it requires an `activity_id` and tickets are
// tenant-scoped, with `activity_id` nullable. But that is a footnote — the
// reason above stands on its own.)
//
// On the platform side the recipients are every row of `platform_admins`.
// Email only, no in-app row: see the note next to the notification insert.
//
// ── Authorisation ───────────────────────────────────────────────────────────
// The caller's JWT is used to RE-READ the ticket. If RLS does not return it,
// the answer is 404 and nothing else happens. The `message_id` in the payload
// is never trusted on its own: it is an opaque id from the client, and
// accepting it unchecked would let anyone trigger emails about someone else's
// ticket to third parties.
//
// `service_role` appears only AFTER that gate, and only for what the caller's
// own privileges cannot do: reading `auth.users` email addresses, listing
// `platform_admins`, inserting notification rows. It never decides whether the
// caller is allowed to be here.
// =============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Same allowlist as `respond-reservation`: this endpoint is dashboard-only,
// there is no public or preview origin that legitimately calls it.
const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://staging.cataloglobe.com",
    "https://cataloglobe.com",
    "https://www.cataloglobe.com"
];

function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
    };
}

const ERROR_MESSAGES: Record<string, string> = {
    METHOD_NOT_ALLOWED: "Metodo non consentito",
    UNAUTHORIZED:       "Autenticazione richiesta",
    INVALID_PAYLOAD:    "Dati non validi",
    NOT_FOUND:          "Richiesta di supporto non trovata",
    SERVER_ERROR:       "Errore durante l'invio delle notifiche"
};

function errorResponse(req: Request, code: string, status: number): Response {
    const message = ERROR_MESSAGES[code] ?? "Si è verificato un errore";
    return new Response(JSON.stringify({ error_code: code, error: message, message }), {
        status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" }
    });
}

function jsonResponse(req: Request, body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" }
    });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractBearerJwt(req: Request): string | null {
    const h = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
    const jwt = h.slice(7).trim();
    return jwt.length > 0 ? jwt : null;
}

/**
 * Email address of a user, or null when it cannot be resolved (deleted user,
 * admin API hiccup). Never throws: one unresolvable address must not stop the
 * other recipients from being told.
 */
async function resolveUserEmail(supabaseService, userId: string): Promise<string | null> {
    try {
        const { data, error } = await supabaseService.auth.admin.getUserById(userId);
        if (error) {
            console.error(`[notify-support] user lookup failed (user_id=${userId}):`, error);
            return null;
        }
        return data?.user?.email ?? null;
    } catch (err) {
        console.error(`[notify-support] user lookup threw (user_id=${userId}):`, err);
        return null;
    }
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders(req) });
    }
    if (req.method !== "POST") {
        return errorResponse(req, "METHOD_NOT_ALLOWED", 405);
    }

    try {
        const jwt = extractBearerJwt(req);
        if (!jwt) return errorResponse(req, "UNAUTHORIZED", 401);

        const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return errorResponse(req, "INVALID_PAYLOAD", 400);

        const ticketId = typeof body.ticket_id === "string" ? body.ticket_id.trim() : "";
        if (!UUID_RE.test(ticketId)) return errorResponse(req, "INVALID_PAYLOAD", 400);

        // Optional: `create_support_ticket` returns the ticket row only, so the
        // caller that has just opened a ticket has no message id to pass. When
        // absent we take the ticket's most recent message — on a ticket created
        // one round-trip ago that IS the first message. Still read under the
        // caller's JWT, so the authorisation gate is unchanged.
        const rawMessageId = typeof body.message_id === "string" ? body.message_id.trim() : "";
        if (rawMessageId.length > 0 && !UUID_RE.test(rawMessageId)) {
            return errorResponse(req, "INVALID_PAYLOAD", 400);
        }
        const messageId = rawMessageId.length > 0 ? rawMessageId : null;

        // ── Authorisation gate: re-read under the caller's JWT ───────────
        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${jwt}` } },
            auth: { persistSession: false }
        });

        // Validates signature and expiry server-side. A JWT that only looks
        // well-formed dies here, before any lookup.
        const { data: userData, error: userErr } = await supabaseUser.auth.getUser(jwt);
        if (userErr || !userData?.user) return errorResponse(req, "UNAUTHORIZED", 401);
        const callerUserId = userData.user.id;

        const { data: ticket, error: ticketErr } = await supabaseUser
            .from("support_tickets")
            .select("id, tenant_id, subject, created_by")
            .eq("id", ticketId)
            .maybeSingle();

        if (ticketErr) {
            console.error("[notify-support] ticket read failed:", ticketErr);
            return errorResponse(req, "SERVER_ERROR", 500);
        }
        // Not visible under the caller's RLS: "does not exist" and "not yours"
        // must stay indistinguishable, exactly as they are in `getTicket`.
        if (!ticket) return errorResponse(req, "NOT_FOUND", 404);

        // The message is read under the caller's JWT too, AND constrained to
        // this ticket: a message id from another ticket the caller happens to
        // see would otherwise pair a foreign body with this ticket's subject.
        let messageQuery = supabaseUser
            .from("support_messages")
            .select("id, ticket_id, body, author_user_id, author_kind, created_at")
            .eq("ticket_id", ticketId);
        messageQuery = messageId
            ? messageQuery.eq("id", messageId)
            : messageQuery.order("created_at", { ascending: false }).limit(1);

        const { data: messageRows, error: messageErr } = await messageQuery;
        if (messageErr) {
            console.error("[notify-support] message read failed:", messageErr);
            return errorResponse(req, "SERVER_ERROR", 500);
        }
        const message = messageRows?.[0] ?? null;
        if (!message) return errorResponse(req, "NOT_FOUND", 404);

        // ── Side effects only, from here on ──────────────────────────────
        const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false }
        });

        const authorUserId = message.author_user_id ?? null;
        let inAppSent = 0;
        // Counts the recipients we had an address for and handed to Resend.
        // NOT deliveries: `sendEmail` is non-throwing by contract and logs its
        // own failures, so a bounce is invisible from here. The number answers
        // "did the fan-out reach anyone", which is what the logs need.
        let emailsSent = 0;

        if (message.author_kind === "platform") {
            // ── To the customer side ─────────────────────────────────────
            // Recipients: whoever is involved in the ticket. See the header.
            const { data: customerMessages, error: authorsErr } = await supabaseService
                .from("support_messages")
                .select("author_user_id")
                .eq("ticket_id", ticketId)
                .eq("author_kind", "customer");

            if (authorsErr) {
                console.error("[notify-support] customer author lookup failed:", authorsErr);
                return errorResponse(req, "SERVER_ERROR", 500);
            }

            const recipientIds = new Set<string>();
            if (ticket.created_by) recipientIds.add(ticket.created_by);
            for (const row of customerMessages ?? []) {
                if (row.author_user_id) recipientIds.add(row.author_user_id);
            }
            const involvedCount = recipientIds.size;

            // Never the author of the message being announced. Here it is a
            // platform admin, who is not in the set anyway — the deletion is
            // the invariant, not a guess about who happens to be inside.
            //
            // Except when it is. A user who is BOTH a platform admin and the
            // only person involved on the customer side — one of us running a
            // real company on the platform, or any single-account test —
            // empties the set by replying to themselves, and gets no
            // notification. That is intended: not sending someone the email of
            // what they have just written is worth more than this edge case,
            // and it holds even when a colleague answers, because that user
            // stays the only one involved. The fix for whoever runs a real
            // company here is two separate accounts, not a looser rule.
            if (authorUserId) recipientIds.delete(authorUserId);

            const recipients = [...recipientIds];
            if (recipients.length === 0) {
                // Two different causes, and telling them apart is the whole
                // point of the log line: one sends you looking for a deleted
                // user, the other for a second account. Naming the wrong one
                // costs an afternoon.
                console.warn(
                    involvedCount === 0
                        ? `[notify-support] no customer recipient (ticket_id=${ticketId}): ticket created_by is null and no customer message has a surviving author.`
                        : `[notify-support] no customer recipient (ticket_id=${ticketId}): the only person involved is the author of this message (user_id=${authorUserId}), who is never notified of their own message.`
                );
            }

            const threadUrl = buildSupportTicketUrl(ticket.tenant_id, ticketId);
            const email = buildSupportCustomerReplyEmail({
                ticketSubject: ticket.subject,
                messageBody: message.body,
                threadUrl
            });

            // ── In-app rows ──────────────────────────────────────────────
            // `tenant_id` is the ticket's, which means the bell shows this
            // notification ONLY while the user is looking at that company:
            // HeaderNotifications filters on `n.tenant_id === tenantId` for
            // the business scope. For a user with several companies, a
            // notification on company A while they are inside company B is
            // not displayed until they switch.
            //
            // This is a delay, not a loss — NotificationsProvider loads every
            // row of the user across tenants, so the notification is there,
            // still unread, the moment they switch — and the email covers the
            // gap in the meantime. Do not read it as a bug six months from now
            // and "fix" it by nulling the tenant: a null `tenant_id` means
            // account-level and would move the notification into the workspace
            // bell, away from the company the ticket belongs to.
            if (recipients.length > 0) {
                const rows = recipients.map(uid => ({
                    user_id: uid,
                    tenant_id: ticket.tenant_id,
                    event_type: "support.reply",
                    type: "info",
                    title: "Risposta dal supporto",
                    message: ticket.subject,
                    data: {
                        ticket_id: ticketId,
                        message_id: message.id,
                        subject: ticket.subject
                    }
                }));

                const { error: insertErr } = await supabaseService
                    .from("notifications")
                    .insert(rows);

                if (insertErr) {
                    console.error("[notify-support] notification insert failed:", insertErr);
                } else {
                    inAppSent = rows.length;
                }
            }

            // ── Emails ───────────────────────────────────────────────────
            // One send per recipient, never BCC: the addresses belong to
            // different people and must not see each other.
            const results = await Promise.allSettled(
                recipients.map(async uid => {
                    const to = await resolveUserEmail(supabaseService, uid);
                    if (!to) return false;
                    await sendEmail({
                        to,
                        subject: email.subject,
                        html: email.html,
                        text: email.text
                    });
                    return true;
                })
            );
            results.forEach((r, i) => {
                if (r.status === "rejected") {
                    console.error(
                        `[notify-support] customer email failed (user_id=${recipients[i]}):`,
                        r.reason
                    );
                } else if (r.value) {
                    emailsSent += 1;
                }
            });
        } else {
            // ── To the platform side ─────────────────────────────────────
            // Email only. No in-app row: the /admin header runs on the
            // account scope (`tenant_id IS NULL`) and the queue is already
            // ordered by who has waited longest.
            const { data: admins, error: adminsErr } = await supabaseService
                .from("platform_admins")
                .select("user_id");

            if (adminsErr) {
                console.error("[notify-support] platform admin lookup failed:", adminsErr);
                return errorResponse(req, "SERVER_ERROR", 500);
            }

            const recipientIds = new Set<string>();
            for (const row of admins ?? []) {
                if (row.user_id) recipientIds.add(row.user_id);
            }
            // A platform admin writing as `customer` on their own company's
            // ticket is unusual but possible, and they must not be told about
            // their own message.
            if (authorUserId) recipientIds.delete(authorUserId);

            const recipients = [...recipientIds];
            if (recipients.length === 0) {
                console.warn(
                    `[notify-support] no platform admin to alert (ticket_id=${ticketId}).`
                );
            }

            // First message of the ticket → the request is new. Anything else
            // is movement on a thread that already exists, including a
            // customer writing on a closed ticket (the trigger reopens it, and
            // that reopening is exactly what must not go unnoticed).
            const { data: firstRows, error: firstErr } = await supabaseService
                .from("support_messages")
                .select("id")
                .eq("ticket_id", ticketId)
                .order("created_at", { ascending: true })
                .limit(1);

            if (firstErr) {
                console.error("[notify-support] first message lookup failed:", firstErr);
            }
            // On a failed lookup fall back to `newMessage`: the weaker claim.
            // Announcing a new request that is not new is worse than the
            // opposite — the queue shows the truth either way.
            const isFirstMessage = firstRows?.[0]?.id === message.id;

            const { data: tenantRow, error: tenantErr } = await supabaseService
                .from("tenants")
                .select("name")
                .eq("id", ticket.tenant_id)
                .maybeSingle();

            if (tenantErr) {
                console.error("[notify-support] tenant lookup failed:", tenantErr);
            }

            const email = buildSupportPlatformAlertEmail({
                tenantName: tenantRow?.name ?? null,
                ticketSubject: ticket.subject,
                messageBody: message.body,
                threadUrl: buildSupportAdminTicketUrl(ticketId),
                variant: isFirstMessage ? "newTicket" : "newMessage"
            });

            const results = await Promise.allSettled(
                recipients.map(async uid => {
                    const to = await resolveUserEmail(supabaseService, uid);
                    if (!to) return false;
                    await sendEmail({
                        to,
                        subject: email.subject,
                        html: email.html,
                        text: email.text
                    });
                    return true;
                })
            );
            results.forEach((r, i) => {
                if (r.status === "rejected") {
                    console.error(
                        `[notify-support] platform email failed (user_id=${recipients[i]}):`,
                        r.reason
                    );
                } else if (r.value) {
                    emailsSent += 1;
                }
            });
        }

        console.log(
            `[notify-support] done (ticket_id=${ticketId}, message_id=${message.id}, author_kind=${message.author_kind}, caller=${callerUserId}, in_app=${inAppSent}, emails=${emailsSent}).`
        );

        return jsonResponse(req, { success: true, in_app: inAppSent, emails: emailsSent }, 200);
    } catch (err) {
        console.error("[notify-support] error:", err);
        return errorResponse(req, "SERVER_ERROR", 500);
    }
});
