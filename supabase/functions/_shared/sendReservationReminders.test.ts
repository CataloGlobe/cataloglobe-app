import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

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

describe("mai due promemoria", () => {
    it("rivendica la riga PRIMA di mandare l'email", () => {
        const claim = SOURCE.indexOf(".update({ reminder_sent_at:");
        const send = SOURCE.indexOf("resend.emails.send(");
        expect(claim).toBeGreaterThan(-1);
        expect(send).toBeGreaterThan(-1);
        expect(claim).toBeLessThan(send);
    });

    it("la rivendicazione è condizionata a reminder_sent_at ancora nullo", () => {
        // Senza `.is("reminder_sent_at", null)` sull'UPDATE la mutua esclusione
        // sparisce e due esecuzioni concorrenti mandano entrambe.
        const claimBlock = SOURCE.slice(
            SOURCE.indexOf(".update({ reminder_sent_at:"),
            SOURCE.indexOf("resend.emails.send(")
        );
        expect(claimBlock).toContain('.is("reminder_sent_at", null)');
        expect(claimBlock).toContain('.eq("id", reservation.id)');
    });

    it("esiste una sola scrittura e un solo invio", () => {
        expect(SOURCE.match(/\.update\(/g) ?? []).toHaveLength(1);
        expect(SOURCE.match(/resend\.emails\.send\(/g) ?? []).toHaveLength(1);
        expect(SOURCE).not.toMatch(/\.insert\(/);
        expect(SOURCE).not.toMatch(/\.delete\(/);
    });

    it("una riga già rivendicata da un'altra esecuzione viene saltata, non rimandata", () => {
        expect(SOURCE).toContain("if (!claimed)");
        expect(SOURCE).toContain("skipped_already_claimed");
        expect(SOURCE.indexOf("if (!claimed)")).toBeLessThan(
            SOURCE.indexOf("resend.emails.send(")
        );
    });

    it("non ritenta l'invio dopo un fallimento", () => {
        // Un retry dopo la rivendicazione riaprirebbe la porta al doppio invio.
        expect(SOURCE).not.toMatch(/\bretry\b/i);
        expect(SOURCE).not.toMatch(/for\s*\(let attempt/);
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
        const claim = SOURCE.indexOf(".update({ reminder_sent_at:");
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
});
