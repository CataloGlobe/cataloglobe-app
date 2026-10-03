import { describe, expect, it } from "vitest";
import {
    assignmentButtons,
    buildImportSummaryMessage,
    buildLeadMessage,
    chooseButtons,
    encodeAssign,
    escapeHtml,
    isEscalationDue,
    parseCallbackData,
    pickOutboxRecipients,
    returnedAdvice,
    romeWindowMinutesBetween,
    venueNameButtons,
    shortToUuid,
    uuidToShort,
    type CrmLeadMessageData,
    type CrmReturnedContext
} from "./crmTelegram";

const VENUE = "6f1c2e8a-3b4d-4c5e-9f60-7a8b9c0d1e2f";
const ALEX = "11111111-2222-4333-8444-555555555555";
const LORENZO = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TERZO = "01234567-89ab-4cde-8f01-23456789abcd";

const TWO = [
    { user_id: ALEX, display_name: "Alex" },
    { user_id: LORENZO, display_name: "Lorenzo" }
];
const THREE = [...TWO, { user_id: TERZO, display_name: "Terzo" }];

function data(overrides: Partial<CrmLeadMessageData> = {}): CrmLeadMessageData {
    return {
        kind: "new_lead",
        venueId: VENUE,
        venueName: "Trattoria <da> Mario & figli",
        city: "Milano",
        stageLabel: "Nuovo",
        contactName: "Mario Rossi",
        phoneE164: "+393331234567",
        sourceLabel: "Modulo Meta",
        adName: "Video 3",
        campaign: "Milano",
        interests: ["prenotazioni"],
        formAnswers: { nome_del_locale: "Trattoria", vuoto: "" },
        stoppedBefore: false,
        assignedTo: ALEX,
        adminUrl: "https://staging.cataloglobe.com/admin/lead/x",
        hasPhone: true,
        ...overrides
    };
}

describe("uuid corti", () => {
    it("andata e ritorno senza perdite, 22 caratteri", () => {
        for (const id of [VENUE, ALEX, LORENZO, TERZO, "00000000-0000-0000-0000-000000000000"]) {
            const short = uuidToShort(id);
            expect(short).toHaveLength(22);
            expect(shortToUuid(short)).toBe(id);
        }
    });

    it("callback_data entro i 64 byte di Telegram", () => {
        expect(new TextEncoder().encode(encodeAssign(VENUE, LORENZO)).length).toBeLessThanOrEqual(64);
    });

    it("rifiuta dati malformati", () => {
        expect(shortToUuid("corto")).toBeNull();
        expect(parseCallbackData("a:xyz:abc")).toBeNull();
        expect(parseCallbackData("z:" + uuidToShort(VENUE))).toBeNull();
    });

    it("legge le tre azioni", () => {
        expect(parseCallbackData(encodeAssign(VENUE, LORENZO))).toEqual({
            action: "assign",
            venueId: VENUE,
            userId: LORENZO
        });
        expect(parseCallbackData(`g:${uuidToShort(VENUE)}`)).toEqual({ action: "choose", venueId: VENUE });
        expect(parseCallbackData(`x:${uuidToShort(VENUE)}`)).toEqual({ action: "cancel", venueId: VENUE });
    });
});

describe("pulsanti per destinatario", () => {
    it("chi ha il lead vede «Assegnalo a <altro>»", () => {
        expect(assignmentButtons(VENUE, ALEX, ALEX, TWO)).toEqual([
            { text: "Assegnalo a Lorenzo", callback_data: encodeAssign(VENUE, LORENZO) }
        ]);
    });

    it("l'altro vede «Lo prendo io», che assegna a sé", () => {
        expect(assignmentButtons(VENUE, ALEX, LORENZO, TWO)).toEqual([
            { text: "Lo prendo io: assegnalo a me", callback_data: encodeAssign(VENUE, LORENZO) }
        ]);
    });

    it("dopo il passaggio i pulsanti si invertono", () => {
        expect(assignmentButtons(VENUE, LORENZO, ALEX, TWO)[0].text).toBe("Lo prendo io: assegnalo a me");
        expect(assignmentButtons(VENUE, LORENZO, LORENZO, TWO)[0].text).toBe("Assegnalo a Alex");
    });

    it("lead non assegnato: tutti vedono «Lo prendo io»", () => {
        expect(assignmentButtons(VENUE, null, ALEX, TWO)[0].text).toBe("Lo prendo io: assegnalo a me");
    });

    it("con più di due persone un tasto apre la scelta tra i nomi", () => {
        expect(assignmentButtons(VENUE, ALEX, ALEX, THREE)).toEqual([
            { text: "Assegnalo a un'altra persona…", callback_data: `g:${uuidToShort(VENUE)}` }
        ]);
        const rows = chooseButtons(VENUE, ALEX, THREE);
        expect(rows.map(r => r[0].text)).toEqual(["Lorenzo", "Terzo", "Annulla"]);
    });

    it("da soli nel team: nessun pulsante di passaggio", () => {
        expect(assignmentButtons(VENUE, ALEX, ALEX, [TWO[0]])).toEqual([]);
    });
});

describe("buildLeadMessage", () => {
    it("escapa l'HTML e salta le risposte vuote", () => {
        const { text } = buildLeadMessage(data(), ALEX, TWO);
        expect(text).toContain("<b>Trattoria &lt;da&gt; Mario &amp; figli</b> · Milano");
        expect(text).toContain("<i>nome del locale</i>: Trattoria");
        expect(text).not.toContain("vuoto");
        expect(text).toContain("Nuovo · Assegnato a te");
    });

    it("per l'altro destinatario dice chi l'ha preso", () => {
        const { text } = buildLeadMessage(data(), LORENZO, TWO);
        expect(text).toContain("Nuovo · Preso da Alex");
    });

    it("segnala lo stop e toglie il pulsante WhatsApp", () => {
        const msg = buildLeadMessage(
            data({ kind: "returned", stoppedBefore: true }),
            ALEX,
            TWO,
            "https://wa.example"
        );
        expect(msg.text).toContain("Aveva chiesto di non essere contattato");
        const texts = msg.reply_markup.inline_keyboard.flat().map(b => b.text);
        expect(texts).not.toContain("Scrivigli su WhatsApp");
        expect(texts).toContain("Apri la scheda nel CRM");
    });

    it("pulsante WhatsApp col link del destinatario, prima dei tasti di passaggio", () => {
        const msg = buildLeadMessage(data(), ALEX, TWO, "https://wa.example/alex");
        expect(msg.reply_markup.inline_keyboard[0][0]).toEqual({
            text: "Scrivigli su WhatsApp",
            url: "https://wa.example/alex"
        });
        expect(msg.reply_markup.inline_keyboard[1][0].text).toBe("Assegnalo a Lorenzo");
    });

    it("senza telefono niente pulsante WhatsApp", () => {
        const msg = buildLeadMessage(data({ hasPhone: false }), ALEX, TWO, "https://wa.example");
        expect(msg.reply_markup.inline_keyboard.flat().map(b => b.text)).not.toContain("Scrivigli su WhatsApp");
    });

    it("niente campi tecnici della landing, telefono scritto male con la sua etichetta", () => {
        const { text } = buildLeadMessage(
            data({ formAnswers: { variant: "b", landing_path: "/b", utm_source: "fb", phone_raw: "333 12", note: "ciao" } }),
            ALEX,
            TWO
        );
        expect(text).not.toContain("variant");
        expect(text).not.toContain("landing");
        expect(text).not.toContain("utm");
        expect(text).toContain("<i>telefono scritto (non valido)</i>: 333 12");
        expect(text).toContain("<i>note</i>: ciao");
    });

    it("sollecito con le ore di attesa", () => {
        expect(buildLeadMessage(data({ kind: "escalation", waitingHours: 3 }), LORENZO, TWO).text).toContain(
            "Lead fermo in Nuovo da 3 ore"
        );
    });
});

describe("escapeHtml", () => {
    it("i tre caratteri riservati di Telegram", () => {
        expect(escapeHtml("a<b>&c")).toBe("a&lt;b&gt;&amp;c");
    });
});

describe("fascia 9-21 di Roma", () => {
    // 1 ottobre 2026: ora legale, Roma = UTC+2.
    const at = (iso: string) => new Date(iso);

    it("conta solo i minuti tra le 9 e le 21", () => {
        // 20:00 → 23:00 Roma: solo 20:00-21:00.
        expect(romeWindowMinutesBetween(at("2026-10-01T18:00:00Z"), at("2026-10-01T21:00:00Z"))).toBe(60);
    });

    it("un lead delle 23 è dovuto alle 11 del giorno dopo, non prima", () => {
        const received = at("2026-10-01T21:00:00Z"); // 23:00 Roma
        expect(isEscalationDue(received, at("2026-10-02T08:59:00Z"))).toBe(false); // 10:59
        expect(isEscalationDue(received, at("2026-10-02T09:00:00Z"))).toBe(true); // 11:00
    });

    it("di giorno bastano due ore", () => {
        const received = at("2026-10-01T08:00:00Z"); // 10:00 Roma
        expect(isEscalationDue(received, at("2026-10-01T09:59:00Z"))).toBe(false);
        expect(isEscalationDue(received, at("2026-10-01T10:00:00Z"))).toBe(true);
    });

    it("dopo il cambio dell'ora (25 ottobre) resta sull'ora di Roma", () => {
        // 26 ottobre: ora solare, Roma = UTC+1. 9:00 Roma = 08:00Z.
        expect(romeWindowMinutesBetween(at("2026-10-26T07:00:00Z"), at("2026-10-26T09:00:00Z"))).toBe(60);
    });
});

describe("pickOutboxRecipients", () => {
    const team = [
        { user_id: ALEX, telegram_chat_id: 1 },
        { user_id: LORENZO, telegram_chat_id: 2 },
        { user_id: TERZO, telegram_chat_id: null }
    ];

    it("lead nuovo: tutto il team collegato", () => {
        const r = pickOutboxRecipients("new_lead", ALEX, team);
        expect(r.recipients.map(m => m.user_id)).toEqual([ALEX, LORENZO]);
        expect(r.done).toBe(false);
    });

    it("lead che torna: solo chi lo ha in carico", () => {
        const r = pickOutboxRecipients("returned", LORENZO, team);
        expect(r.recipients.map(m => m.user_id)).toEqual([LORENZO]);
        expect(r.done).toBe(false);
    });

    it("lead che torna a chi non ha Telegram: nessun invio, chiuso", () => {
        const r = pickOutboxRecipients("returned", TERZO, team);
        expect(r.recipients).toEqual([]);
        expect(r.done).toBe(true);
    });

    it("lead che torna senza assegnato (o assegnato uscito dal team): tutti", () => {
        expect(pickOutboxRecipients("returned", null, team).recipients).toHaveLength(2);
        expect(pickOutboxRecipients("returned", "99999999-2222-4333-8444-555555555555", team).recipients).toHaveLength(2);
    });
});

describe("buildImportSummaryMessage", () => {
    it("conta nuovi e già presenti, nasconde le righe a zero", () => {
        const m = buildImportSummaryMessage({
            importerName: "Alex <A>",
            created: 12,
            returned: 3,
            duplicate: 0,
            suppressed: 0,
            failed: 0,
            listUrl: "https://app.example/admin/lead"
        });
        expect(m.text).toContain("Import CSV Meta di Alex &lt;A&gt;");
        expect(m.text).toContain("Nuovi locali: 12");
        expect(m.text).toContain("Già nel CRM (richiesta aggiunta): 3");
        expect(m.text).not.toContain("Già importati prima");
        expect(m.text).not.toContain("Non entrati");
        expect(m.reply_markup.inline_keyboard).toEqual([
            [{ text: "Apri l'elenco", url: "https://app.example/admin/lead" }]
        ]);
    });

    it("mostra doppioni, esclusi e scarti quando ci sono", () => {
        const m = buildImportSummaryMessage({
            importerName: null,
            created: 0,
            returned: 0,
            duplicate: 4,
            suppressed: 1,
            failed: 2,
            listUrl: null
        });
        expect(m.text).toContain("Già importati prima: 4");
        expect(m.text).toContain("hanno chiesto lo stop: 1");
        expect(m.text).toContain("Non entrati: 2");
        expect(m.reply_markup.inline_keyboard).toEqual([]);
    });
});

const LEAD = "22222222-3333-4444-8555-666666666666";

function ctx(overrides: Partial<CrmReturnedContext> = {}): CrmReturnedContext {
    return {
        leadId: LEAD,
        knownSince: "2026-09-30T10:00:00Z",
        stageKey: "contattato",
        daysInStage: 5,
        previousStage: "contattato",
        previousLostKind: null,
        venueNameGiven: null,
        venueNameMatch: null,
        venueNameCheck: null,
        ...overrides
    };
}

function returned(c: Partial<CrmReturnedContext> = {}): CrmLeadMessageData {
    return data({
        kind: "returned",
        venueName: "Pizzeria Gino",
        stageLabel: "Contattato",
        returned: ctx(c)
    });
}

describe("lead tornato", () => {
    it("contesto: chi, da quando, a che punto, consiglio", () => {
        const { text } = buildLeadMessage(returned(), ALEX, TWO);
        expect(text).toContain("Ha compilato di nuovo il modulo");
        expect(text).toContain("Alex, <b>Mario Rossi</b> (+393331234567) ha compilato di nuovo il modulo.");
        expect(text).toContain("Lo conosciamo già come <b>Pizzeria Gino</b> (entrato il 30/09, ora in <i>Contattato</i> da 5 giorni).");
        expect(text).toContain("È in Contattato da 5 giorni senza risposta: è il momento buono per richiamarlo.");
        expect(text).not.toContain("Stavolta ha scritto");
    });

    it("stesso nome: niente tasti sul locale", () => {
        const msg = buildLeadMessage(returned({ venueNameGiven: "pizzeria gino", venueNameMatch: "same" }), ALEX, TWO);
        expect(msg.text).not.toContain("Stavolta ha scritto");
        const texts = msg.reply_markup.inline_keyboard.flat().map(b => b.text);
        expect(texts.some(t => t.startsWith("Stesso locale"))).toBe(false);
    });

    it("nome simile: refuso, con i due tasti", () => {
        const msg = buildLeadMessage(returned({ venueNameGiven: "Pizzeria Ginno", venueNameMatch: "typo" }), ALEX, TWO);
        expect(msg.text).toContain("Stavolta ha scritto <b>Pizzeria Ginno</b>: sembra un refuso.");
        expect(msg.text).toContain("etichetta «Locale da verificare»");
        const rows = msg.reply_markup.inline_keyboard.filter(r => r[0].text.startsWith("Stesso locale"));
        expect(rows).toEqual([
            [{ text: "Stesso locale: tieni «Pizzeria Gino»", callback_data: `s:${uuidToShort(LEAD)}` }],
            [{ text: "Stesso locale: chiamalo «Pizzeria Ginno»", callback_data: `n:${uuidToShort(LEAD)}` }]
        ]);
    });

    it("nome molto diverso: altro locale", () => {
        const { text } = buildLeadMessage(returned({ venueNameGiven: "Bar Centrale", venueNameMatch: "other" }), ALEX, TWO);
        expect(text).toContain("sembra un altro locale");
    });

    it("«Decido dopo» di un messaggio vecchio: etichetta e gli stessi due tasti", () => {
        const msg = buildLeadMessage(
            returned({ venueNameGiven: "Bar Centrale", venueNameMatch: "other", venueNameCheck: "later" }),
            ALEX,
            TWO
        );
        expect(msg.text).toContain("Locale da verificare");
        expect(
            venueNameButtons(ctx({ venueNameGiven: "Bar Centrale", venueNameMatch: "other", venueNameCheck: "later" }), "Pizzeria Gino").map(b => b.callback_data)
        ).toEqual([`s:${uuidToShort(LEAD)}`, `n:${uuidToShort(LEAD)}`]);
    });

    it("tasti uno per riga, nomi lunghi accorciati", () => {
        const msg = buildLeadMessage(
            returned({ venueNameGiven: "Ristorante Pizzeria Braceria da Gino al Porto", venueNameMatch: "other" }),
            ALEX,
            TWO,
            "https://wa.example"
        );
        expect(msg.reply_markup.inline_keyboard.every(r => r.length === 1)).toBe(true);
        const texts = msg.reply_markup.inline_keyboard.map(r => r[0].text);
        expect(texts).toContain("Stesso locale: chiamalo «Ristorante Pizzeria Braceri…»");
        expect(texts.at(-1)).toBe("Apri la scheda nel CRM");
    });

    it("dopo «È lo stesso locale»: conferma, niente tasti", () => {
        const msg = buildLeadMessage(
            returned({ venueNameGiven: "Pizzeria Ginno", venueNameMatch: "typo", venueNameCheck: "same" }),
            ALEX,
            TWO
        );
        expect(msg.text).toContain("Deciso: è lo stesso locale, si chiama Pizzeria Gino.");
        expect(venueNameButtons(ctx({ venueNameGiven: "Pizzeria Ginno", venueNameMatch: "typo", venueNameCheck: "same" }), "Pizzeria Gino")).toEqual([]);
    });

    it("il nome del locale è escapato", () => {
        const { text } = buildLeadMessage(returned({ venueNameGiven: "<b>x</b>", venueNameMatch: "other" }), ALEX, TWO);
        expect(text).toContain("&lt;b&gt;x&lt;/b&gt;");
    });

    it("callback del lead", () => {
        expect(parseCallbackData(`s:${uuidToShort(LEAD)}`)).toEqual({ action: "venue_same", leadId: LEAD });
        expect(parseCallbackData(`n:${uuidToShort(LEAD)}`)).toEqual({ action: "venue_rename", leadId: LEAD });
        expect(parseCallbackData(`l:${uuidToShort(LEAD)}`)).toEqual({ action: "venue_later", leadId: LEAD });
        expect(parseCallbackData("s:corto")).toBeNull();
    });

    it("consiglio per fase", () => {
        expect(returnedAdvice(ctx({ stageKey: "nuovo" }))).toContain("Non l'abbiamo ancora contattato");
        expect(returnedAdvice(ctx({ daysInStage: 0 }))).toContain("in Contattato da oggi");
        expect(returnedAdvice(ctx({ daysInStage: 1 }))).toContain("da 1 giorno");
        expect(returnedAdvice(ctx({ stageKey: "nuovo", previousStage: "perso", previousLostKind: "obiezione" }))).toContain(
            "tornato in Nuovo da solo"
        );
        expect(returnedAdvice(ctx({ stageKey: "cliente_pagante" }))).toContain("È già cliente");
        expect(returnedAdvice(ctx({ stageKey: "demo_fissata" }))).toContain("già in trattativa");
    });

    it("senza contesto resta il vecchio messaggio", () => {
        const { text } = buildLeadMessage(data({ kind: "returned" }), ALEX, TWO);
        expect(text).toContain("È tornato un lead già nel CRM");
    });
});
