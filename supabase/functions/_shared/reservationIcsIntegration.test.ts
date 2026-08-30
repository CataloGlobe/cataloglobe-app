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
        expect(GENERATOR_CODE).not.toContain("METHOD:CANCEL");
    });

    it("il generatore NON emette ATTENDEE né ORGANIZER", () => {
        // È la riga che qualcuno aggiungerebbe "per completezza": basta lei,
        // insieme o al posto di METHOD, per trasformare il file in un invito.
        expect(GENERATOR_CODE).not.toContain("ATTENDEE");
        expect(GENERATOR_CODE).not.toContain("ORGANIZER");
        expect(GENERATOR_CODE).not.toContain("PARTSTAT");
        expect(GENERATOR_CODE).not.toContain("RSVP");
    });

    it("esiste una sola riga METHOD in tutto il file", () => {
        expect(GENERATOR_CODE.match(/METHOD:/g) ?? []).toHaveLength(1);
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

    it("respond-reservation allega solo sull'azione confirm", () => {
        expect(RESPOND).toContain('action === "confirm" && activityRowForIcs');
        expect(RESPOND.match(/buildReservationIcsAttachment\(/g) ?? []).toHaveLength(1);
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
