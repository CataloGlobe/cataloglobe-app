import { describe, expect, it } from "vitest";
import {
    buildDraftClosedText,
    draftOutcomeLabel,
    reactivationReason,
    buildDraftMessage,
    buildEditPromptText,
    buildRemindersText,
    cleanEditText,
    remindersDue,
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
            "discard"
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
    it("proposta di Perso: sì, no, scrivo io", () => {
        expect(decisions({ ...base, kind: "lost_proposal", proposedText: null })).toEqual(["lost", "discard", "handle"]);
    });
    it("riattivazione: come una bozza", () => {
        expect(decisions({ ...base, kind: "reactivation" })).toEqual(["send", "edit", "discard", "handle"]);
        expect(buildDraftMessage({ ...base, kind: "reactivation" }, null).text).toContain("🌱 Riproviamo con");
    });
    it("Perso e riattivazione: testi", () => {
        const lost = buildDraftMessage({ ...base, kind: "lost_proposal", proposedText: null, reason: "10 solleciti senza risposta." }, null);
        expect(lost.text).toContain("non risponde da 10 solleciti. Lo mettiamo in Perso?");
        expect(lost.text).toContain("In Perso l'agente smette di scrivergli. Se ricompila il modulo, vi arriva un avviso.");
        expect(lost.text).not.toContain("Perché:");
        expect(lost.reply_markup.inline_keyboard.flat().map(b => b.text).slice(0, 3)).toEqual([
            "Sì, mettilo in Perso",
            "No, lascialo aperto",
            "Scrivo io al lead"
        ]);
        expect(draftOutcomeLabel("handled", "Messo in Perso.")).toContain("messo in Perso");
        const now = new Date("2026-10-04T10:00:00Z");
        expect(reactivationReason({ body: "Ora no, magari dopo l'estate", createdAt: "2026-05-20T10:00:00Z" }, "2026-06-01T10:00:00Z", now)).toBe(
            "A maggio aveva detto «Ora no, magari dopo l'estate». È in Perso da 4 mesi."
        );
        expect(reactivationReason({ body: "No", createdAt: "2026-04-02T10:00:00Z" }, "2026-09-01T10:00:00Z", now)).toBe(
            "Ad aprile aveva detto «No». È in Perso da un mese."
        );
        expect(reactivationReason(null, "2026-06-01T10:00:00Z", now)).toBe("È in Perso da 4 mesi.");
    });
});

describe("F1-7", () => {
    it("partita da sola: «Non andava bene, torna in prova» e chat WhatsApp", async () => {
        const { buildAutoSentMessage, buildTrustReadyText } = await import("./crmAgentMessages");
        const m = buildAutoSentMessage(base, null);
        expect(m.text).toContain("🤖 Ho risposto da solo a");
        expect(m.text).toContain("le risposte tornano in prova e ti chiedo l'ok finché non ne approvi 3 di fila");
        const data = m.reply_markup.inline_keyboard.flat().map(b => (b.callback_data ? parseCallbackData(b.callback_data) : null));
        expect(data).toEqual([{ action: "draft", draftId: D, decision: "wrong" }]);
        expect(m.reply_markup.inline_keyboard[0][0].text).toBe("Non andava bene, torna in prova");
        const w = buildAutoSentMessage({ ...base, kind: "follow_up" }, "https://app.x", "https://wa.x/1");
        expect(w.text).toContain("Ho mandato da solo un sollecito");
        expect(w.reply_markup.inline_keyboard.map(r => r[0].text)).toEqual([
            "Non andava bene, torna in prova",
            "Apri la chat su WhatsApp",
            "Apri la scheda"
        ]);
        expect(buildTrustReadyText("reply", 5, false)).toContain("L'autonomia è spenta");
        expect(buildTrustReadyText("follow_up", 3, true)).toContain("I solleciti escono dalla prova");
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
        const t = buildDraftMessage({ ...base, kind: "schedule", proposedStartsAt: "2026-10-08T07:15:00Z", proposedText: "Testo vecchio" }, null).text;
        expect(t).toContain("parte il messaggio fisso di conferma");
        expect(t).not.toContain("Testo vecchio");
    });
    it("follow-up col numero, richiesta col perché", () => {
        expect(buildDraftMessage({ ...base, kind: "follow_up", followUpNumber: 3 }, null).text).toContain("Sollecito n. 3");
        expect(buildDraftMessage({ ...base, kind: "ask", reason: "Chiede uno sconto" }, null).text).toContain("Perché: Chiede uno sconto");
    });
    it("chiusa, sollecito, richiesta di correzione", () => {
        expect(buildDraftClosedText(base, "sent", "Lorenzo")).toContain("➡️ inviata così (Lorenzo)");
        expect(buildDraftClosedText(base, "expired", null)).toContain("scaduta");
        expect(buildRemindersText([{ info: base, minutes: 10 }])).toBe("⏰ Ancora in attesa da 10 minuti: bozza per Bar <Roma>.");
        expect(buildRemindersText([{ info: { ...base, kind: "lost_proposal" }, minutes: 30 }])).toContain("proposta di Perso per");
        expect(buildEditPromptText(base)).toContain("rispondendo a questo messaggio");
    });
    it("dubbio stop: cita il lead e chiude con l'esito vero", () => {
        const info = {
            ...base,
            kind: "stop_check" as const,
            proposedText: null,
            lastMessages: [{ from: "lead" as const, text: "Per ora no grazie" }]
        };
        const text = buildDraftMessage(info, null).text;
        expect(text).toContain("✋ Ho un dubbio su");
        expect(text).toContain("ha scritto: «Per ora no grazie»");
        expect(text).toContain("o un <b>«non adesso»</b>");
        expect(draftOutcomeLabel("handled", "È uno stop.")).toContain("messo in Perso");
        expect(draftOutcomeLabel("handled", "Obiezione, non stop.")).toContain("«non adesso»");
        expect(draftOutcomeLabel("handled", null)).toContain("ci pensa una persona");
        expect(draftOutcomeLabel("discarded", null, "lost_proposal")).toContain("resta aperto");
        expect(draftOutcomeLabel("discarded", null, "reply")).toBe("non mandata");
        expect(buildDraftClosedText({ ...info, reason: "È uno stop." }, "handled", "Alex")).toContain("messo in Perso");
    });
    it("chat lunga: in un riquadro apribile, dopo la proposta", () => {
        const lastMessages = Array.from({ length: 15 }, (_, i) => ({ from: i % 2 ? "noi" : "lead", text: `messaggio ${i}` }) as const);
        const text = buildDraftMessage({ ...base, kind: "bot_question", lastMessages }, null).text;
        expect(text).toContain("ultimi 15 messaggi (tocca per aprirla)");
        expect(text).toMatch(/<blockquote expandable>Lead: messaggio 0\n[\s\S]*Noi: messaggio 13\nLead: messaggio 14<\/blockquote>/);
        expect(text.indexOf("<b>Proposta</b>")).toBeLessThan(text.indexOf("<blockquote"));
    });
    it("chat corta: resta in chiaro", () => {
        expect(buildDraftMessage(base, null).text).not.toContain("blockquote");
    });
    it("mai oltre il limite di Telegram: cadono i messaggi più vecchi", () => {
        const lastMessages = Array.from({ length: 15 }, (_, i) => ({ from: "lead", text: `${i}:${"é&<".repeat(200)}` }) as const);
        const text = buildDraftMessage({ ...base, kind: "bot_question", proposedText: "x".repeat(1000), lastMessages }, null).text;
        expect(text.length).toBeLessThanOrEqual(4000);
        expect(text).toContain("Lead: 14:");
        expect(text).not.toContain("Lead: 0:");
    });
    it("sollecito di più bozze: un messaggio solo", () => {
        const text = buildRemindersText([
            { info: base, minutes: 30 },
            { info: { ...base, venueName: "Pizzeria Due", kind: "stop_check" }, minutes: 125 }
        ]);
        expect(text).toBe(
            "⏰ 2 bozze aspettano da voi (le trovate più su in questa chat):\n• Bar <Roma>: bozza, da 30 minuti\n• Pizzeria Due: dubbio, stop o «non adesso», da più di 2 ore"
        );
    });
    it("solleciti a 10, 30, 60 e 120 minuti; dopo la notte uno solo", () => {
        const at = (min: number) => new Date(Date.parse("2026-10-05T08:00:00Z") + min * 60_000);
        const steps = [10, 30, 60, 120];
        const n = "2026-10-05T08:00:00Z";
        expect(remindersDue(n, 0, at(9), steps)).toBe(0);
        expect(remindersDue(n, 0, at(10), steps)).toBe(1);
        expect(remindersDue(n, 1, at(29), steps)).toBe(1);
        expect(remindersDue(n, 1, at(30), steps)).toBe(2);
        expect(remindersDue(n, 0, at(400), steps)).toBe(4);
        expect(remindersDue(n, 4, at(9999), steps)).toBe(4);
    });
    it("testo corretto", () => {
        expect(cleanEditText("  Ciao!\r\n  ")).toBe("Ciao!");
        expect(cleanEditText("")).toBeNull();
        expect(cleanEditText("x".repeat(1001))).toBeNull();
    });
});
