import { describe, expect, it } from "vitest";
import {
    buildAnsweredText,
    buildBriefMessage,
    buildCallerDeclinedText,
    buildCallerOtherTimeMessage,
    buildCallerRequestMessage,
    buildCreatorQuestionMessage,
    buildHandedOverCallerText,
    buildHandedOverText,
    buildHandoverBusyQuestion,
    buildHandoverFailedText,
    buildLeadOtherTimeText,
    buildOtherTimeProposedText,
    buildOutcomeMessage,
    encodeCallAnswer,
    encodeCallAskCreator,
    encodeCallHandover,
    encodeCallOtherMenu,
    encodeCallOtherTime,
    encodeCallOutcome,
    handoverAt
} from "./crmAgendaMessages";
import { parseCallbackData } from "./crmTelegram";

const AP = "2f0f6b5e-8b1d-4c3a-9e2f-0a1b2c3d4e5f";
const VENUE = "11111111-2222-4333-8444-555555555555";
const info = {
    appointmentId: AP,
    venueId: VENUE,
    venueName: "Bar <Roma>",
    city: "Milano",
    contactName: "Mario Rossi",
    phone: "+393331112233",
    startsAt: "2026-10-08T15:45:00.000Z",
    endsAt: "2026-10-08T15:55:00.000Z",
    callerName: "Lorenzo",
    createdByName: "Alessandro",
    canHandOver: true,
    note: null
};

describe("callback dell'agenda", () => {
    it("andata e ritorno, sotto i 64 byte", () => {
        for (const accept of [true, false]) {
            const data = encodeCallAnswer(AP, accept);
            expect(data.length).toBeLessThanOrEqual(64);
            expect(parseCallbackData(data)).toEqual({ action: "call_answer", appointmentId: AP, accept });
        }
        for (const outcome of ["done", "no_show", "postponed"] as const) {
            expect(parseCallbackData(encodeCallOutcome(AP, outcome))).toEqual({ action: "call_outcome", appointmentId: AP, outcome });
        }
        expect(parseCallbackData(encodeCallHandover(AP))).toEqual({ action: "call_handover", appointmentId: AP });
        expect(parseCallbackData(encodeCallAskCreator(AP))).toEqual({ action: "call_ask_creator", appointmentId: AP });
        expect(parseCallbackData(encodeCallOtherMenu(AP, true))).toEqual({ action: "call_other_menu", appointmentId: AP, open: true });
        expect(parseCallbackData(encodeCallOtherMenu(AP, false))).toEqual({ action: "call_other_menu", appointmentId: AP, open: false });
        for (const shiftMinutes of [15, 30, 60, 1440] as const) {
            const data = encodeCallOtherTime(AP, shiftMinutes);
            expect(data.length).toBeLessThanOrEqual(64);
            expect(parseCallbackData(data)).toEqual({ action: "call_other_time", appointmentId: AP, shiftMinutes });
        }
    });

    it("un altro orario fuori dalla lista non si accetta", () => {
        const short = encodeCallHandover(AP).split(":")[1];
        expect(parseCallbackData(`ct:${short}:45`)).toBeNull();
        expect(parseCallbackData(`ct:${short}:x`)).toBeNull();
        expect(parseCallbackData(`ct:${short}`)).toBeNull();
    });

    it("i pulsanti vecchi restano quelli di prima", () => {
        const short = encodeCallAnswer(AP, true).split(":")[1];
        expect(parseCallbackData(`s:${short}`)).toEqual({ action: "venue_same", leadId: AP });
        expect(parseCallbackData(`n:${short}`)).toEqual({ action: "venue_rename", leadId: AP });
        expect(parseCallbackData(`zz:${short}`)).toBeNull();
        expect(parseCallbackData(`cy:${short}:${short}`)).toBeNull();
        expect(parseCallbackData("cy:corto")).toBeNull();
    });
});

describe("messaggi", () => {
    it("«Puoi tu?» con giorno, ora, durata e pulsanti", () => {
        const m = buildCallerRequestMessage(info, "https://app.x");
        expect(m.text).toContain("Alessandro ha fissato una telefonata con <b>Bar &lt;Roma&gt;</b>, Milano (Mario Rossi).");
        expect(m.text).toContain("<b>Puoi tu giovedì 8 alle 17:45?</b> Dura 10 minuti.");
        expect(m.text).toContain("la telefonata passa a Alessandro 2 ore prima dell'orario (mai a meno di 10 minuti)");
        expect(m.text).not.toContain("Ancora senza risposta");
        const rows = m.reply_markup.inline_keyboard;
        expect(rows.map(r => r[0].text)).toEqual(["Sì, chiamo io", "Propongo un altro orario", "Chiedo a Alessandro se può lui", "Apri la scheda"]);
        expect(rows.slice(0, 3).map(r => r[0].callback_data)).toEqual([
            encodeCallAnswer(AP, true),
            encodeCallOtherMenu(AP, true),
            encodeCallAskCreator(AP)
        ]);
        expect(rows[3][0].url).toBe(`https://app.x/admin/lead/${VENUE}`);
    });

    it("sollecito: stesso messaggio con «Ancora senza risposta» in testa", () => {
        const m = buildCallerRequestMessage(info, null, true);
        expect(m.text.startsWith("⏰ <b>Ancora senza risposta.</b>\n")).toBe(true);
        expect(m.reply_markup.inline_keyboard).toHaveLength(3);
    });

    it("se l'ha fissata chi chiama, niente «Chiedo a…»", () => {
        const m = buildCallerRequestMessage({ ...info, canHandOver: false }, null);
        expect(m.reply_markup.inline_keyboard.map(r => r[0].text)).toEqual(["Sì, chiamo io", "Propongo un altro orario"]);
        expect(m.text).not.toContain("passa a");
    });

    it("scelta di un altro orario: tre orari dello stesso giorno, domani, indietro", () => {
        const m = buildCallerOtherTimeMessage(info);
        expect(m.reply_markup.inline_keyboard.map(r => r[0].text)).toEqual([
            "Alle 18:00",
            "Alle 18:15",
            "Alle 18:45",
            "Domani, venerdì 9, alle 17:45",
            "Indietro"
        ]);
        expect(m.reply_markup.inline_keyboard[4][0].callback_data).toBe(encodeCallOtherMenu(AP, false));
        expect(m.text).toContain("<b>Che orario proponi a Mario Rossi?</b>");
        expect(m.text).toContain("Questa telefonata si annulla. Preparo il messaggio per lui: arriva qui come bozza e parte solo quando lo approvi.");
    });

    it("messaggio al lead al singolare", () => {
        expect(buildLeadOtherTimeText(info, 15)).toBe("Giovedì 8 alle 17:45 non riesco, possiamo fare alle 18:00?");
        expect(buildLeadOtherTimeText(info, 1440)).toBe("Giovedì 8 alle 17:45 non riesco, possiamo fare venerdì 9 alla stessa ora?");
        // A cavallo di mezzanotte l'ora cambia: va scritta.
        const late = { ...info, startsAt: "2026-10-08T21:45:00Z" };
        expect(buildLeadOtherTimeText(late, 15)).toBe("Giovedì 8 alle 23:45 non riesco, possiamo fare venerdì 9 alle 00:00?");
        // Cambio d'ora (domenica 25/10): domani è un'ora dopo sull'orologio.
        const dst = { ...info, startsAt: "2026-10-24T15:45:00Z" };
        expect(buildLeadOtherTimeText(dst, 1440)).toBe("Sabato 24 alle 17:45 non riesco, possiamo fare domenica 25 alle 16:45?");
        const first = { ...info, creatorAsked: false, handoverFailed: false };
        for (const m of [15, 30, 60, 1440] as const) expect(buildLeadOtherTimeText(first, m)).not.toMatch(/riusciamo|possiamo noi|Scusa/);
    });

    it("messaggio al lead dopo un rimbalzo: con le scuse", () => {
        const busy = { ...info, contactName: "Mario Rossi", creatorAsked: false, handoverFailed: true };
        expect(buildLeadOtherTimeText(busy, 30)).toBe(
            "Scusa Mario, ho avuto un contrattempo: al posto di giovedì 8 alle 17:45 riusciamo a fare alle 18:15?"
        );
        const asked = { ...info, contactName: null, creatorAsked: true, handoverFailed: false };
        expect(buildLeadOtherTimeText(asked, 1440)).toBe(
            "Scusa, ho avuto un contrattempo: al posto di giovedì 8 alle 17:45 riusciamo a fare venerdì 9 alla stessa ora?"
        );
    });

    it("passaggio non riuscito: lo sanno tutti e due", () => {
        const t = buildHandoverFailedText(info);
        expect(t).toContain("⚠️ La telefonata con Bar &lt;Roma&gt; di giovedì 8 alle 17:45 non è passata ad Alessandro");
        expect(t).toContain("al lead non è partita la conferma");
    });

    it("passaggio non riuscito per un'altra telefonata: a chi l'ha fissata si chiede di gestirla", () => {
        const m = buildHandoverBusyQuestion(info, "https://app.example");
        expect(m.text).toContain("⚠️ Lorenzo non ha risposto per la telefonata con");
        expect(m.text).toContain("e tu a quell'ora hai già un'altra telefonata.");
        expect(m.text).toContain("<b>Riesci a gestirla?</b>");
        const buttons = m.reply_markup.inline_keyboard.flat();
        expect(buttons[0]).toEqual({ text: "Propongo un altro orario al lead", callback_data: encodeCallOtherMenu(AP, true) });
        expect(buttons.some(b => "url" in b)).toBe(true);
    });

    it("passaggio e proposta: testi per chi l'ha fissata e per chi chiamava", () => {
        expect(buildHandedOverText(info)).toContain("Lorenzo non ha risposto al «Puoi tu?»: la telefonata con Bar &lt;Roma&gt; di giovedì 8 alle 17:45 la fai tu.");
        expect(buildHandedOverText(info, true)).toContain("📞 Non hai risposto: la telefonata con Bar &lt;Roma&gt; di giovedì 8 alle 17:45 resta a te.");
        expect(buildHandedOverCallerText(info)).toBe(
            "La telefonata con Bar &lt;Roma&gt; di giovedì 8 alle 17:45 l'ha presa Alessandro: non avevi risposto."
        );
        expect(buildHandedOverCallerText(info, true)).toBe(
            "📞 La telefonata con Bar &lt;Roma&gt; di giovedì 8 alle 17:45 la fa Alessandro. Al lead parte la conferma."
        );
        expect(buildOtherTimeProposedText(info, "A <b>")).toContain("«A &lt;b&gt;»");
        expect(buildOtherTimeProposedText(info, "Ok", "Alessandro")).toMatch(/^Alessandro non può fare la telefonata/);
    });

    it("«Chiedo a…»: la domanda a chi l'ha fissata, con sì e altro orario", () => {
        const m = buildCreatorQuestionMessage({ ...info, creatorAsked: true }, "https://app.x");
        expect(m.text).toContain("Lorenzo non può fare la telefonata con <b>Bar &lt;Roma&gt;</b>, Milano (Mario Rossi).");
        expect(m.text).toContain("<b>Puoi tu giovedì 8 alle 17:45?</b>");
        expect(m.text).toContain("Finché non rispondi, al lead non parte la conferma.");
        const rows = m.reply_markup.inline_keyboard;
        expect(rows.map(r => r[0].text)).toEqual(["Sì, chiamo io", "No, proponi un altro orario", "Apri la scheda"]);
        expect(rows.slice(0, 2).map(r => r[0].callback_data)).toEqual([encodeCallHandover(AP), encodeCallOtherMenu(AP, true)]);
    });

    it("passaggio: 2 ore prima, non prima del sollecito, non a meno di 10 minuti", () => {
        const starts = "2026-10-08T15:45:00.000Z";
        expect(handoverAt(starts, "2026-10-07T10:00:00.000Z").toISOString()).toBe("2026-10-08T13:45:00.000Z");
        expect(handoverAt(starts, "2026-10-08T14:00:00.000Z").toISOString()).toBe("2026-10-08T14:30:00.000Z");
        expect(handoverAt(starts, "2026-10-08T15:20:00.000Z").toISOString()).toBe("2026-10-08T15:35:00.000Z");
    });

    it("senza indirizzo dell'app, niente pulsante della scheda", () => {
        expect(buildCallerRequestMessage(info, null).reply_markup.inline_keyboard).toHaveLength(3);
        expect(buildOutcomeMessage(info, null).reply_markup.inline_keyboard[1]).toHaveLength(1);
    });

    it("brief con modulo e ultimi messaggi, testo protetto", () => {
        const m = buildBriefMessage(
            { ...info, note: "Vuole <b>sapere</b> i prezzi" },
            {
                stageLabel: "Telefonata fissata",
                interests: ["Menù digitale", "Ordini"],
                answers: [{ label: "Coperti", value: "80" }],
                lastMessages: [
                    { author: "lead", text: "Ok va bene giovedì" },
                    { author: "agent", text: "x".repeat(400) }
                ]
            },
            "https://app.x"
        );
        expect(m.text).toContain("<b>Tra poco: telefonata giovedì 8 alle 17:45</b> (10 minuti)");
        expect(m.text).toContain("Telefono: +393331112233");
        expect(m.text).toContain("Interessi: Menù digitale, Ordini");
        expect(m.text).toContain("Nota: Vuole &lt;b&gt;sapere&lt;/b&gt; i prezzi");
        expect(m.text).toContain("Coperti: 80");
        expect(m.text).toContain("Lead: Ok va bene giovedì");
        expect(m.text).toMatch(/Agente: x{219}…/);
    });

    it("«Com'è andata?» coi tre esiti", () => {
        const m = buildOutcomeMessage(info, "https://app.x");
        const data = m.reply_markup.inline_keyboard.flat().map(b => b.callback_data).filter(Boolean);
        expect(data).toEqual([encodeCallOutcome(AP, "done"), encodeCallOutcome(AP, "no_show"), encodeCallOutcome(AP, "postponed")]);
    });

    it("avvisi in chiaro", () => {
        expect(buildCallerDeclinedText(info)).toBe(
            "Lorenzo non può fare la telefonata con Bar &lt;Roma&gt; di giovedì 8 alle 17:45. Annullata: fissane un'altra dalla scheda."
        );
        expect(buildAnsweredText(info, "confermata")).toBe("Telefonata con <b>Bar &lt;Roma&gt;</b>, Milano di giovedì 8 alle 17:45: confermata");
    });
});
