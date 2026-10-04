import { describe, expect, it } from "vitest";
import {
    buildAnsweredText,
    buildBriefMessage,
    buildCallerDeclinedText,
    buildCallerRequestMessage,
    buildOutcomeMessage,
    encodeCallAnswer,
    encodeCallOutcome
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
        expect(m.reply_markup.inline_keyboard[0].map(b => b.callback_data)).toEqual([
            encodeCallAnswer(AP, true),
            encodeCallAnswer(AP, false)
        ]);
        expect(m.reply_markup.inline_keyboard[1][0].url).toBe(`https://app.x/admin/lead/${VENUE}`);
    });

    it("senza indirizzo dell'app, niente pulsante della scheda", () => {
        expect(buildCallerRequestMessage(info, null).reply_markup.inline_keyboard).toHaveLength(1);
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
