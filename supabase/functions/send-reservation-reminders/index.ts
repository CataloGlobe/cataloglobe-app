// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { COMPANY } from "../_shared/company-config.ts";
import {
    buildReservationCancelUrl,
    buildReservationConfirmUrl
} from "../_shared/publicSiteUrl.ts";
import { buildReservationReminderEmail } from "../_shared/reservationEmails.ts";
import { buildReservationIcsAttachment } from "../_shared/reservationIcs.ts";
import { signReservationToken } from "../_shared/reservationToken.ts";
import { tomorrowIsoDate } from "../_shared/romeCalendar.ts";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";

// =============================================================================
// send-reservation-reminders
// =============================================================================
//
// Invocata dal job pg_cron `send-reservation-reminders` alle 18:00 italiane
// (migration 20260829120001, che schedula a 16 e 17 UTC e lascia passare solo
// l'esecuzione in cui a Roma sono davvero le 18).
//
// Manda a chi ha una prenotazione CONFERMATA per domani un'email che gliela
// ricorda, con dentro il link di disdetta gia' esistente. Il senso non e'
// informare — il cliente sa di aver prenotato — ma dargli un momento in cui
// disdire e' piu' facile che dimenticarsene.
//
// ── Mai due promemoria ──────────────────────────────────────────────────────
// E' il requisito piu' importante di questa funzione: un cliente che riceve due
// volte lo stesso promemoria smette di fidarsi del sistema.
//
// La riga viene RIVENDICATA prima dell'invio, con un solo statement:
//
//     UPDATE reservations SET reminder_sent_at = now()
//     WHERE id = ... AND reminder_sent_at IS NULL RETURNING id
//
// Chi ottiene la riga manda l'email; chi non la ottiene passa oltre senza
// mandare nulla. La mutua esclusione vive dentro l'UPDATE e non in un
// controllo che lo precede, quindi regge il cron eseguito due volte, il
// ritentativo e due worker in parallelo.
//
// Il prezzo e' che un guasto di Resend DOPO la rivendicazione perde quel
// promemoria invece di duplicarlo. E' il verso giusto dell'errore, ed e' una
// scelta esplicita: un promemoria mancato e' un'occasione persa, due
// promemoria inviati sono un difetto che il cliente vede.
//
// ── Autenticazione ──────────────────────────────────────────────────────────
// Segreto condiviso nell'header `X-Job-Secret`, confronto in tempo costante,
// fail-closed: segreto assente dall'ambiente significa 401, mai passaggio
// libero. Modello `process-translation-jobs`. NON il modello dei job purge,
// che avvolgono il controllo in `if (SECRET) { ... }` e quindi proseguono
// quando la variabile non e' configurata.
// =============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("RESERVATION_REMINDERS_SECRET")!;

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

// Tetto per passata. I volumi odierni ci stanno mille volte dentro; esiste
// perche' il giorno che non ci stanno piu' il passaggio a piu' giri sia un
// parametro e non una riscrittura. Se il tetto viene raggiunto lo si dice nel
// log: una troncatura silenziosa si legge come "ho finito" quando non e' vero.
const MAX_PER_RUN = 500;

// Stessa allowlist di `submit-reservation`: `past_due` e' uno stato di grazia
// (carta in ritentativo per ~2 settimane) durante il quale il servizio resta
// acceso. Un promemoria che non parte perche' il pagamento e' in ritardo
// sarebbe un no-show causato dalla piattaforma.
const VALID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

function jsonResponse(body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

function hasUsableEmail(value: unknown): boolean {
    return typeof value === "string" && value.trim().length > 0 && value.includes("@");
}

Deno.serve(async (req: Request) => {
    // ── Auth ────────────────────────────────────────────────────────────────
    // JOB_SECRET mancante dall'ambiente = rifiuta. Nessun ramo permissivo.
    const providedSecret = req.headers.get("X-Job-Secret");
    if (!JOB_SECRET || !providedSecret || !timingSafeEqualStr(providedSecret, JOB_SECRET)) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    const targetDate = tomorrowIsoDate(new Date());

    try {
        // ── Candidate ───────────────────────────────────────────────────────
        // I filtri sulle colonne di primo livello stanno in SQL e coincidono
        // con l'indice parziale `idx_reservations_reminder_pending`. Sede e
        // tenant arrivano in JOIN e vengono filtrati sotto, in modo esplicito:
        // il filtro su risorsa annidata di PostgREST funziona, ma qui la
        // leggibilita' di cosa viene escluso e perche' conta piu' di una query
        // in meno.
        const { data: candidates, error: selectError } = await supabase
            .from("reservations")
            .select(
                "id, reservation_date, reservation_time, party_size, customer_name, customer_email, " +
                "activity:activities!inner(id, name, slug, status, reservation_reminder_enabled, " +
                "reservation_duration_minutes, address, street_number, postal_code, city, province, " +
                "tenant:tenants!inner(id, subscription_status))"
            )
            .eq("reservation_date", targetDate)
            .eq("status", "confirmed")
            .is("reminder_sent_at", null)
            .order("id", { ascending: true })
            .limit(MAX_PER_RUN);

        if (selectError) {
            console.error("[send-reservation-reminders] select error:", selectError);
            return jsonResponse({ error: "select_failed" }, 500);
        }

        const rows = candidates ?? [];
        if (rows.length === MAX_PER_RUN) {
            console.warn(
                `[send-reservation-reminders] hit the ${MAX_PER_RUN} cap for ${targetDate}: some reminders were NOT processed this run.`
            );
        }

        const stats = {
            target_date: targetDate,
            candidates: rows.length,
            sent: 0,
            skipped_reminder_disabled: 0,
            skipped_activity_inactive: 0,
            skipped_subscription: 0,
            skipped_no_email: 0,
            skipped_already_claimed: 0,
            failed: 0
        };

        for (const reservation of rows) {
            const activity = reservation.activity;

            // ── Esclusioni, PRIMA della rivendicazione ──────────────────────
            // Nessuna di queste righe viene marcata come inviata: se domani la
            // sede riaccende il promemoria o rinnova l'abbonamento, la
            // prenotazione e' ancora candidabile. Marcare qui significherebbe
            // consumare silenziosamente un promemoria mai spedito.
            if (activity?.reservation_reminder_enabled !== true) {
                stats.skipped_reminder_disabled++;
                continue;
            }
            if (activity?.status !== "active") {
                stats.skipped_activity_inactive++;
                continue;
            }
            if (!VALID_SUBSCRIPTION_STATUSES.has(activity?.tenant?.subscription_status)) {
                stats.skipped_subscription++;
                continue;
            }
            if (!hasUsableEmail(reservation.customer_email)) {
                // Prenotazione presa al telefono senza email: non e' un errore
                // del giro, e' una prenotazione a cui non si puo' scrivere.
                // Nessun throw, nessuna marcatura, nessun indirizzo nel log.
                stats.skipped_no_email++;
                continue;
            }

            // ── Rivendicazione, POI invio ───────────────────────────────────
            try {
                const { data: claimed, error: claimError } = await supabase
                    .from("reservations")
                    .update({ reminder_sent_at: new Date().toISOString() })
                    .eq("id", reservation.id)
                    .is("reminder_sent_at", null)
                    .select("id")
                    .maybeSingle();

                if (claimError) {
                    console.error(
                        `[send-reservation-reminders] claim failed (reservation_id=${reservation.id}):`,
                        claimError.message
                    );
                    stats.failed++;
                    continue;
                }
                if (!claimed) {
                    // Un'altra esecuzione ha preso la riga tra la SELECT e
                    // l'UPDATE. Non e' un errore: e' il lucchetto che funziona.
                    stats.skipped_already_claimed++;
                    continue;
                }

                // Due link, due token DISTINTI: `act` diverso, quindi nessuno
                // dei due puo' fare l'operazione dell'altro. Stanno uno sotto
                // l'altro nella stessa email, ed e' proprio li' che uno scambio
                // passerebbe inosservato.
                //
                // Best-effort come altrove: se il segreto o l'APP_URL mancano
                // l'email parte senza link, non salta.
                let cancelUrl: string | null = null;
                let confirmUrl: string | null = null;
                try {
                    cancelUrl = buildReservationCancelUrl(
                        activity.slug,
                        await signReservationToken(reservation.id, "cancel")
                    );
                    confirmUrl = buildReservationConfirmUrl(
                        activity.slug,
                        await signReservationToken(reservation.id, "confirm")
                    );
                } catch (tokenErr) {
                    console.error(
                        `[send-reservation-reminders] token minting failed (reservation_id=${reservation.id}):`,
                        tokenErr instanceof Error ? tokenErr.message : "unknown error"
                    );
                }

                const email = buildReservationReminderEmail({
                    activityName: activity.name,
                    customerName: reservation.customer_name,
                    reservationDate: reservation.reservation_date,
                    reservationTime: reservation.reservation_time,
                    partySize: reservation.party_size,
                    cancelUrl,
                    confirmUrl
                });

                // Allegato calendario. Chi riceve il promemoria e' gia'
                // confermato: se non l'ha ancora messo in agenda, questa e'
                // l'ultima occasione utile. `undefined` = email senza
                // allegato, mai email non spedita.
                const attachments = buildReservationIcsAttachment({
                    reservationId: reservation.id,
                    venueName: activity.name,
                    reservationDate: reservation.reservation_date,
                    reservationTime: reservation.reservation_time,
                    partySize: reservation.party_size,
                    durationMinutes: activity.reservation_duration_minutes,
                    address: activity,
                    cancelUrl,
                    now: new Date()
                });

                await resend.emails.send({
                    from: COMPANY.email.sender,
                    reply_to: COMPANY.contact.support,
                    to: reservation.customer_email,
                    subject: email.subject,
                    html: email.html,
                    text: email.text,
                    ...(attachments ? { attachments } : {})
                });

                stats.sent++;
            } catch (rowErr) {
                // Un fallimento su una prenotazione non ferma le altre. La riga
                // resta rivendicata: non si ritenta, per non rischiare il
                // doppio invio (vedi l'intestazione).
                console.error(
                    `[send-reservation-reminders] send failed (reservation_id=${reservation.id}):`,
                    rowErr instanceof Error ? rowErr.message : "unknown error"
                );
                stats.failed++;
            }
        }

        // Solo conteggi e id di sistema: nessun nome, nessun indirizzo,
        // nessun numero di telefono nei log.
        console.log("[send-reservation-reminders] run complete:", JSON.stringify(stats));

        return jsonResponse({ success: true, ...stats }, 200);
    } catch (err) {
        console.error(
            "[send-reservation-reminders] unhandled error:",
            err instanceof Error ? err.message : "unknown error"
        );
        return jsonResponse({ error: "server_error" }, 500);
    }
});
