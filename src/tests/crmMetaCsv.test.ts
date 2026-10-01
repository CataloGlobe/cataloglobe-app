import { describe, expect, it } from "vitest";
import {
    decodeMetaCsv,
    parseDelimited,
    parseMetaLeadsCsv,
    stripMetaPrefix
} from "@/utils/crm/metaCsv";

const HEADER = [
    "id",
    "created_time",
    "ad_id",
    "ad_name",
    "campaign_name",
    "form_name",
    "is_organic",
    "platform",
    "full_name",
    "phone_number",
    "email",
    "nome_del_locale",
    "cosa_ti_interessa?"
];

function tsv(rows: string[][]): string {
    return rows.map(r => r.join("\t")).join("\r\n");
}

describe("decodeMetaCsv", () => {
    it("legge l'UTF-16LE col BOM dell'export classico", () => {
        const text = "id\tfull_name\nl:1\tMario Rossi";
        const body = new Uint8Array(text.length * 2);
        for (let i = 0; i < text.length; i++) body[i * 2] = text.charCodeAt(i);
        const bytes = new Uint8Array([0xff, 0xfe, ...body]);
        expect(decodeMetaCsv(bytes)).toBe(text);
    });

    it("toglie il BOM dall'UTF-8", () => {
        const bytes = new TextEncoder().encode("﻿id,full_name");
        expect(decodeMetaCsv(bytes)).toBe("id,full_name");
    });
});

describe("parseDelimited", () => {
    it("gestisce virgolette, virgolette doppie e a capo nei campi", () => {
        const rows = parseDelimited('a,"b, c","d ""e""\nf"\n1,2,3', ",");
        expect(rows).toEqual([
            ["a", "b, c", 'd "e"\nf'],
            ["1", "2", "3"]
        ]);
    });
});

describe("stripMetaPrefix", () => {
    it("toglie i prefissi di Meta e lascia il resto", () => {
        expect(stripMetaPrefix("l:123456")).toBe("123456");
        expect(stripMetaPrefix("p:+393331234567")).toBe("+393331234567");
        expect(stripMetaPrefix("ag:120")).toBe("120");
        expect(stripMetaPrefix("+39 333")).toBe("+39 333");
    });
});

describe("parseMetaLeadsCsv", () => {
    it("mappa un lead del modulo Meta sull'ingresso del CRM", () => {
        const text = tsv([
            HEADER,
            [
                "l:987",
                "2026-10-06T18:30:00+02:00",
                "ag:555",
                "Video 3 - prenotazioni",
                "Ristoranti Milano",
                "Richiedi demo",
                "false",
                "ig",
                "Mario Rossi",
                "p:+393331234567",
                "mario@example.com",
                "Trattoria da Mario",
                "prenotazioni"
            ]
        ]);
        const { rows, errors } = parseMetaLeadsCsv(text);
        expect(errors).toEqual([]);
        expect(rows).toHaveLength(1);
        expect(rows[0].input).toMatchObject({
            source: "meta_form",
            sourceRef: "987",
            name: "Mario Rossi",
            venueName: "Trattoria da Mario",
            phoneE164: "+393331234567",
            email: "mario@example.com",
            adId: "555",
            adName: "Video 3 - prenotazioni",
            campaign: "Ristoranti Milano",
            consentText: "Modulo Meta «Richiedi demo»",
            receivedAt: "2026-10-06T16:30:00.000Z"
        });
        // Solo le risposte del modulo, non le colonne di sistema.
        expect(rows[0].input.formAnswers).toEqual({
            full_name: "Mario Rossi",
            phone_number: "p:+393331234567",
            email: "mario@example.com",
            nome_del_locale: "Trattoria da Mario",
            "cosa_ti_interessa?": "prenotazioni"
        });
    });

    it("normalizza un telefono in forma nazionale", () => {
        const text = tsv([
            ["id", "full_name", "phone_number"],
            ["l:1", "Anna", "333 123 4567"]
        ]);
        expect(parseMetaLeadsCsv(text).rows[0].input.phoneE164).toBe("+393331234567");
    });

    it("scarta le righe senza telefono valido, col numero di riga", () => {
        const text = tsv([
            ["id", "full_name", "phone_number"],
            ["l:1", "Anna", ""],
            ["l:2", "Bruno", "p:123"]
        ]);
        const { rows, errors } = parseMetaLeadsCsv(text);
        expect(rows).toEqual([]);
        expect(errors).toEqual([
            { line: 2, reason: "telefono mancante" },
            { line: 3, reason: "telefono non valido (123)" }
        ]);
    });

    it("usa il nome della persona se manca il locale", () => {
        const text = "id,first_name,last_name,phone_number\nl:1,Anna,Bianchi,+393331234567";
        const input = parseMetaLeadsCsv(text).rows[0].input;
        expect(input.name).toBe("Anna Bianchi");
        expect(input.venueName).toBe("Anna Bianchi");
    });

    it("file vuoto o solo intestazione: nessuna riga", () => {
        expect(parseMetaLeadsCsv("")).toEqual({ rows: [], errors: [] });
        expect(parseMetaLeadsCsv("id\tfull_name")).toEqual({ rows: [], errors: [] });
    });
});
