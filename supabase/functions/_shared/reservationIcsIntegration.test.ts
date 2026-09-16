import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { buildReservationIcs, buildReservationIcsUid } from "./reservationIcs.ts";

// Guardrail sul sorgente: il generatore può restare corretto mentre chi lo usa
// lo usa male, o mentre qualcuno aggiunge "per completezza" un campo che
// cambia natura al file.

const GENERATOR = readFileSync(
    resolve(process.cwd(), "supabase/functions/_shared/reservationIcs.ts"),
    "utf-8"
);
const SUBMIT = readFileSync(
    resolve(process.cwd(), "supabase/functions/submit-reservation/index.ts"),
    "utf-8"
);
const RESPOND = readFileSync(
    resolve(process.cwd(), "supabase/functions/respond-reservation/index.ts"),
    "utf-8"
);
const REMINDERS = readFileSync(
    resolve(process.cwd(), "supabase/functions/send-reservation-reminders/index.ts"),
    "utf-8"
);
const UPDATE = readFileSync(
    resolve(process.cwd(), "supabase/functions/update-reservation/index.ts"),
    "utf-8"
);

/** Righe di codice del generatore, senza commenti (che parlano di ATTENDEE). */
const GENERATOR_CODE = GENERATOR.split("\n")
    .filter(line => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

describe("evento da aggiungere, mai invito con RSVP", () => {
    it("il generatore emette METHOD:PUBLISH", () => {
        expect(GENERATOR_CODE).toContain('"METHOD:PUBLISH"');
    });

    it("il generatore NON emette METHOD:REQUEST", () => {
        // Con REQUEST, Gmail e Outlook mostrano Accetta/Rifiuta e mandano una
        // risposta RSVP che nessuno legge.
        expect(GENERATOR_CODE).not.toContain("METHOD:REQUEST");
        expect(GENERATOR_CODE).not.toContain("METHOD:REPLY");
    });

    it("il generatore emette METHOD:CANCEL solo nel costruttore dell'annullamento", () => {
        // RFC 5546: PUBLISH si annulla con CANCEL. È l'unica altra forma
        // ammessa del file, e vive in una funzione a parte.
        expect(GENERATOR_CODE.match(/"METHOD:CANCEL"/g) ?? []).toHaveLength(1);
        expect(GENERATOR_CODE).toContain("export function buildReservationCancelledIcs(");
    });

    it("il generatore NON emette ATTENDEE né ORGANIZER", () => {
        // È la riga che qualcuno aggiungerebbe "per completezza": basta lei,
        // insieme o al posto di METHOD, per trasformare il file in un invito.
        expect(GENERATOR_CODE).not.toContain("ATTENDEE");
        expect(GENERATOR_CODE).not.toContain("ORGANIZER");
        expect(GENERATOR_CODE).not.toContain("PARTSTAT");
        expect(GENERATOR_CODE).not.toContain("RSVP");
    });

    it("esistono esattamente due righe METHOD: PUBLISH e CANCEL", () => {
        expect(GENERATOR_CODE.match(/METHOD:/g) ?? []).toHaveLength(2);
    });

    it("entrambe le forme emettono SEQUENCE, e nessuna lo calcola", () => {
        expect(GENERATOR_CODE.match(/`SEQUENCE:\$\{normalizeSequence\(icsSequence\)\}`/g) ?? []).toHaveLength(2);
        expect(GENERATOR_CODE).not.toMatch(/icsSequence\s*\+\s*1/);
    });
});

describe("UID stabile fra le tre email", () => {
    it("tutte e tre passano il reservation_id al generatore, non un valore proprio", () => {
        expect(SUBMIT).toContain("reservationId,");
        expect(RESPOND).toContain("reservationId: updated.id as string");
        expect(REMINDERS).toContain("reservationId: reservation.id");
    });

    it("l'UID non dipende da data, ora, sede né dall'istante di generazione", () => {
        const uid = buildReservationIcsUid("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
        const line = (ics: string) =>
            ics.replace(/\r\n /g, "").split("\r\n").find(l => l.startsWith("UID:"));

        const conferma = buildReservationIcs({
            reservationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
            venueName: "Trattoria da Ciro",
            reservationDate: "2026-07-15",
            reservationTime: "20:00:00",
            partySize: 4,
            durationMinutes: 120,
            now: new Date(Date.UTC(2026, 6, 1, 9, 0, 0))
        })!;
        const promemoria = buildReservationIcs({
            reservationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
            // Nome cambiato, durata cambiata, indirizzo comparso, altro istante:
            // è lo scenario reale a due settimane di distanza.
            venueName: "Trattoria da Ciro — Porta Venezia",
            reservationDate: "2026-07-15",
            reservationTime: "20:00:00",
            partySize: 6,
            durationMinutes: 90,
            address: { address: "Via Verdi", city: "Milano" },
            cancelUrl: "https://cataloglobe.com/x/prenotazione/annulla?token=v1.a.b",
            now: new Date(Date.UTC(2026, 6, 14, 16, 0, 0))
        })!;

        expect(line(conferma)).toBe(`UID:${uid}`);
        expect(line(promemoria)).toBe(`UID:${uid}`);
    });

    it("il generatore è l'unico posto che compone un UID", () => {
        for (const source of [SUBMIT, RESPOND, REMINDERS]) {
            expect(source).not.toContain("UID:");
        }
    });
});

describe("dove l'allegato compare, e dove no", () => {
    it("submit-reservation allega solo sulla conferma automatica", () => {
        expect(SUBMIT).toContain("isAutoConfirmed\n            ? buildReservationIcsAttachment({");
        // Una RICHIESTA ancora da approvare non va in agenda: se poi viene
        // rifiutata, il cliente resta con un appuntamento fantasma.
        expect(SUBMIT.match(/buildReservationIcsAttachment\(/g) ?? []).toHaveLength(1);
    });

    it("respond-reservation allega l'evento su confirm e l'annullamento sulle altre", () => {
        expect(RESPOND).toContain('action === "confirm" && activityRowForIcs');
        expect(RESPOND.match(/buildReservationIcsAttachment\(/g) ?? []).toHaveLength(1);
        expect(RESPOND).toContain('action !== "confirm" && activityRowForIcs');
        expect(RESPOND.match(/buildReservationCancelledIcsAttachment\(/g) ?? []).toHaveLength(1);
    });

    it("update-reservation allega l'evento aggiornato, con il SEQUENCE della riga", () => {
        expect(UPDATE.match(/buildReservationIcsAttachment\(/g) ?? []).toHaveLength(1);
        expect(UPDATE).toContain("icsSequence: updated.ics_sequence as number");
        expect(UPDATE).toContain("...(attachments ? { attachments } : {})");
        expect(UPDATE).not.toContain("UID:");
    });

    it("respond-reservation legge ics_sequence dalla riga rilette DOPO l'UPDATE, mai da prima", () => {
        // La SELECT preliminare (stato corrente, per il 409) non porta la
        // colonna: l'unico `ics_sequence` è nella `.select()` dell'UPDATE,
        // cioè il valore già incrementato dal trigger nella stessa
        // transazione. Letto prima, il CANCEL uscirebbe con lo stesso
        // SEQUENCE dell'ultimo PUBLISH e il client potrebbe ignorarlo.
        expect(RESPOND).toContain('.select("id, status, activity_id")');
        expect(RESPOND).toContain(
            ".update({ status: newStatus })\n            .eq(\"id\", reservationId)\n            .in(\"status\", expectedFrom)\n            .select(\n                \"id, activity_id, customer_email, customer_name, reservation_date, reservation_time, party_size, status, customer_language, ics_sequence\""
        );
        const respondCode = RESPOND.split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
        expect(respondCode.match(/ics_sequence/g) ?? []).toHaveLength(3); // select + 2 icsSequence
        expect(RESPOND).not.toContain("current.ics_sequence");
    });

    it("tutti i chiamanti passano il SEQUENCE della riga, nessuno lo inventa", () => {
        expect(RESPOND).toContain("icsSequence: updated.ics_sequence as number");
        expect(REMINDERS).toContain("icsSequence: reservation.ics_sequence");
        expect(REMINDERS).toContain("ics_sequence, ");
    });

    it("il promemoria allega sempre: chi lo riceve è già confermato", () => {
        expect(REMINDERS.match(/buildReservationIcsAttachment\(/g) ?? []).toHaveLength(1);
    });

    it("nessuna delle tre passa l'allegato quando è undefined", () => {
        expect(SUBMIT).toContain("...(icsAttachments ? { attachments: icsAttachments } : {})");
        for (const source of [RESPOND, REMINDERS]) {
            expect(source).toContain("...(attachments ? { attachments } : {})");
        }
    });
});

describe("l'allegato non può impedire l'invio", () => {
    it("il costruttore dell'allegato non lancia mai", () => {
        const helper = GENERATOR.slice(GENERATOR.indexOf("export function buildReservationIcsAttachment"));
        expect(helper).toContain("try {");
        expect(helper).toContain("catch (err)");
        expect(helper).toContain("return undefined;");
        const code = helper
            .split("\n")
            .filter(line => !line.trim().startsWith("//"))
            .join("\n");
        expect(code).not.toMatch(/\bthrow\b/);
    });

    it("nessun chiamante avvolge la costruzione in un proprio try che salta l'invio", () => {
        // L'helper è già a prova di tutto: un secondo try attorno con un
        // `continue` o un `return` nel catch reintrodurrebbe il rischio.
        for (const source of [SUBMIT, RESPOND, REMINDERS]) {
            const call = source.indexOf("buildReservationIcsAttachment({");
            const before = source.slice(Math.max(0, call - 200), call);
            expect(before).not.toMatch(/try\s*\{\s*$/);
        }
    });
});

describe("colonne lette dalle select", () => {
    it.each([
        ["submit-reservation", SUBMIT],
        ["respond-reservation", RESPOND],
        ["send-reservation-reminders", REMINDERS]
    ])("%s legge durata e componenti dell'indirizzo", (_name, source) => {
        expect(source).toContain("reservation_duration_minutes");
        for (const column of ["address", "street_number", "postal_code", "city", "province"]) {
            expect(source).toContain(column);
        }
    });
});
