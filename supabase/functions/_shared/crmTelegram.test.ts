import { describe, expect, it } from "vitest";
import {
    assignmentButtons,
    buildLeadMessage,
    chooseButtons,
    encodeAssign,
    escapeHtml,
    isEscalationDue,
    parseCallbackData,
    romeWindowMinutesBetween,
    shortToUuid,
    uuidToShort,
    type CrmLeadMessageData
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
    it("chi ha il lead vede «Gira a <altro>»", () => {
        expect(assignmentButtons(VENUE, ALEX, ALEX, TWO)).toEqual([
            { text: "Gira a Lorenzo", callback_data: encodeAssign(VENUE, LORENZO) }
        ]);
    });

    it("l'altro vede «Lo prendo io», che assegna a sé", () => {
        expect(assignmentButtons(VENUE, ALEX, LORENZO, TWO)).toEqual([
            { text: "Lo prendo io", callback_data: encodeAssign(VENUE, LORENZO) }
        ]);
    });

    it("dopo il passaggio i pulsanti si invertono", () => {
        expect(assignmentButtons(VENUE, LORENZO, ALEX, TWO)[0].text).toBe("Lo prendo io");
        expect(assignmentButtons(VENUE, LORENZO, LORENZO, TWO)[0].text).toBe("Gira a Alex");
    });

    it("lead non assegnato: tutti vedono «Lo prendo io»", () => {
        expect(assignmentButtons(VENUE, null, ALEX, TWO)[0].text).toBe("Lo prendo io");
    });

    it("con più di due persone «Gira a…» apre la scelta tra i nomi", () => {
        expect(assignmentButtons(VENUE, ALEX, ALEX, THREE)).toEqual([
            { text: "Gira a…", callback_data: `g:${uuidToShort(VENUE)}` }
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
            data({ kind: "returned", stoppedBefore: true, whatsappUrl: "https://wa.example" }),
            ALEX,
            TWO
        );
        expect(msg.text).toContain("Aveva chiesto di non essere contattato");
        const texts = msg.reply_markup.inline_keyboard.flat().map(b => b.text);
        expect(texts).not.toContain("Scrivi su WhatsApp");
        expect(texts).toContain("Apri nel CRM");
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
