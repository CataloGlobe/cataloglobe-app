import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// Guardrail sul sorgente di `cancel-reservation-public`.
//
// L'handler non è unit-testabile qui (import remoti Deno, Supabase, rete), ma
// le tre proprietà che contano non sono comportamenti sottili: sono forme del
// codice. Verificarle sul sorgente costa poco e rompe subito se qualcuno le
// smonta durante un refactor — che è esattamente quando andrebbero perse.

const SOURCE = readFileSync(
    resolve(process.cwd(), "supabase/functions/cancel-reservation-public/index.ts"),
    "utf-8"
);

describe("nessun oracolo sull'esistenza di una prenotazione", () => {
    it("token non valido e prenotazione inesistente usano lo STESSO codice", () => {
        // Tre punti: token vuoto, firma non valida, riga assente.
        const occurrences = SOURCE.match(/errorResponse\("INVALID_LINK", 404\)/g) ?? [];
        expect(occurrences.length).toBeGreaterThanOrEqual(3);
    });

    it("INVALID_LINK ha un solo messaggio, quindi un solo testo per entrambi i casi", () => {
        const entries = SOURCE.match(/INVALID_LINK:\s*"[^"]+"/g) ?? [];
        expect(entries).toHaveLength(1);
    });

    it("non esiste un codice d'errore dedicato al 'non trovato'", () => {
        // Un RESERVATION_NOT_FOUND separato sarebbe l'oracolo che si vuole evitare.
        expect(SOURCE).not.toContain("RESERVATION_NOT_FOUND");
        expect(SOURCE).not.toContain("NOT_FOUND:");
    });

    it("il motivo del rifiuto del token viene loggato, mai restituito", () => {
        expect(SOURCE).toContain("console.warn");
        // Nessun ramo mette il messaggio dell'errore nel corpo della risposta.
        expect(SOURCE).not.toMatch(/errorResponse\([^)]*tokenErr/);
        expect(SOURCE).not.toMatch(/details:\s*\{[^}]*message/);
    });
});

describe("la lettura non scrive nulla", () => {
    it("esiste una sola scrittura sulla tabella reservations", () => {
        const updates = SOURCE.match(/\.update\(/g) ?? [];
        expect(updates).toHaveLength(1);
    });

    it("nessun upsert o delete, e l'unico insert è sulle notifiche", () => {
        expect(SOURCE).not.toMatch(/\.upsert\(/);
        expect(SOURCE).not.toMatch(/\.delete\(/);
        const inserts = SOURCE.match(/\.insert\(/g) ?? [];
        expect(inserts).toHaveLength(1);
        expect(SOURCE).toContain('from("notifications").insert(rows)');
    });

    it("l'unica scrittura su reservations sta dopo il ramo cancel e dopo il ritorno della read", () => {
        const readReturn = SOURCE.indexOf('if (action === "read")');
        const cancelBranch = SOURCE.indexOf('// ── action === "cancel"');
        const update = SOURCE.indexOf(".update(");
        expect(readReturn).toBeGreaterThan(-1);
        expect(cancelBranch).toBeGreaterThan(readReturn);
        expect(update).toBeGreaterThan(cancelBranch);
    });

    it("l'avviso alla sede è invocato una volta sola, dopo il ritorno della read", () => {
        // La funzione è definita sopra `serve()`, quindi si conta il solo sito
        // di chiamata: `await notifyVenueOfCancellation(`.
        const calls = SOURCE.match(/await notifyVenueOfCancellation\(/g) ?? [];
        expect(calls).toHaveLength(1);
        expect(SOURCE.indexOf("await notifyVenueOfCancellation(")).toBeGreaterThan(
            SOURCE.indexOf('if (action === "read")')
        );
    });

    it("non aggiorna contatori o timestamp di accesso sulla riga", () => {
        for (const field of ["last_seen", "viewed_at", "opened_at", "view_count", "access_count"]) {
            expect(SOURCE).not.toContain(field);
        }
    });
});

describe("il cutoff è ricalcolato server-side", () => {
    it("valuta la finestra una volta sola, prima di distinguere read da cancel", () => {
        const evaluations = SOURCE.match(/evaluateCancellationWindow\(/g) ?? [];
        expect(evaluations).toHaveLength(1);
        expect(SOURCE.indexOf("evaluateCancellationWindow({")).toBeLessThan(
            SOURCE.indexOf('if (action === "read")')
        );
    });

    it("gli input della finestra vengono dalla riga letta dal DB, non dal body", () => {
        expect(SOURCE).toContain("reservationDate: reservation.reservation_date");
        expect(SOURCE).toContain("reservationTime: reservation.reservation_time");
        expect(SOURCE).toContain(
            "cutoffMinutes: activity.reservation_cancellation_cutoff_minutes"
        );
    });

    it("non legge mai can_cancel (o simili) dal corpo della richiesta", () => {
        expect(SOURCE).not.toMatch(/body\.can_cancel/);
        expect(SOURCE).not.toMatch(/body\.cutoff/);
        expect(SOURCE).not.toMatch(/body\.status/);
        // Il body è usato solo per token e action.
        const bodyReads = [...SOURCE.matchAll(/body\.(\w+)/g)].map(m => m[1]);
        expect([...new Set(bodyReads)].sort()).toEqual(["action", "token"]);
    });

    it("il gate sulla finestra precede l'UPDATE", () => {
        expect(SOURCE.indexOf("if (!window.allowed)")).toBeLessThan(SOURCE.indexOf(".update("));
    });
});

describe("compare-and-set e stato", () => {
    it("l'UPDATE usa la lista di stati della macchina, non una costante locale", () => {
        expect(SOURCE).toContain('.in("status", ACTION_EXPECTS.cancel_by_customer)');
        // Lo stato scritto viene dalla macchina a stati, non da una stringa
        // ricopiata qui (nel corpo delle risposte "cancelled" compare come
        // valore letterale, ed è corretto: è un dato, non una transizione).
        expect(SOURCE).toContain(".update({ status: ACTION_TO_STATUS.cancel_by_customer })");
    });

    it("una prenotazione già annullata è un successo idempotente, non un errore", () => {
        expect(SOURCE).toContain("already_cancelled: true");
        expect(SOURCE).toMatch(/reservation\.status === "cancelled"/);
    });
});

// La pagina di esito dice al cliente "Abbiamo avvisato la sede". Questi test
// esistono perché quella frase resti vera: se qualcuno rimuove un canale, il
// copy va cambiato di conseguenza, e il test deve costringere a notarlo.
describe("la sede viene avvisata davvero", () => {
    it("manda l'email di annullamento ai destinatari condivisi", () => {
        expect(SOURCE).toContain("buildReservationCancelledByCustomerEmail(");
        expect(SOURCE).toContain("resolveAlertRecipients(");
        expect(SOURCE).toContain("resend.emails.send(");
    });

    it("inserisce la notifica in-app per chi ha reservations.manage", () => {
        expect(SOURCE).toContain('p_permission_id: "reservations.manage"');
        expect(SOURCE).toContain('event_type: "reservation.cancelled_by_customer"');
    });

    it("l'avviso parte solo per l'annullamento appena avvenuto", () => {
        // Il ramo idempotente ritorna prima: la sede era già stata avvisata.
        expect(SOURCE.indexOf("already_cancelled: true")).toBeLessThan(
            SOURCE.indexOf("await notifyVenueOfCancellation(")
        );
    });

    it("un guasto dell'avviso non fa fallire la disdetta", () => {
        const fn = SOURCE.slice(
            SOURCE.indexOf("async function notifyVenueOfCancellation("),
            SOURCE.indexOf("serve(async (req: Request)")
        );
        // Due blocchi try/catch, uno per canale, e nessun throw.
        expect((fn.match(/catch \(/g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect(fn).not.toMatch(/\bthrow\b/);
    });
});

describe("superficie della risposta", () => {
    it("il riepilogo non espone dati che il cliente non deve vedere", () => {
        const summaryBlock = SOURCE.slice(
            SOURCE.indexOf("const summary = {"),
            SOURCE.indexOf('if (action === "read")')
        );
        for (const field of ["notes", "customer_email", "customer_phone", "tenant_id", "activity_id", "table_id"]) {
            expect(summaryBlock).not.toContain(field);
        }
    });

    it("il telefono della sede è filtrato da phone_public", () => {
        expect(SOURCE).toContain("activity.phone_public !== true");
    });
});

describe("configurazione dell'endpoint", () => {
    it("è registrata in config.toml con verify_jwt = false", () => {
        const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf-8");
        const block = config.slice(config.indexOf("[functions.cancel-reservation-public]"));
        expect(block).toContain("verify_jwt = false");
        expect(block).toContain("entrypoint = \"./functions/cancel-reservation-public/index.ts\"");
    });

    it("applica il rate limit prima di verificare il token", () => {
        expect(SOURCE.indexOf("checkRateLimit(")).toBeLessThan(
            SOURCE.indexOf("verifyReservationToken(")
        );
    });

    it("non mette l'IP in chiaro nella chiave del bucket", () => {
        expect(SOURCE).toContain("hashIp(");
        expect(SOURCE).not.toMatch(/ip:\$\{clientIp\}/);
    });
});
