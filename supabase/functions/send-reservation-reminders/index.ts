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
import {
    claimWithRetry,
    errorMessageOf,
    truncateClaimError,
    CLAIM_MAX_ATTEMPTS
} from "../_shared/reminderClaim.ts";
import {
    buildRunSummary,
    safeErrorMessage,
    type RunErrorEntry
} from "../_shared/reminderRunLog.ts";

// =============================================================================
// send-reservation-reminders
// =============================================================================
//
// Invocata dal job pg_cron `send-reservation-reminders` alle 18, 19 e 20
// italiane (migration 20260911120000, che schedula a 16,17,18,19 UTC e lascia
// passare le tre esecuzioni che a Roma cadono in quelle ore).
//
// Tre occasioni e non una: se alle 18 il database o il gateway hanno un
// intoppo, alle 19 si riprova. Le passate successive non producono doppioni
// perche' la rivendicazione e' idempotente — chi ha gia' ricevuto il promemoria
// ha `reminder_sent_at` valorizzato e non compare piu' fra i candidati.
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
// promemoria inviati sono un difetto che il cliente vede. Non si annulla la
// rivendicazione: si REGISTRA la perdita (vedi sotto), perche' una perdita che
// nessuno vede e' peggio della perdita.
//
// ── Il claim si ritenta, l'invio no ─────────────────────────────────────────
// La rivendicazione e' idempotente, quindi ritentarla e' sicuro: un secondo
// tentativo o trova la riga gia' presa (e non manda) o la prende (e manda una
// volta sola). Dettaglio e classificazione degli errori in
// `_shared/reminderClaim.ts`.
//
// L'invio, che idempotente non e', resta a colpo unico.
//
// ── Come ce ne accorgiamo ───────────────────────────────────────────────────
// Tre livelli, e servono tutti e tre:
//   1. `reservations.reminder_attempts/_failed_at/_last_error` — la singola
//      prenotazione: "questa l'ha ricevuto?".
//   2. `reservation_reminder_runs` — la passata: "stasera ha funzionato?".
//      Riga scritta all'INIZIO, cosi' un giro che muore a meta' lascia una
//      traccia con `finished_at` NULL invece di non lasciarne nessuna.
//   3. i log, che restano ma non sono piu' l'unica prova: la ritenzione e'
//      breve e il 09/09 e' scaduta prima che qualcuno guardasse.
//
// Le scritture di diagnostica sono TUTTE best-effort: se falliscono si
// prosegue. Osservare il giro non deve poter far cadere il giro.
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

/**
 * `'cron'` solo se la richiesta lo dichiara. Il caso ambiguo — body vuoto, non
 * JSON, senza `source` — va su `'manual'` di proposito: e' l'invocazione a mano
 * quella che si fa di fretta e senza dichiararsi, e attribuire al cron un
 * successo che non e' suo e' esattamente l'errore che ci ha fatto contare tre
 * invii riusciti quando erano due.
 */
async function readTriggerSource(req: Request): Promise<"cron" | "manual"> {
    try {
        const body = await req.json();
        return body?.source === "cron" ? "cron" : "manual";
    } catch {
        return "manual";
    }
}

/**
 * Segna sulla prenotazione che un tentativo e' fallito.
 *
 * Best-effort e mai bloccante: se anche questa scrittura fallisce si prosegue
 * con la prossima prenotazione. La diagnostica non deve poter far cadere la
 * passata che sta osservando.
 *
 * Chiamata su DUE guasti diversi, e lo stato che ne risulta li distingue:
 *   - claim fallito     → `reminder_sent_at` NULL + `reminder_failed_at` pieno
 *   - invio fallito     → ENTRAMBI pieni, cioe' "rivendicata ma non consegnata"
 */
async function markReminderFailure(
    supabase: unknown,
    reservation: Record<string, unknown>,
    message: string
): Promise<void> {
    try {
        const { error } = await supabase
            .from("reservations")
            .update({
                reminder_attempts: (Number(reservation.reminder_attempts) || 0) + 1,
                reminder_failed_at: new Date().toISOString(),
                reminder_last_error: safeErrorMessage(message)
            })
            .eq("id", reservation.id);
        if (error) {
            console.error(
                `[send-reservation-reminders] diagnostics write failed (reservation_id=${reservation.id}):`,
                errorMessageOf(error)
            );
        }
    } catch (err) {
        console.error(
            `[send-reservation-reminders] diagnostics write threw (reservation_id=${reservation.id}):`,
            errorMessageOf(err)
        );
    }
}

/**
 * Chiude la riga di registro aperta a inizio passata.
 *
 * Best-effort come tutto il resto della diagnostica. Una riga che resta con
 * `finished_at` NULL perche' questa scrittura e' fallita si legge come "giro
 * interrotto": e' un falso positivo accettabile, molto meno grave del contrario.
 */
async function closeRunLog(
    supabase: unknown,
    runId: string | null,
    summary: Record<string, unknown>
): Promise<void> {
    if (!runId) return;
    try {
        const { error } = await supabase
            .from("reservation_reminder_runs")
            .update({ finished_at: new Date().toISOString(), ...summary })
            .eq("id", runId);
        if (error) {
            console.error(
                "[send-reservation-reminders] run log close failed:",
                errorMessageOf(error)
            );
        }
    } catch (err) {
        console.error(
            "[send-reservation-reminders] run log close threw:",
            errorMessageOf(err)
        );
    }
}

Deno.serve(async (req: Request) => {
    // ── Auth ────────────────────────────────────────────────────────────────
    // JOB_SECRET mancante dall'ambiente = rifiuta. Nessun ramo permissivo.
    const providedSecret = req.headers.get("X-Job-Secret");
    if (!JOB_SECRET || !providedSecret || !timingSafeEqualStr(providedSecret, JOB_SECRET)) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    // Letto qui e una volta sola: il body di una Request si consuma.
    const triggerSource = await readTriggerSource(req);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    const targetDate = tomorrowIsoDate(new Date());

    // ── Apertura del registro ───────────────────────────────────────────────
    // Prima di qualsiasi lavoro, non dopo. Una passata che va in crash a meta'
    // deve lasciare una riga con `finished_at` NULL: e' proprio il caso che
    // oggi non sapremmo distinguere da "non e' mai partita".
    //
    // Se l'INSERT fallisce si prosegue senza registro: i promemoria valgono
    // piu' della loro contabilita'.
    let runId: string | null = null;
    try {
        const { data: runRow, error: runError } = await supabase
            .from("reservation_reminder_runs")
            .insert({ target_date: targetDate, trigger_source: triggerSource })
            .select("id")
            .maybeSingle();
        if (runError) {
            console.error(
                "[send-reservation-reminders] run log open failed:",
                errorMessageOf(runError)
            );
        }
        runId = runRow?.id ?? null;
    } catch (err) {
        console.error(
            "[send-reservation-reminders] run log open threw:",
            errorMessageOf(err)
        );
    }

    // Errori e avvisi della passata, per il registro. Solo id e messaggi:
    // `buildRunSummary` redige comunque a valle, ma la prima difesa e' non
    // metterci mai dentro nulla di personale.
    const runErrors: RunErrorEntry[] = [];
    const runNotes: string[] = [];

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
                "customer_language, reminder_attempts, ics_sequence, " +
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
            console.error(
                "[send-reservation-reminders] select error:",
                errorMessageOf(selectError)
            );
            await closeRunLog(
                supabase,
                runId,
                buildRunSummary({
                    candidates: 0,
                    sent: 0,
                    failed: 0,
                    skipped: {},
                    errors: [],
                    notes: [
                        `Selezione dei candidati fallita: ${truncateClaimError(
                            errorMessageOf(selectError)
                        )}`
                    ]
                })
            );
            return jsonResponse({ error: "select_failed" }, 500);
        }

        const rows = candidates ?? [];
        if (rows.length === MAX_PER_RUN) {
            console.warn(
                `[send-reservation-reminders] hit the ${MAX_PER_RUN} cap for ${targetDate}: some reminders were NOT processed this run.`
            );
            runNotes.push(
                `Raggiunto il tetto di ${MAX_PER_RUN} prenotazioni per passata: alcune non sono state trattate.`
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
                // Fino a CLAIM_MAX_ATTEMPTS tentativi, ma solo sui guasti di
                // trasporto. Ritentare e' sicuro perche' l'UPDATE e'
                // idempotente: se il tentativo andato in timeout era in realta'
                // arrivato, il successivo trova la riga gia' presa e non manda.
                //
                // `reminder_attempts` viene incrementato dentro lo STESSO
                // statement della rivendicazione: chi non vince il claim non
                // incrementa nulla, quindi il contatore resta onesto anche con
                // due esecuzioni in parallelo.
                const claim = await claimWithRetry(() =>
                    supabase
                        .from("reservations")
                        .update({
                            reminder_sent_at: new Date().toISOString(),
                            reminder_attempts: (Number(reservation.reminder_attempts) || 0) + 1
                        })
                        .eq("id", reservation.id)
                        .is("reminder_sent_at", null)
                        .select("id")
                        .maybeSingle()
                );

                if (claim.kind === "already_claimed") {
                    // Zero righe. La riga era gia' rivendicata: da un'altra
                    // esecuzione, o da un nostro tentativo precedente andato in
                    // timeout ma arrivato a destinazione. NON e' un errore e non
                    // si manda nulla — e' il lucchetto che funziona.
                    stats.skipped_already_claimed++;
                    continue;
                }

                if (claim.kind === "failed") {
                    console.error(
                        `[send-reservation-reminders] claim failed after ${claim.attempts}/${CLAIM_MAX_ATTEMPTS} attempt(s) (reservation_id=${reservation.id}):`,
                        claim.message
                    );
                    // La riga NON e' rivendicata: resta candidata per la
                    // prossima passata. Con tre occasioni al giorno invece di
                    // una, un intoppo alle 18 non e' piu' un promemoria perso.
                    await markReminderFailure(supabase, reservation, `claim: ${claim.message}`);
                    runErrors.push({
                        reservation_id: reservation.id,
                        message: `claim fallito dopo ${claim.attempts} tentativi: ${claim.message}`
                    });
                    stats.failed++;
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
                    confirmUrl,
                    language: reservation.customer_language
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
                    language: reservation.customer_language,
                    // Stessa versione della conferma (o piu' alta, se nel
                    // frattempo e' stata spostata): il calendario aggiorna
                    // l'evento invece di ignorarlo o duplicarlo.
                    icsSequence: reservation.ics_sequence,
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
                //
                // Lo stato che ne risulta — `reminder_sent_at` pieno E
                // `reminder_failed_at` pieno — significa "rivendicata ma non
                // consegnata", ed e' un caso a se': l'interfaccia lo dice in
                // chiaro invece di nasconderlo sotto "inviato".
                const message = errorMessageOf(rowErr);
                console.error(
                    `[send-reservation-reminders] send failed (reservation_id=${reservation.id}):`,
                    message
                );
                await markReminderFailure(supabase, reservation, `invio: ${message}`);
                runErrors.push({
                    reservation_id: reservation.id,
                    message: `invio fallito dopo la rivendicazione: ${message}`
                });
                stats.failed++;
            }
        }

        // Solo conteggi e id di sistema: nessun nome, nessun indirizzo,
        // nessun numero di telefono nei log.
        console.log("[send-reservation-reminders] run complete:", JSON.stringify(stats));

        await closeRunLog(
            supabase,
            runId,
            buildRunSummary({
                candidates: stats.candidates,
                sent: stats.sent,
                failed: stats.failed,
                skipped: {
                    reminder_disabled: stats.skipped_reminder_disabled,
                    venue_inactive: stats.skipped_activity_inactive,
                    subscription: stats.skipped_subscription,
                    no_email: stats.skipped_no_email,
                    already_claimed: stats.skipped_already_claimed
                },
                errors: runErrors,
                notes: runNotes
            })
        );

        return jsonResponse({ success: true, trigger_source: triggerSource, ...stats }, 200);
    } catch (err) {
        const message = errorMessageOf(err);
        console.error("[send-reservation-reminders] unhandled error:", message);
        // Il registro si chiude anche quando la passata muore: una riga con
        // `finished_at` valorizzato e un errore di giro dice molto di piu' di
        // una riga rimasta aperta per sempre.
        await closeRunLog(
            supabase,
            runId,
            buildRunSummary({
                candidates: 0,
                sent: 0,
                failed: 0,
                skipped: {},
                errors: runErrors,
                notes: [...runNotes, `Passata interrotta: ${truncateClaimError(message)}`]
            })
        );
        return jsonResponse({ error: "server_error" }, 500);
    }
});
