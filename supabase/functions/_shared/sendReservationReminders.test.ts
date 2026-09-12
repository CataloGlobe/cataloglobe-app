import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
    claimWithRetry,
    isRetriableTransportError,
    errorMessageOf,
    CLAIM_MAX_ATTEMPTS,
    CLAIM_RETRY_DELAYS_MS
} from "./reminderClaim.ts";
import {
    buildRunSummary,
    redactPersonalData,
    safeErrorMessage,
    MAX_LOGGED_ERRORS,
    MAX_ERROR_MESSAGE_CHARS
} from "./reminderRunLog.ts";

// Guardrail sul sorgente di `send-reservation-reminders`.
//
// L'handler non e' unit-testabile qui (import remoti Deno, Supabase, Resend,
// rete). Le proprieta' che contano pero' non sono comportamenti sottili: sono
// forme del codice, e verificarle sul sorgente costa poco e rompe subito se
// qualcuno le smonta durante un refactor.

const SOURCE = readFileSync(
    resolve(process.cwd(), "supabase/functions/send-reservation-reminders/index.ts"),
    "utf-8"
);

// Punto in cui la riga viene rivendicata. È l'ancora di tutti i controlli di
// ordine ("prima del claim", "dopo il claim"): la scrittura di
// `reminder_sent_at` è unica nel sorgente per costruzione, ed è verificato
// dal test "esiste un solo invio e una sola scrittura di reminder_sent_at".
const CLAIM_ANCHOR = "reminder_sent_at: new Date().toISOString()";

describe("mai due promemoria", () => {
    it("rivendica la riga PRIMA di mandare l'email", () => {
        const claim = SOURCE.indexOf(CLAIM_ANCHOR);
        const send = SOURCE.indexOf("resend.emails.send(");
        expect(claim).toBeGreaterThan(-1);
        expect(send).toBeGreaterThan(-1);
        expect(claim).toBeLessThan(send);
    });

    it("la rivendicazione è condizionata a reminder_sent_at ancora nullo", () => {
        // Senza `.is("reminder_sent_at", null)` sull'UPDATE la mutua esclusione
        // sparisce e due esecuzioni concorrenti mandano entrambe.
        const claimBlock = SOURCE.slice(
            SOURCE.indexOf(CLAIM_ANCHOR),
            SOURCE.indexOf("resend.emails.send(")
        );
        expect(claimBlock).toContain('.is("reminder_sent_at", null)');
        expect(claimBlock).toContain('.eq("id", reservation.id)');
    });

    it("esiste un solo invio e una sola scrittura di reminder_sent_at", () => {
        // Le altre `.update(` sono diagnostica (`reminder_failed_at`) e
        // registro delle passate: nessuna tocca il lucchetto.
        expect(SOURCE.match(/resend\.emails\.send\(/g) ?? []).toHaveLength(1);
        expect(SOURCE.match(/reminder_sent_at: new Date\(\)\.toISOString\(\)/g) ?? [])
            .toHaveLength(1);
        expect(SOURCE).not.toMatch(/\.delete\(/);
    });

    it("l'unica insert è quella del registro delle passate", () => {
        const inserts = SOURCE.match(/\.insert\(/g) ?? [];
        expect(inserts).toHaveLength(1);
        const insertBlock = SOURCE.slice(
            SOURCE.lastIndexOf("from(", SOURCE.indexOf(".insert(")),
            SOURCE.indexOf(".insert(")
        );
        expect(insertBlock).toContain("reservation_reminder_runs");
    });

    it("una riga già rivendicata da un'altra esecuzione viene saltata, non rimandata", () => {
        expect(SOURCE).toContain('claim.kind === "already_claimed"');
        expect(SOURCE).toContain("skipped_already_claimed");
        expect(SOURCE.indexOf('claim.kind === "already_claimed"')).toBeLessThan(
            SOURCE.indexOf("resend.emails.send(")
        );
    });

    it("il ritentativo sta sul claim e non sull'invio", () => {
        // Ritentare la rivendicazione è sicuro (è idempotente); ritentare
        // l'invio riaprirebbe la porta al doppio promemoria.
        expect(SOURCE).toContain("claimWithRetry(");
        // Un solo invio nel sorgente = nessun invio dentro un ciclo di
        // ritentativo, per costruzione.
        expect(SOURCE.match(/resend\.emails\.send\(/g) ?? []).toHaveLength(1);
        const afterSend = SOURCE.slice(SOURCE.indexOf("resend.emails.send("));
        expect(afterSend).not.toContain("claimWithRetry(");
    });

    it("un claim fallito non marca la riga come inviata", () => {
        // La riga deve restare candidata per la passata successiva: è tutto il
        // guadagno della correzione.
        const failedBlock = SOURCE.slice(
            SOURCE.indexOf('if (claim.kind === "failed")'),
            SOURCE.indexOf("buildReservationReminderEmail(")
        );
        expect(failedBlock).toContain("markReminderFailure(");
        expect(failedBlock).not.toContain("reminder_sent_at");
        expect(failedBlock).toContain("continue;");
    });
});

describe("autenticazione", () => {
    it("usa il confronto in tempo costante, non ===", () => {
        expect(SOURCE).toContain("timingSafeEqualStr(providedSecret, JOB_SECRET)");
        expect(SOURCE).not.toMatch(/providedSecret\s*===\s*JOB_SECRET/);
        expect(SOURCE).not.toMatch(/providedSecret\s*!==\s*JOB_SECRET/);
    });

    it("è fail-closed: segreto assente dall'ambiente significa 401", () => {
        expect(SOURCE).toContain("!JOB_SECRET");
        expect(SOURCE).toContain('{ error: "unauthorized" }, 401');
        // Il pattern fail-open dei job purge avvolge il controllo in un if
        // sulla presenza del segreto: qui non deve esistere.
        expect(SOURCE).not.toMatch(/if\s*\(\s*JOB_SECRET\s*\)/);
    });

    it("il controllo precede qualsiasi accesso al database", () => {
        expect(SOURCE.indexOf('{ error: "unauthorized" }, 401')).toBeLessThan(
            SOURCE.indexOf("createClient(")
        );
    });
});

describe("selezione delle prenotazioni", () => {
    it("prende solo il giorno dopo, confermate e senza promemoria inviato", () => {
        expect(SOURCE).toContain('.eq("reservation_date", targetDate)');
        expect(SOURCE).toContain('.eq("status", "confirmed")');
        expect(SOURCE).toContain('.is("reminder_sent_at", null)');
        expect(SOURCE).toContain("tomorrowIsoDate(new Date())");
    });

    it("esclude sedi con promemoria disattivato, sospese e abbonamenti non attivi", () => {
        expect(SOURCE).toContain("activity?.reservation_reminder_enabled !== true");
        expect(SOURCE).toContain('activity?.status !== "active"');
        expect(SOURCE).toContain("VALID_SUBSCRIPTION_STATUSES.has");
    });

    it("esclude le prenotazioni senza email utilizzabile", () => {
        expect(SOURCE).toContain("hasUsableEmail(reservation.customer_email)");
    });

    it("le esclusioni avvengono PRIMA della rivendicazione", () => {
        // Marcare una riga esclusa significherebbe consumare in silenzio un
        // promemoria mai spedito.
        const claim = SOURCE.indexOf(CLAIM_ANCHOR);
        for (const guard of [
            "activity?.reservation_reminder_enabled !== true",
            'activity?.status !== "active"',
            "VALID_SUBSCRIPTION_STATUSES.has",
            "hasUsableEmail(reservation.customer_email)"
        ]) {
            expect(SOURCE.indexOf(guard)).toBeLessThan(claim);
        }
    });

    it("un'esclusione non interrompe il giro", () => {
        // Ogni guardia esce con `continue`, non con `return` né con un throw.
        const loop = SOURCE.slice(
            SOURCE.indexOf("for (const reservation of rows)"),
            SOURCE.indexOf("console.log(\"[send-reservation-reminders] run complete")
        );
        // I commenti parlano di throw e di return: qui interessa il codice.
        const code = loop
            .split("\n")
            .filter(line => !line.trim().startsWith("//"))
            .join("\n");
        expect((code.match(/continue;/g) ?? []).length).toBeGreaterThanOrEqual(5);
        expect(code).not.toMatch(/\bthrow\b/);
        expect(code).not.toMatch(/\breturn\b/);
    });

    it("dichiara la troncatura invece di tacerla", () => {
        expect(SOURCE).toContain("MAX_PER_RUN");
        expect(SOURCE).toContain("hit the ${MAX_PER_RUN} cap");
    });
});

describe("dati personali fuori dai log", () => {
    it("nessun log contiene nome, email o telefono", () => {
        const logLines = SOURCE.split("\n").filter(l => /console\.(log|warn|error)/.test(l));
        const joined = logLines.join("\n");
        for (const field of [
            "customer_email",
            "customer_name",
            "customer_phone",
            "reservation.customer"
        ]) {
            expect(joined).not.toContain(field);
        }
    });

    it("i log identificano le righe per id, e le statistiche sono conteggi", () => {
        expect(SOURCE).toContain("reservation_id=${reservation.id}");
        expect(SOURCE).toContain("JSON.stringify(stats)");
    });
});

describe("link di disdetta", () => {
    it("conia il token con l'operazione esplicita", () => {
        expect(SOURCE).toContain('signReservationToken(reservation.id, "cancel")');
    });

    it("un token non coniabile toglie il link, non salta l'email", () => {
        const tokenBlock = SOURCE.slice(
            SOURCE.indexOf("let cancelUrl"),
            SOURCE.indexOf("buildReservationReminderEmail(")
        );
        expect(tokenBlock).toContain("catch (tokenErr)");
        expect(tokenBlock).not.toContain("continue;");
    });
});

describe("configurazione dell'endpoint", () => {
    it("è registrata in config.toml con verify_jwt = false", () => {
        const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf-8");
        const block = config.slice(config.indexOf("[functions.send-reservation-reminders]"));
        expect(block).toContain("verify_jwt = false");
        expect(block).toContain(
            'entrypoint = "./functions/send-reservation-reminders/index.ts"'
        );
    });

    it("il cron registrato punta a questa funzione e la chiama con l'header segreto", () => {
        const migration = readFileSync(
            resolve(
                process.cwd(),
                "supabase/migrations/20260829120001_reservation_reminders_cron.sql"
            ),
            "utf-8"
        );
        expect(migration).toContain("'0 16,17 * * *'");
        expect(migration).toContain("Europe/Rome");
        expect(migration).toContain("'X-Job-Secret', v_secret");
    });

    it("la schedulazione a tre passate copre le 18, 19 e 20 italiane e si dichiara", () => {
        const migration = readFileSync(
            resolve(
                process.cwd(),
                "supabase/migrations/20260911120000_reservation_reminders_cron_three_passes.sql"
            ),
            "utf-8"
        );
        // Quattro ore UTC coprono l'unione di CET e CEST; la guardia ne lascia
        // passare esattamente tre al giorno tutto l'anno.
        expect(migration).toContain("'0 16,17,18,19 * * *'");
        expect(migration).toContain("v_rome_hour NOT IN (18, 19, 20)");
        expect(migration).toContain("'X-Job-Secret', v_secret");
        // Senza questo body la passata automatica si registrerebbe come manuale.
        expect(migration).toContain(`'{"source":"cron"}'::jsonb`);
        // Stesso nome del job: sostituisce, non affianca.
        expect(migration).toContain("cron.unschedule('send-reservation-reminders')");
    });
});

// =============================================================================
// Ritentativo del claim — logica vera, non forma del sorgente
// =============================================================================

describe("classificazione degli errori di claim", () => {
    const retriable = [
        { case: "504 dal gateway, come il 09/09", error: { message: "Gateway Timeout" } },
        { case: "5xx esplicito", error: { status: 503, message: "Service Unavailable" } },
        { case: "fetch caduta", error: new TypeError("Failed to fetch") },
        { case: "connessione azzerata", error: { message: "socket hang up" } },
        { case: "statement_timeout di Postgres", error: { code: "57014", message: "canceling statement" } },
        { case: "deadlock", error: { code: "40P01", message: "deadlock detected" } },
        { case: "richiesta scaduta", error: { status: 408, message: "Request Timeout" } },
        { case: "troppe richieste", error: { status: 429, message: "Too Many Requests" } }
    ];

    for (const { case: label, error } of retriable) {
        it(`ritenta: ${label}`, () => {
            expect(isRetriableTransportError(error)).toBe(true);
        });
    }

    const notRetriable = [
        { case: "permesso negato", error: { code: "42501", message: "permission denied" } },
        { case: "colonna inesistente", error: { code: "42703", message: 'column "x" does not exist' } },
        { case: "payload malformato", error: { code: "PGRST102", message: "invalid body" } },
        { case: "vincolo violato", error: { code: "23505", message: "duplicate key" } },
        { case: "404 applicativo", error: { status: 404, message: "not found" } },
        { case: "errore sconosciuto: nel dubbio non si insiste", error: { message: "boom" } },
        { case: "nessun errore", error: null }
    ];

    for (const { case: label, error } of notRetriable) {
        it(`non ritenta: ${label}`, () => {
            expect(isRetriableTransportError(error)).toBe(false);
        });
    }

    it("lo stato HTTP vince sul messaggio: un 403 resta un 403", () => {
        // Altrimenti la parola "timeout" comparsa per caso in un messaggio
        // applicativo farebbe insistere su un errore che non cambia mai.
        expect(isRetriableTransportError({ status: 403, message: "auth timeout policy" }))
            .toBe(false);
    });

    it("legge un messaggio da qualunque forma di errore", () => {
        expect(errorMessageOf(new Error("boom"))).toBe("boom");
        expect(errorMessageOf({ message: "Gateway Timeout" })).toBe("Gateway Timeout");
        expect(errorMessageOf({ code: "42501" })).toBe("error 42501");
        expect(errorMessageOf(null)).toBe("unknown error");
    });
});

describe("claimWithRetry", () => {
    const noSleep = async () => {};

    it("zero righe è un salto silenzioso, non un fallimento", () => {
        // È il punto più facile da sbagliare: trattarlo come errore da
        // ritentare, o peggio come successo da cui procedere all'invio,
        // trasformerebbe la correzione in un doppio promemoria.
        return claimWithRetry(async () => ({ data: null, error: null }), { sleep: noSleep })
            .then(outcome => {
                expect(outcome.kind).toBe("already_claimed");
                expect(outcome.attempts).toBe(1);
            });
    });

    it("una riga restituita significa rivendicata", async () => {
        const outcome = await claimWithRetry(
            async () => ({ data: { id: "r1" }, error: null }),
            { sleep: noSleep }
        );
        expect(outcome).toEqual({ kind: "claimed", attempts: 1 });
    });

    it("fallisce due volte e riesce alla terza: un solo esito 'claimed'", async () => {
        let calls = 0;
        const outcome = await claimWithRetry(
            async () => {
                calls++;
                if (calls < 3) return { data: null, error: { message: "Gateway Timeout" } };
                return { data: { id: "r1" }, error: null };
            },
            { sleep: noSleep }
        );
        expect(calls).toBe(3);
        expect(outcome).toEqual({ kind: "claimed", attempts: 3 });
    });

    it("il tentativo andato in timeout ma arrivato a destinazione non manda due volte", async () => {
        // Il PATCH del primo giro va in timeout, ma il database lo aveva
        // applicato: il secondo giro trova zero righe. Deve essere
        // `already_claimed`, cioè nessun invio.
        let calls = 0;
        const outcome = await claimWithRetry(
            async () => {
                calls++;
                if (calls === 1) return { data: null, error: { message: "Gateway Timeout" } };
                return { data: null, error: null };
            },
            { sleep: noSleep }
        );
        expect(outcome.kind).toBe("already_claimed");
        expect(outcome.attempts).toBe(2);
    });

    it("non insiste su un errore applicativo", async () => {
        let calls = 0;
        const outcome = await claimWithRetry(
            async () => {
                calls++;
                return { data: null, error: { code: "42501", message: "permission denied" } };
            },
            { sleep: noSleep }
        );
        expect(calls).toBe(1);
        expect(outcome).toMatchObject({ kind: "failed", attempts: 1, retriable: false });
    });

    it("si arrende dopo CLAIM_MAX_ATTEMPTS e riporta l'ultimo messaggio", async () => {
        let calls = 0;
        const outcome = await claimWithRetry(
            async () => {
                calls++;
                return { data: null, error: { message: "Gateway Timeout" } };
            },
            { sleep: noSleep }
        );
        expect(calls).toBe(CLAIM_MAX_ATTEMPTS);
        expect(outcome).toMatchObject({
            kind: "failed",
            attempts: CLAIM_MAX_ATTEMPTS,
            retriable: true,
            message: "Gateway Timeout"
        });
    });

    it("un'eccezione della fetch è classificata, non propagata", async () => {
        let calls = 0;
        const outcome = await claimWithRetry(
            async () => {
                calls++;
                if (calls === 1) throw new TypeError("Failed to fetch");
                return { data: { id: "r1" }, error: null };
            },
            { sleep: noSleep }
        );
        expect(outcome).toEqual({ kind: "claimed", attempts: 2 });
    });

    it("aspetta fra un tentativo e l'altro, con i ritardi previsti", async () => {
        const waited: number[] = [];
        await claimWithRetry(
            async () => ({ data: null, error: { message: "Gateway Timeout" } }),
            {
                sleep: async ms => {
                    waited.push(ms);
                }
            }
        );
        expect(waited).toEqual([...CLAIM_RETRY_DELAYS_MS]);
    });
});

// =============================================================================
// Registro delle passate
// =============================================================================

describe("nessun dato personale nel registro", () => {
    it("toglie gli indirizzi email dal messaggio", () => {
        const out = redactPersonalData(
            "Resend rejected recipient beatrice.cricca@gmail.com (invalid domain)"
        );
        expect(out).not.toContain("beatrice.cricca@gmail.com");
        expect(out).not.toContain("@gmail.com");
        expect(out).toContain("[email]");
    });

    it("toglie i numeri di telefono", () => {
        const out = redactPersonalData("SMS fallback to +39 345 1559558 failed");
        expect(out).not.toContain("3451559558");
        expect(out).not.toContain("345 1559558");
        expect(out).toContain("[telefono]");
    });

    it("lascia stare le date ISO, che a una regex di telefoni somigliano", () => {
        const out = redactPersonalData("no candidates for 2026-09-10");
        expect(out).toContain("2026-09-10");
    });

    it("lascia stare gli id, che sono il modo previsto di risalire alla riga", () => {
        const id = "620f854c-8860-4a5e-b244-7650a61edcb5";
        expect(redactPersonalData(`claim failed for ${id}`)).toContain(id);
    });

    it("tronca i messaggi lunghi", () => {
        const long = "x".repeat(MAX_ERROR_MESSAGE_CHARS + 200);
        expect(safeErrorMessage(long).length).toBe(MAX_ERROR_MESSAGE_CHARS);
    });
});

describe("forma del riepilogo scritto nel registro", () => {
    const summaryOf = (over: Record<string, unknown> = {}) =>
        buildRunSummary({
            candidates: 3,
            sent: 2,
            failed: 1,
            skipped: { subscription: 1, no_email: 0 },
            errors: [{ reservation_id: "r1", message: "claim: Gateway Timeout" }],
            ...over
        } as Parameters<typeof buildRunSummary>[0]);

    it("porta conteggi, motivi di scarto ed errori per id", () => {
        const summary = summaryOf();
        expect(summary).toMatchObject({
            candidates: 3,
            sent: 2,
            failed: 1,
            skipped: { subscription: 1, no_email: 0 }
        });
        expect(summary.errors).toEqual([
            { reservation_id: "r1", message: "claim: Gateway Timeout" }
        ]);
    });

    it("gli errori non contengono email né telefoni", () => {
        const summary = summaryOf({
            errors: [
                {
                    reservation_id: "r1",
                    message: "send to beatrice.cricca@gmail.com (+39 345 1559558) failed"
                }
            ]
        });
        const serialized = JSON.stringify(summary);
        expect(serialized).not.toContain("beatrice.cricca");
        expect(serialized).not.toContain("gmail.com");
        expect(serialized).not.toContain("3451559558");
        expect(serialized).toContain("[email]");
        expect(serialized).toContain("[telefono]");
        // L'id resta: è il modo previsto di risalire al resto.
        expect(serialized).toContain("r1");
    });

    it("tronca la lista degli errori e lo dichiara dentro il jsonb", () => {
        const many = Array.from({ length: MAX_LOGGED_ERRORS + 5 }, (_, i) => ({
            reservation_id: `r${i}`,
            message: "Gateway Timeout"
        }));
        const summary = summaryOf({ errors: many });
        expect(summary.errors).toHaveLength(MAX_LOGGED_ERRORS + 1);
        const last = summary.errors[summary.errors.length - 1];
        expect(last.reservation_id).toBeNull();
        expect(last.message).toContain("5");
        expect(last.message).toContain("tetto");
    });

    it("gli avvisi di giro stanno in testa e non vengono spinti fuori dalla troncatura", () => {
        // "ho raggiunto il tetto per passata" pesa più del ventunesimo errore
        // di rete: se sparisse, il giro sembrerebbe completo.
        const many = Array.from({ length: MAX_LOGGED_ERRORS + 5 }, (_, i) => ({
            reservation_id: `r${i}`,
            message: "Gateway Timeout"
        }));
        const summary = summaryOf({
            errors: many,
            notes: ["Raggiunto il tetto di 500 prenotazioni per passata."]
        });
        expect(summary.errors[0].reservation_id).toBeNull();
        expect(summary.errors[0].message).toContain("tetto di 500");
    });

    it("normalizza i conteggi invece di scrivere valori impossibili", () => {
        const summary = buildRunSummary({
            candidates: Number.NaN,
            sent: -3,
            failed: 2.7,
            skipped: { subscription: Number.NaN },
            errors: []
        });
        expect(summary).toMatchObject({ candidates: 0, sent: 0, failed: 2 });
        expect(summary.skipped.subscription).toBe(0);
    });
});

// =============================================================================
// Diagnostica sulla riga e registro, lato sorgente
// =============================================================================

describe("osservabilità della passata", () => {
    it("apre il registro PRIMA di lavorare, non alla fine", () => {
        // Una passata che muore a metà deve lasciare una riga con finished_at
        // NULL: è il caso che oggi non sapremmo distinguere da "non partita".
        expect(SOURCE.indexOf(".insert({ target_date: targetDate")).toBeLessThan(
            SOURCE.indexOf("for (const reservation of rows)")
        );
        expect(SOURCE).toContain("finished_at: new Date().toISOString()");
    });

    it("il cron si dichiara, e l'ambiguo finisce su manual", () => {
        expect(SOURCE).toContain('body?.source === "cron" ? "cron" : "manual"');
    });

    it("marca la riga su entrambi i guasti: claim e invio", () => {
        expect(SOURCE.match(/markReminderFailure\(/g) ?? []).toHaveLength(3); // 1 def + 2 usi
        expect(SOURCE).toContain("`claim: ${claim.message}`");
        expect(SOURCE).toContain("`invio: ${message}`");
    });

    it("la diagnostica non può far cadere la passata", () => {
        // Ogni scrittura di osservabilità è avvolta in try/catch e non rilancia.
        for (const fn of ["markReminderFailure", "closeRunLog"]) {
            const body = SOURCE.slice(
                SOURCE.indexOf(`async function ${fn}(`),
                SOURCE.indexOf("\n}", SOURCE.indexOf(`async function ${fn}(`))
            );
            expect(body).toContain("try {");
            expect(body).toContain("} catch (err) {");
            expect(body).not.toMatch(/\bthrow\b/);
        }
    });

    it("chiude il registro anche quando la passata muore", () => {
        const unhandled = SOURCE.slice(SOURCE.indexOf("unhandled error"));
        expect(unhandled).toContain("closeRunLog(");
    });
});
