import { describe, expect, it } from "vitest";
import {
    buildDraftClosedText,
    buildDraftMessage,
    buildEditPromptText,
    buildReminderText,
    cleanEditText,
    type AgentDraftInfo
} from "./crmAgentMessages";
import { encodeDraftDecision, parseCallbackData } from "./crmTelegram";

const D = "6c1f0a2b-3d4e-4f50-8a9b-0c1d2e3f4a5b";
const base: AgentDraftInfo = {
    draftId: D,
    venueId: "11111111-2222-4333-8444-555555555555",
    kind: "reply",
    venueName: "Bar <Roma>",
    contactName: "Mario",
    proposedText: "Ciao Mario, giovedì alle 9:15 ti va?",
    reason: null,
    proposedStartsAt: null,
    followUpNumber: null,
    lastMessages: [{ from: "lead", text: "Quanto costa?" }]
};

const decisions = (info: AgentDraftInfo) =>
    buildDraftMessage(info, null)
        .reply_markup.inline_keyboard.flat()
        .map(b => (b.callback_data ? parseCallbackData(b.callback_data) : null))
        .filter(Boolean)
        .map(p => (p as { decision: string }).decision);

describe("tasti per tipo", () => {
    it("bozza con testo: invia, correggi, non mandare, lo gestisco io", () => {
        expect(decisions(base)).toEqual(["send", "edit", "discard", "handle"]);
    });
    it("richiesta senza testo: niente «Invia così»", () => {
        expect(decisions({ ...base, kind: "ask", proposedText: null, reason: "Chiede uno sconto" })).toEqual([
            "edit",
            "discard",
            "handle"
        ]);
    });
    it("orario accettato", () => {
        expect(decisions({ ...base, kind: "schedule", proposedStartsAt: "2026-10-08T07:15:00Z" })).toEqual(["schedule", "other", "handle"]);
    });
    it("stop o obiezione", () => {
        expect(decisions({ ...base, kind: "stop_check", proposedText: null })).toEqual(["stop", "objection"]);
    });
    it("callback: andata e ritorno, sotto i 64 byte", () => {
        const data = encodeDraftDecision(D, "objection");
        expect(data.length).toBeLessThanOrEqual(64);
        expect(parseCallbackData(data)).toEqual({ action: "draft", draftId: D, decision: "objection" });
    });
});

describe("F1-6", () => {
    it("proposta di Perso: Metti in Perso, Non adesso, Lo gestisco io", () => {
        expect(decisions({ ...base, kind: "lost_proposal", proposedText: null })).toEqual(["lost", "discard", "handle"]);
    });
    it("riattivazione: come una bozza", () => {
        expect(decisions({ ...base, kind: "reactivation" })).toEqual(["send", "edit", "discard", "handle"]);
        expect(buildDraftMessage({ ...base, kind: "reactivation" }, null).text).toContain("Riattivare");
    });
});

describe("testi", () => {
    it("bozza: titolo, chat e proposta, testo protetto", () => {
        const m = buildDraftMessage(base, "https://app.x");
        expect(m.text).toContain("Bozza di risposta per <b>Bar &lt;Roma&gt;</b> (Mario)");
        expect(m.text).toContain("Lead: Quanto costa?");
        expect(m.text).toContain("<i>Ciao Mario, giovedì alle 9:15 ti va?</i>");
        expect(m.reply_markup.inline_keyboard.at(-1)?.[0].url).toContain("/admin/lead/");
    });
    it("orario accettato con il giorno", () => {
        expect(buildDraftMessage({ ...base, kind: "schedule", proposedStartsAt: "2026-10-08T07:15:00Z" }, null).text).toContain(
            "ha accettato giovedì 8 alle 09:15"
        );
    });
    it("follow-up col numero, richiesta col perché", () => {
        expect(buildDraftMessage({ ...base, kind: "follow_up", followUpNumber: 3 }, null).text).toContain("Follow-up n. 3");
        expect(buildDraftMessage({ ...base, kind: "ask", reason: "Chiede uno sconto" }, null).text).toContain("Perché: Chiede uno sconto");
    });
    it("chiusa, sollecito, richiesta di correzione", () => {
        expect(buildDraftClosedText(base, "sent", "Lorenzo")).toContain("➡️ inviata così (Lorenzo)");
        expect(buildDraftClosedText(base, "expired", null)).toContain("scaduta");
        expect(buildReminderText(base, 10)).toBe("⏰ Ancora in attesa da 10 minuti: bozza per Bar <Roma>.");
        expect(buildEditPromptText(base)).toContain("rispondendo a questo messaggio");
    });
    it("testo corretto", () => {
        expect(cleanEditText("  Ciao!\r\n  ")).toBe("Ciao!");
        expect(cleanEditText("")).toBeNull();
        expect(cleanEditText("x".repeat(1001))).toBeNull();
    });
});
