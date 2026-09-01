import { describe, it, expect } from "vitest";
import {
    buildReservationIcs,
    buildReservationIcsUid,
    formatVenueAddress,
    reservationIcsToBase64,
    type ReservationIcsInput
} from "./reservationIcs.ts";

const RID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const NOW = new Date(Date.UTC(2026, 6, 14, 10, 0, 0));

const BASE: ReservationIcsInput = {
    reservationId: RID,
    venueName: "Trattoria da Ciro",
    reservationDate: "2026-07-15",
    reservationTime: "20:00:00",
    partySize: 4,
    durationMinutes: 120,
    address: {
        address: "Via Verdi",
        street_number: "30",
        postal_code: "20092",
        city: "Cinisello Balsamo",
        province: "MI"
    },
    cancelUrl: "https://cataloglobe.com/ciro/prenotazione/annulla?token=v1.abc.def",
    now: NOW
};

/** Srotola la piegatura, per asserire sul valore logico di una proprietà. */
function unfold(ics: string): string {
    return ics.replace(/\r\n /g, "");
}

function lineFor(ics: string, prop: string): string | undefined {
    return unfold(ics)
        .split("\r\n")
        .find(l => l.startsWith(`${prop}:`));
}

describe("struttura del file", () => {
    it("è un VCALENDAR con un VEVENT e i campi obbligatori", () => {
        const ics = buildReservationIcs(BASE)!;
        expect(ics).toContain("BEGIN:VCALENDAR");
        expect(ics).toContain("VERSION:2.0");
        expect(ics).toContain("PRODID:-//CataloGlobe//Prenotazioni//IT");
        expect(ics).toContain("BEGIN:VEVENT");
        expect(ics).toContain("END:VEVENT");
        expect(ics).toContain("END:VCALENDAR");
        for (const prop of ["UID", "DTSTAMP", "DTSTART", "DTEND", "SUMMARY", "LOCATION"]) {
            expect(lineFor(ics, prop)).toBeDefined();
        }
    });

    it("usa CRLF ovunque, terminatore finale compreso", () => {
        const ics = buildReservationIcs(BASE)!;
        expect(ics.endsWith("\r\n")).toBe(true);
        // Nessun \n che non sia preceduto da \r.
        expect(/(?<!\r)\n/.test(ics)).toBe(false);
    });

    it("è un evento da aggiungere, NON un invito con RSVP", () => {
        const ics = buildReservationIcs(BASE)!;
        expect(ics).toContain("METHOD:PUBLISH");
        expect(ics).not.toContain("METHOD:REQUEST");
        expect(ics).not.toContain("ATTENDEE");
        expect(ics).not.toContain("ORGANIZER");
        expect(ics).not.toContain("RSVP");
    });
});

describe("UID stabile", () => {
    it("dipende solo dal reservation_id", () => {
        expect(buildReservationIcsUid(RID)).toBe(`reservation-${RID}@cataloglobe.com`);
    });

    it("è identico fra due generazioni con dati diversi contorno", () => {
        // Il caso reale: la conferma e il promemoria sono due edge diverse,
        // partono a giorni di distanza e hanno `now` diversi. Se l'UID
        // divergesse, il cliente si troverebbe DUE appuntamenti in calendario.
        const conferma = buildReservationIcs(BASE)!;
        const promemoria = buildReservationIcs({
            ...BASE,
            now: new Date(Date.UTC(2026, 6, 14, 16, 0, 0)),
            cancelUrl: "https://cataloglobe.com/ciro/prenotazione/annulla?token=v1.zzz.yyy"
        })!;
        expect(lineFor(conferma, "UID")).toBe(lineFor(promemoria, "UID"));
        // …e i DTSTAMP invece differiscono, come devono.
        expect(lineFor(conferma, "DTSTAMP")).not.toBe(lineFor(promemoria, "DTSTAMP"));
    });

    it("normalizza maiuscole e spazi nell'id", () => {
        expect(buildReservationIcsUid(`  ${RID.toUpperCase()}  `)).toBe(
            `reservation-${RID}@cataloglobe.com`
        );
    });

    it("prenotazioni diverse hanno UID diversi", () => {
        expect(buildReservationIcsUid(RID)).not.toBe(
            buildReservationIcsUid("11111111-2222-3333-4444-555555555555")
        );
    });
});

describe("fuso orario — UTC", () => {
    it("converte l'ora locale della sede in istante UTC (estate, +2)", () => {
        const ics = buildReservationIcs(BASE)!;
        expect(lineFor(ics, "DTSTART")).toBe("DTSTART:20260715T180000Z");
        expect(lineFor(ics, "DTEND")).toBe("DTEND:20260715T200000Z");
    });

    it("in inverno lo scarto è di un'ora (+1)", () => {
        const ics = buildReservationIcs({ ...BASE, reservationDate: "2026-01-15" })!;
        expect(lineFor(ics, "DTSTART")).toBe("DTSTART:20260115T190000Z");
    });

    it("il giorno del passaggio all'ora legale usa già CEST", () => {
        const ics = buildReservationIcs({ ...BASE, reservationDate: "2026-03-29" })!;
        expect(lineFor(ics, "DTSTART")).toBe("DTSTART:20260329T180000Z");
    });

    it("la vigilia del passaggio è ancora CET", () => {
        const ics = buildReservationIcs({ ...BASE, reservationDate: "2026-03-28" })!;
        expect(lineFor(ics, "DTSTART")).toBe("DTSTART:20260328T190000Z");
    });

    it("il giorno del ritorno all'ora solare torna a CET", () => {
        const ics = buildReservationIcs({ ...BASE, reservationDate: "2026-10-25" })!;
        expect(lineFor(ics, "DTSTART")).toBe("DTSTART:20261025T190000Z");
    });

    it("la vigilia del ritorno è ancora CEST", () => {
        const ics = buildReservationIcs({ ...BASE, reservationDate: "2026-10-24" })!;
        expect(lineFor(ics, "DTSTART")).toBe("DTSTART:20261024T180000Z");
    });

    it("nessun timestamp è floating: tutti finiscono con Z", () => {
        const ics = unfold(buildReservationIcs(BASE)!);
        for (const prop of ["DTSTAMP", "DTSTART", "DTEND"]) {
            expect(lineFor(ics, prop)).toMatch(/^\w+:\d{8}T\d{6}Z$/);
        }
        expect(ics).not.toContain("TZID");
    });
});

describe("durata", () => {
    it("usa la durata della sede quando non è quella standard", () => {
        const ics = buildReservationIcs({ ...BASE, durationMinutes: 90 })!;
        expect(lineFor(ics, "DTEND")).toBe("DTEND:20260715T193000Z");
    });

    it("gestisce una durata lunga", () => {
        const ics = buildReservationIcs({ ...BASE, durationMinutes: 240 })!;
        expect(lineFor(ics, "DTEND")).toBe("DTEND:20260715T220000Z");
    });

    it.each([
        ["null", null],
        ["undefined", undefined],
        ["zero", 0],
        ["negativa", -30],
        ["oltre il massimo", 601],
        ["NaN", Number.NaN]
    ])("ripiega su 120 minuti con durata %s", (_label, value) => {
        const ics = buildReservationIcs({ ...BASE, durationMinutes: value })!;
        expect(lineFor(ics, "DTEND")).toBe("DTEND:20260715T200000Z");
    });
});

describe("mezzanotte e cambi di data", () => {
    it("una cena alle 23:30 finisce il giorno dopo", () => {
        const ics = buildReservationIcs({ ...BASE, reservationTime: "23:30:00" })!;
        expect(lineFor(ics, "DTSTART")).toBe("DTSTART:20260715T213000Z");
        expect(lineFor(ics, "DTEND")).toBe("DTEND:20260715T233000Z");
    });

    it("a mezzanotte e mezza l'evento sconfina di giorno anche in UTC", () => {
        // 23:30 a Roma = 21:30 UTC; +3h = 00:30 UTC del giorno dopo
        // (che a Roma sono le 02:30, sempre del giorno dopo).
        const ics = buildReservationIcs({
            ...BASE,
            reservationTime: "23:30:00",
            durationMinutes: 180
        })!;
        expect(lineFor(ics, "DTEND")).toBe("DTEND:20260716T003000Z");
    });

    it("attraversa il cambio di mese", () => {
        const ics = buildReservationIcs({
            ...BASE,
            reservationDate: "2026-07-31",
            reservationTime: "23:00:00",
            durationMinutes: 180
        })!;
        // 23:00 a Roma = 21:00 UTC; +3h = mezzanotte UTC del 1 agosto.
        expect(lineFor(ics, "DTEND")).toBe("DTEND:20260801T000000Z");
    });

    it("attraversa il cambio d'anno", () => {
        const ics = buildReservationIcs({
            ...BASE,
            reservationDate: "2026-12-31",
            reservationTime: "23:00:00",
            durationMinutes: 180
        })!;
        // 23:00 a Roma d'inverno = 22:00 UTC; +3h = 01:00 UTC del 1 gennaio.
        expect(lineFor(ics, "DTSTART")).toBe("DTSTART:20261231T220000Z");
        expect(lineFor(ics, "DTEND")).toBe("DTEND:20270101T010000Z");
    });
});

describe("escaping dei caratteri speciali", () => {
    it("escapa virgole, punti e virgola e barre nel nome della sede", () => {
        const ics = buildReservationIcs({
            ...BASE,
            venueName: "Bar; Trattoria, da C\\iro"
        })!;
        const summary = lineFor(ics, "SUMMARY")!;
        expect(summary).toContain("Bar\\; Trattoria\\, da C\\\\iro");
        // Nessun separatore ICS grezzo sopravvive nel valore.
        expect(summary.replace(/\\[;,\\]/g, "")).not.toMatch(/[;,]/);
    });

    it("trasforma gli a capo in \\n letterale", () => {
        const ics = buildReservationIcs({
            ...BASE,
            address: { address: "Via Verdi\n30", city: "Milano" }
        })!;
        const location = lineFor(ics, "LOCATION")!;
        expect(location).toContain("\\n");
        // Nessun a capo reale dentro il valore: spezzerebbe il file.
        expect(location).not.toMatch(/[\r\n]/);
    });

    it("gestisce anche i CRLF nell'input", () => {
        const ics = buildReservationIcs({
            ...BASE,
            venueName: "Trattoria\r\nda Ciro"
        })!;
        expect(lineFor(ics, "SUMMARY")).toContain("Trattoria\\nda Ciro");
    });

    it("lascia in pace apostrofi e due punti", () => {
        // Non sono separatori nei valori TEXT: escaparli produrrebbe testo
        // sbagliato sullo schermo del cliente.
        const ics = buildReservationIcs({ ...BASE, venueName: "L'Osteria: il Ritrovo" })!;
        const summary = lineFor(ics, "SUMMARY")!;
        expect(summary).toContain("L'Osteria: il Ritrovo");
        expect(summary).not.toContain("\\'");
    });

    it("il link di disdetta sopravvive intatto nella descrizione", () => {
        const ics = buildReservationIcs(BASE)!;
        const description = lineFor(ics, "DESCRIPTION")!;
        expect(description).toContain("https://cataloglobe.com/ciro/prenotazione/annulla?token=v1.abc.def");
    });
});

describe("piegatura a 75 ottetti", () => {
    it("nessuna riga supera i 75 ottetti", () => {
        const ics = buildReservationIcs({
            ...BASE,
            venueName: "Ristorante Pizzeria Trattoria Osteria del Gran Vecchio Mulino Antico",
            address: {
                address: "Viale delle Rimembranze dei Caduti di Tutte le Guerre",
                street_number: "1284/B",
                postal_code: "20092",
                city: "Cinisello Balsamo",
                province: "MI"
            }
        })!;
        const encoder = new TextEncoder();
        for (const line of ics.split("\r\n")) {
            expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
        }
    });

    it("le righe piegate ripartono con uno spazio singolo", () => {
        const ics = buildReservationIcs({
            ...BASE,
            venueName: "Ristorante Pizzeria Trattoria Osteria del Gran Vecchio Mulino Antico"
        })!;
        const folded = ics.split("\r\n").filter(l => l.startsWith(" "));
        expect(folded.length).toBeGreaterThan(0);
        for (const line of folded) {
            expect(line.startsWith("  ")).toBe(false);
        }
    });

    it("srotolata, la proprietà torna al valore logico intero", () => {
        const venueName = "Ristorante Pizzeria Trattoria Osteria del Gran Vecchio Mulino Antico";
        const ics = buildReservationIcs({ ...BASE, venueName })!;
        expect(lineFor(ics, "SUMMARY")).toBe(`SUMMARY:Prenotazione — ${venueName}`);
    });

    it("non spezza un carattere multi-byte a metà", () => {
        // Nome tutto accentato: i confini di piegatura cadono per forza vicino
        // a caratteri da due byte.
        const venueName = "Caffè " + "àèìòù".repeat(30);
        const ics = buildReservationIcs({ ...BASE, venueName })!;
        expect(lineFor(ics, "SUMMARY")).toBe(`SUMMARY:Prenotazione — ${venueName}`);
        // Nessun carattere di sostituzione: segno che nulla è stato tagliato.
        expect(ics).not.toContain("�");
    });
});

describe("indirizzo", () => {
    it("compone la forma completa del progetto", () => {
        expect(formatVenueAddress(BASE.address)).toBe(
            "Via Verdi, 30, 20092 Cinisello Balsamo (MI)"
        );
    });

    it.each([
        ["senza civico", { address: "Via Verdi", city: "Milano" }, "Via Verdi, Milano"],
        ["senza CAP", { address: "Via Verdi", street_number: "30", city: "Milano", province: "MI" }, "Via Verdi, 30, Milano (MI)"],
        ["senza provincia", { address: "Via Verdi", postal_code: "20092", city: "Milano" }, "Via Verdi, 20092 Milano"],
        ["solo città", { city: "Milano" }, "Milano"],
        ["solo via", { address: "Via Verdi" }, "Via Verdi"]
    ])("%s", (_label, address, expected) => {
        expect(formatVenueAddress(address)).toBe(expected);
    });

    it("scarta un civico senza via: da solo non dice nulla", () => {
        expect(formatVenueAddress({ street_number: "30", city: "Milano" })).toBe("Milano");
    });

    it.each([
        ["null", null],
        ["undefined", undefined],
        ["oggetto vuoto", {}],
        ["tutti null", { address: null, street_number: null, postal_code: null, city: null, province: null }],
        ["solo spazi", { address: "  ", city: "  " }],
        ["solo CAP", { postal_code: "20092" }]
    ])("ritorna null con %s", (_label, address) => {
        expect(formatVenueAddress(address)).toBeNull();
    });

    it("senza indirizzo utilizzabile LOCATION degrada al solo nome della sede", () => {
        const ics = buildReservationIcs({ ...BASE, address: null })!;
        expect(lineFor(ics, "LOCATION")).toBe("LOCATION:Trattoria da Ciro");
    });

    it("una colonna null non fa fallire la generazione", () => {
        const ics = buildReservationIcs({
            ...BASE,
            address: { address: "Via Verdi", street_number: null, postal_code: null, city: "Milano", province: null }
        });
        expect(ics).not.toBeNull();
        expect(lineFor(ics!, "LOCATION")).toBe("LOCATION:Trattoria da Ciro\\, Via Verdi\\, Milano");
    });
});

describe("descrizione", () => {
    it("riporta i coperti al singolare e al plurale", () => {
        expect(lineFor(buildReservationIcs({ ...BASE, partySize: 1 })!, "DESCRIPTION")).toContain(
            "1 persona"
        );
        expect(lineFor(buildReservationIcs(BASE)!, "DESCRIPTION")).toContain("4 persone");
    });

    it("senza link di disdetta resta solo il numero di coperti", () => {
        const ics = buildReservationIcs({ ...BASE, cancelUrl: null })!;
        const description = lineFor(ics, "DESCRIPTION")!;
        expect(description).toContain("4 persone");
        expect(description).not.toContain("Annulla");
    });

    it("senza nulla da dire la proprietà non viene emessa", () => {
        const ics = buildReservationIcs({
            ...BASE,
            partySize: 0,
            cancelUrl: null
        })!;
        expect(lineFor(ics, "DESCRIPTION")).toBeUndefined();
    });
});

describe("input inutilizzabili — degrada, non lancia", () => {
    it.each([
        ["data non ISO", { reservationDate: "15/07/2026" }],
        ["data inesistente", { reservationDate: "2026-02-30" }],
        ["ora non valida", { reservationTime: "25:99" }],
        ["nome sede vuoto", { venueName: "   " }],
        ["id vuoto", { reservationId: "" }],
        ["now non valido", { now: new Date("boh") }]
    ])("ritorna null con %s", (_label, override) => {
        expect(() => buildReservationIcs({ ...BASE, ...override })).not.toThrow();
        expect(buildReservationIcs({ ...BASE, ...override })).toBeNull();
    });
});

describe("base64", () => {
    it("va e torna senza perdere nulla", () => {
        const ics = buildReservationIcs(BASE)!;
        const decoded = new TextDecoder().decode(
            Uint8Array.from(atob(reservationIcsToBase64(ics)), c => c.charCodeAt(0))
        );
        expect(decoded).toBe(ics);
    });

    it("regge i caratteri accentati, dove btoa da solo lancerebbe", () => {
        const ics = buildReservationIcs({ ...BASE, venueName: "Caffè Perù" })!;
        expect(() => reservationIcsToBase64(ics)).not.toThrow();
        const decoded = new TextDecoder().decode(
            Uint8Array.from(atob(reservationIcsToBase64(ics)), c => c.charCodeAt(0))
        );
        expect(decoded).toContain("Caffè Perù");
    });
});
