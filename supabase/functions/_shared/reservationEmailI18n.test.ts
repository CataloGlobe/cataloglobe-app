// Le email al cliente nelle cinque lingue.
//
// Il grosso della garanzia e' nel tipo: `Record<EmailLang, ReservationEmailCopy>`
// impedisce a una lingua di dimenticare una chiave, e il progetto non compila
// prima ancora che un test giri. Questi test coprono cio' che il compilatore
// non vede: una chiave presente ma VUOTA, una frase rimasta in italiano dentro
// un'email tedesca, una lingua che non conosciamo trattata come un errore
// invece che come italiano, un accento che non sopravvive all'escaping.

import { describe, expect, it } from "vitest";

import {
    EMAIL_LANGS,
    RESERVATION_EMAIL_COPY,
    resolveEmailLang,
    type EmailLang,
    type ReservationEmailCopy
} from "./reservationEmailCopy.ts";
import { normalizeCustomerLanguageInput } from "./emailLang.ts";
import {
    buildReservationConfirmedEmail,
    buildReservationOutcomeEmail,
    buildReservationReceiptEmail,
    buildReservationReminderEmail,
    type ReservationEmailContent
} from "./reservationEmails.ts";
import { buildReservationIcs, buildReservationIcsAttachment } from "./reservationIcs.ts";
import { formatDate } from "./emailFormat.ts";

const VENUE = "Trattoria da Ciro";
const CUSTOMER = "Mario Rossi";
const DATE = "2026-08-31";
const TIME = "20:30:00";
const PARTY = 4;
// URL neutri: un path italiano ("/prenotazione/annulla") e' un DATO, non
// una nostra frase, e comparirebbe in ogni lingua falsando i controlli sotto.
const CANCEL_URL = "https://cataloglobe.com/t/c?t=abc";
const CONFIRM_URL = "https://cataloglobe.com/t/k?t=def";

/** Le quattro email che un cliente puo' ricevere, in una data lingua. */
function buildAllCustomerEmails(language: string | null | undefined): ReservationEmailContent[] {
    const base = {
        activityName: VENUE,
        customerName: CUSTOMER,
        reservationDate: DATE,
        reservationTime: TIME,
        partySize: PARTY,
        cancelUrl: CANCEL_URL,
        language
    };
    return [
        buildReservationReceiptEmail(base),
        buildReservationConfirmedEmail({ ...base, variant: "auto" }),
        buildReservationConfirmedEmail({ ...base, variant: "manual" }),
        buildReservationReminderEmail({ ...base, confirmUrl: CONFIRM_URL }),
        buildReservationOutcomeEmail({ ...base, action: "decline" }),
        buildReservationOutcomeEmail({ ...base, action: "cancel" })
    ];
}

// Frammenti che esistono SOLO in italiano. Se uno di questi compare in
// un'email francese, qualcosa e' rimasto indietro. Sono scelti per non
// collidere con le altre quattro lingue ("Persone" non e' lo spagnolo
// "Personas", "prenotazione" non e' il francese "réservation").
const ITALIAN_MARKERS = [
    "Ciao ",
    "Dettagli",
    // Con i due punti: il tedesco "Personen:" contiene "Persone", e senza
    // ancoraggio il marker segnalerebbe come italiana una riga tedesca.
    "Persone:",
    "Ora:",
    "prenotazione",
    "Prenotazione",
    "Non puoi più venire",
    "Ti aspettiamo",
    "Ci vediamo domani",
    "Buone notizie",
    "Riceverai una conferma",
    "Hai ricevuto questa email",
    "Per richieste relative",
    "ditta individuale",
    "nome commerciale"
];

describe("dizionario copy — completezza", () => {
    const keys = Object.keys(RESERVATION_EMAIL_COPY.it) as (keyof ReservationEmailCopy)[];

    it("tutte e cinque le lingue espongono esattamente le stesse chiavi", () => {
        for (const lang of EMAIL_LANGS) {
            expect(Object.keys(RESERVATION_EMAIL_COPY[lang]).sort()).toEqual([...keys].sort());
        }
    });

    // Il tipo garantisce la presenza, non il contenuto: una chiave puo' esserci
    // e valere "". Un'email con un buco al posto di una frase e' peggio di
    // un'email in italiano.
    it("nessuna chiave produce una stringa vuota, in nessuna lingua", () => {
        for (const lang of EMAIL_LANGS) {
            const copy = RESERVATION_EMAIL_COPY[lang];
            for (const key of keys) {
                const value = copy[key];
                const rendered = renderCopyValue(copy, key, value);
                for (const [label, text] of rendered) {
                    expect(
                        text.trim().length,
                        `${lang}.${String(key)}${label} è vuota`
                    ).toBeGreaterThan(0);
                }
            }
        }
    });
});

/**
 * Rende ogni chiave del dizionario in una o piu' stringhe da controllare.
 * Le funzioni vengono invocate con argomenti realistici e con tutte le varianti
 * che sanno declinare, cosi' nessun ramo resta fuori.
 */
function renderCopyValue(
    copy: ReservationEmailCopy,
    key: keyof ReservationEmailCopy,
    value: unknown
): [string, string][] {
    if (typeof value === "string") return [["", value]];
    switch (key) {
        case "greeting":
            return [["", copy.greeting(CUSTOMER)]];
        case "customerReason":
            return [["", copy.customerReason(VENUE)]];
        case "receiptSubject":
            return [["", copy.receiptSubject(VENUE)]];
        case "receiptLead":
            return [["", copy.receiptLead(VENUE, s => s)]];
        case "confirmedSubject":
            return [["", copy.confirmedSubject(VENUE)]];
        case "confirmedBody":
            return [
                ["(auto)", copy.confirmedBody(VENUE, "auto", s => s)],
                ["(manual)", copy.confirmedBody(VENUE, "manual", s => s)]
            ];
        case "reminderSubject":
            return [["", copy.reminderSubject(VENUE)]];
        case "reminderBody":
            return [["", copy.reminderBody(VENUE, s => s)]];
        case "outcomeTitle":
            return [
                ["(decline)", copy.outcomeTitle("decline")],
                ["(cancel)", copy.outcomeTitle("cancel")]
            ];
        case "outcomeBody":
            return [
                ["(decline)", copy.outcomeBody(VENUE, "decline", s => s)],
                ["(cancel)", copy.outcomeBody(VENUE, "cancel", s => s)]
            ];
        case "icsSummary":
            return [["", copy.icsSummary(VENUE)]];
        case "icsPeople":
            return [
                ["(1)", copy.icsPeople(1)],
                ["(4)", copy.icsPeople(4)]
            ];
        case "icsCancelLine":
            return [["", copy.icsCancelLine(CANCEL_URL)]];
        default:
            throw new Error(`Chiave non coperta dal test: ${String(key)}`);
    }
}

describe("resolveEmailLang", () => {
    it("riconosce le cinque lingue supportate", () => {
        for (const lang of EMAIL_LANGS) {
            expect(resolveEmailLang(lang)).toBe(lang);
        }
    });

    it("normalizza maiuscole, spazi e varianti regionali", () => {
        expect(resolveEmailLang("DE")).toBe("de");
        expect(resolveEmailLang("  fr  ")).toBe("fr");
        expect(resolveEmailLang("de-AT")).toBe("de");
        expect(resolveEmailLang("es_MX")).toBe("es");
        expect(resolveEmailLang("EN-gb")).toBe("en");
    });

    it("ricade su italiano per NULL, vuoto e lingue non supportate, senza lanciare", () => {
        for (const raw of [null, undefined, "", "   ", "pt", "xx", "zzzzz", "1", "🇩🇪"]) {
            expect(resolveEmailLang(raw as string | null | undefined)).toBe("it");
        }
    });
});

describe("normalizeCustomerLanguageInput — cosa finisce in colonna", () => {
    it("accetta i tag lingua semplici e li lascia intatti", () => {
        for (const raw of ["it", "en", "fr", "de", "es", "pt", "zh"]) {
            expect(normalizeCustomerLanguageInput(raw)).toBe(raw);
        }
    });

    // Il caso che ha motivato l'allineamento: prima queste forme venivano
    // scartate in scrittura (colonna NULL, nessun errore) mentre
    // `resolveEmailLang` sapeva gia' leggerle.
    it("accetta le forme con regione e script, senza normalizzarle", () => {
        expect(normalizeCustomerLanguageInput("de-DE")).toBe("de-DE");
        expect(normalizeCustomerLanguageInput("en-GB")).toBe("en-GB");
        expect(normalizeCustomerLanguageInput("pt-BR")).toBe("pt-BR");
        expect(normalizeCustomerLanguageInput("es_MX")).toBe("es_MX");
        expect(normalizeCustomerLanguageInput("zh-Hans-CN")).toBe("zh-Hans-CN");
    });

    it("toglie solo gli spazi ai bordi, maiuscole comprese", () => {
        expect(normalizeCustomerLanguageInput("  de-AT  ")).toBe("de-AT");
        expect(normalizeCustomerLanguageInput("DE")).toBe("DE");
    });

    it("scarta cio' che non e' un tag lingua plausibile", () => {
        for (const raw of ["", "   ", "d", "-de", "de-", "de--DE", "it;drop", "🇩🇪", "a".repeat(6)]) {
            expect(normalizeCustomerLanguageInput(raw), `"${raw}" doveva essere scartato`).toBeNull();
        }
        for (const raw of [null, undefined, 42, {}, ["de"]]) {
            expect(normalizeCustomerLanguageInput(raw)).toBeNull();
        }
    });

    // Le due regole devono concordare: tutto cio' che la scrittura accetta,
    // la lettura deve saperlo interpretare senza lanciare. È la garanzia che
    // chiude il NULL silenzioso.
    it("tutto cio' che passa la scrittura e' leggibile da resolveEmailLang", () => {
        const accepted = ["it", "de-DE", "en-GB", "pt-BR", "es_MX", "zh-Hans-CN", "DE", "fr-CA"];
        for (const raw of accepted) {
            const stored = normalizeCustomerLanguageInput(raw);
            expect(stored).not.toBeNull();
            expect(() => resolveEmailLang(stored)).not.toThrow();
        }
        expect(resolveEmailLang(normalizeCustomerLanguageInput("de-DE"))).toBe("de");
        expect(resolveEmailLang(normalizeCustomerLanguageInput("en-GB"))).toBe("en");
        expect(resolveEmailLang(normalizeCustomerLanguageInput("es_MX"))).toBe("es");
        // Lingua fuori dalle cinque: si salva, si legge, si scrive in italiano.
        expect(resolveEmailLang(normalizeCustomerLanguageInput("pt-BR"))).toBe("it");
    });
});

describe("email al cliente — resa per lingua", () => {
    it.each(EMAIL_LANGS)("%s: subject, html e text sono sempre pieni", lang => {
        for (const email of buildAllCustomerEmails(lang)) {
            expect(email.subject.trim().length).toBeGreaterThan(0);
            expect(email.html.trim().length).toBeGreaterThan(0);
            expect(email.text.trim().length).toBeGreaterThan(0);
        }
    });

    const nonItalian = EMAIL_LANGS.filter((l): l is Exclude<EmailLang, "it"> => l !== "it");

    it.each(nonItalian)("%s: nessuna frase resta in italiano", lang => {
        for (const email of buildAllCustomerEmails(lang)) {
            for (const marker of ITALIAN_MARKERS) {
                expect(email.subject, `subject (${lang}) contiene "${marker}"`).not.toContain(marker);
                expect(email.html, `html (${lang}) contiene "${marker}"`).not.toContain(marker);
                expect(email.text, `text (${lang}) contiene "${marker}"`).not.toContain(marker);
            }
        }
    });

    it.each(nonItalian)("%s: il testo e' davvero diverso da quello italiano", lang => {
        const italian = buildAllCustomerEmails("it");
        const translated = buildAllCustomerEmails(lang);
        translated.forEach((email, i) => {
            expect(email.subject).not.toBe(italian[i].subject);
            expect(email.text).not.toBe(italian[i].text);
        });
    });

    it("lingua NULL → italiano, identico a 'it' esplicito", () => {
        const explicit = buildAllCustomerEmails("it");
        for (const raw of [null, undefined]) {
            buildAllCustomerEmails(raw).forEach((email, i) => {
                expect(email).toEqual(explicit[i]);
            });
        }
    });

    it("lingua non supportata → italiano, nessuna eccezione", () => {
        const explicit = buildAllCustomerEmails("it");
        for (const raw of ["pt", "xx", "", "   ", "zzzzz"]) {
            expect(() => buildAllCustomerEmails(raw)).not.toThrow();
            buildAllCustomerEmails(raw).forEach((email, i) => {
                expect(email).toEqual(explicit[i]);
            });
        }
    });

    // La lingua deve arrivare fino al footer legale: due frasi sono nostre e
    // seguono l'email, il resto (ragione sociale, indirizzo, P.IVA) e' dato.
    it.each(nonItalian)("%s: anche il footer legale segue la lingua", lang => {
        const [receipt] = buildAllCustomerEmails(lang);
        expect(receipt.text).toContain("P.IVA");
        expect(receipt.text).not.toContain("ditta individuale");
    });
});

describe("email al cliente — date e ore nella convenzione della lingua", () => {
    it("la data lunga segue la lingua", () => {
        expect(formatDate("2026-08-31", "it")).toBe("31 agosto 2026");
        expect(formatDate("2026-08-31", "en")).toBe("31 August 2026");
        expect(formatDate("2026-08-31", "fr")).toBe("31 août 2026");
        expect(formatDate("2026-08-31", "de")).toBe("31. August 2026");
        expect(formatDate("2026-08-31", "es")).toBe("31 de agosto de 2026");
    });

    it("lingua assente o non supportata → data italiana", () => {
        expect(formatDate("2026-08-31")).toBe("31 agosto 2026");
        expect(formatDate("2026-08-31", null)).toBe("31 agosto 2026");
        expect(formatDate("2026-08-31", "pt")).toBe("31 agosto 2026");
    });

    it("ogni email porta la data nel formato della propria lingua", () => {
        const expected: Record<EmailLang, string> = {
            it: "31 agosto 2026",
            en: "31 August 2026",
            fr: "31 août 2026",
            de: "31. August 2026",
            es: "31 de agosto de 2026"
        };
        for (const lang of EMAIL_LANGS) {
            for (const email of buildAllCustomerEmails(lang)) {
                expect(email.text, `text (${lang})`).toContain(expected[lang]);
                expect(email.html, `html (${lang})`).toContain(expected[lang]);
            }
        }
    });

    // Tutte e cinque le lingue usano l'orologio a 24 ore: l'ora resta "20:30"
    // ovunque, e questo test lo mette per iscritto invece di lasciarlo
    // all'intuizione di chi legge `formatTimeIt`.
    it("l'ora e' 24h in tutte le lingue", () => {
        for (const lang of EMAIL_LANGS) {
            for (const email of buildAllCustomerEmails(lang)) {
                expect(email.text).toContain("20:30");
            }
        }
    });
});

describe("caratteri accentati e speciali", () => {
    const TRICKY_VENUE = "Café «Grüß Gott» & Co. <b>";
    const TRICKY_CUSTOMER = "Zoë Müller-Groß";

    it.each(EMAIL_LANGS)("%s: accenti e ß sopravvivono, l'HTML resta escapato", lang => {
        const email = buildReservationConfirmedEmail({
            activityName: TRICKY_VENUE,
            customerName: TRICKY_CUSTOMER,
            reservationDate: DATE,
            reservationTime: TIME,
            partySize: PARTY,
            variant: "auto",
            cancelUrl: CANCEL_URL,
            language: lang
        });

        // I caratteri passano intatti nel testo semplice…
        expect(email.text).toContain("Grüß Gott");
        expect(email.text).toContain("Zoë Müller-Groß");
        expect(email.subject).toContain("Café");

        // …e nell'HTML, dove pero' i metacaratteri sono neutralizzati: nessun
        // tag iniettabile dal nome della sede.
        expect(email.html).toContain("Grüß Gott");
        expect(email.html).toContain("&amp; Co.");
        expect(email.html).toContain("&lt;b&gt;");
        expect(email.html).not.toContain("<b>");
    });
});

describe("allegato calendario (.ics)", () => {
    const NOW = new Date("2026-08-30T10:00:00Z");

    function ics(language: string | null | undefined, venue = VENUE): string {
        const value = buildReservationIcs({
            reservationId: "0f5b3a6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
            venueName: venue,
            reservationDate: DATE,
            reservationTime: TIME,
            partySize: PARTY,
            durationMinutes: 120,
            address: { address: "Via Verdi", street_number: "30", city: "Milano", province: "MI" },
            cancelUrl: CANCEL_URL,
            language,
            now: NOW
        });
        if (value === null) throw new Error("ICS non generato");
        return value;
    }

    it("SUMMARY e descrizione seguono la lingua", () => {
        expect(ics("it")).toContain("SUMMARY:Prenotazione — Trattoria da Ciro");
        expect(ics("en")).toContain("SUMMARY:Booking — Trattoria da Ciro");
        expect(ics("fr")).toContain("SUMMARY:Réservation — Trattoria da Ciro");
        expect(ics("de")).toContain("SUMMARY:Reservierung — Trattoria da Ciro");
        expect(ics("es")).toContain("SUMMARY:Reserva — Trattoria da Ciro");

        expect(ics("de")).toContain("4 Personen");
        expect(ics("en")).toContain("4 people");
        expect(ics("fr")).toContain("4 personnes");
    });

    it("il nome della sede e l'indirizzo NON si traducono", () => {
        for (const lang of EMAIL_LANGS) {
            const value = ics(lang);
            expect(value).toContain("Trattoria da Ciro");
            expect(value).toContain("Via Verdi\\, 30");
        }
    });

    it("lingua NULL o non supportata → italiano", () => {
        expect(ics(null)).toBe(ics("it"));
        expect(ics("pt")).toBe(ics("it"));
        expect(ics("")).toBe(ics("it"));
    });

    it("il nome del file segue la lingua", () => {
        const filenames = EMAIL_LANGS.map(lang => {
            const attachment = buildReservationIcsAttachment({
                reservationId: "0f5b3a6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
                venueName: VENUE,
                reservationDate: DATE,
                reservationTime: TIME,
                partySize: PARTY,
                cancelUrl: CANCEL_URL,
                language: lang,
                now: NOW
            });
            return attachment?.[0]?.filename;
        });
        expect(filenames).toEqual([
            "prenotazione.ics",
            "booking.ics",
            "reservation.ics",
            "reservierung.ics",
            "reserva.ics"
        ]);
    });

    it("accenti, ß e metacaratteri TEXT restano validi in ogni lingua", () => {
        for (const lang of EMAIL_LANGS) {
            const value = ics(lang, "Grüß Gott; Café, Bar\\Bistro");

            // Escaping RFC 5545: `;` `,` e `\` preceduti da backslash, accenti
            // intatti. I due punti NON si escapano.
            expect(value).toContain("Grüß Gott\\; Café\\, Bar\\\\Bistro");

            // Piegatura a 75 OTTETTI, non caratteri: con ü e ß la differenza
            // e' reale. Le righe di continuazione iniziano con uno spazio.
            for (const line of value.split("\r\n")) {
                expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
            }

            // Base64 dell'allegato: `btoa` diretto lancerebbe su questi
            // caratteri, il passaggio da TextEncoder no.
            expect(() =>
                buildReservationIcsAttachment({
                    reservationId: "0f5b3a6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
                    venueName: "Grüß Gott; Café, Bar\\Bistro",
                    reservationDate: DATE,
                    reservationTime: TIME,
                    partySize: PARTY,
                    language: lang,
                    now: NOW
                })
            ).not.toThrow();
        }
    });
});
