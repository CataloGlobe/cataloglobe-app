import { describe, expect, it } from "vitest";
import {
    GEA_MOVABLE_STAGES,
    agendaBounds,
    buildAnswerRequest,
    buildTodayText,
    buildUnderstandRequest,
    choosePerson,
    chooseVenue,
    diaryReason,
    needsConfirmation,
    confirmButtonLabels,
    confirmQuestionText,
    isStopLocked,
    moveConfirmText,
    moveNeedsConfirmation,
    stopLockedText,
    parseUnderstanding,
    refuseText,
    sourceLine,
    withSource
} from "./crmGea.ts";

const NOW = new Date("2026-10-05T08:30:00Z"); // lunedì, 10:30 a Roma

describe("capire: il JSON del modello passa dagli elenchi chiusi", () => {
    it("domande con strumento valido", () => {
        expect(parseUnderstanding('{"intent":"question","tool":"venue_card","venue":"Bar Uno"}')).toEqual({
            intent: "question", reads: [{ tool: "venue_card", venue: "Bar Uno" }]
        });
        expect(parseUnderstanding('Ecco: {"intent":"question","tool":"pipeline"} fine')).toEqual({ intent: "question", reads: [{ tool: "pipeline" }] });
        expect(parseUnderstanding('{"intent":"question","tool":"agenda","days":40}')).toEqual({ intent: "question", reads: [{ tool: "agenda", days: 31, offset: 0 }] });
        expect(parseUnderstanding('{"intent":"question","tool":"agenda"}')).toEqual({ intent: "question", reads: [{ tool: "agenda", days: 7, offset: 0 }] });
        expect(parseUnderstanding('{"intent":"question","tool":"stale","days":"0"}')).toEqual({ intent: "question", reads: [{ tool: "stale", days: 1 }] });
    });

    it("Gea 2: fino a 3 letture, doppioni tolti, oltre è invalid", () => {
        expect(
            parseUnderstanding(
                '{"intent":"question","reads":[{"tool":"agenda","days":7,"offset":-7,"person":"Lorenzo"},{"tool":"spend"},{"tool":"spend"}]}'
            )
        ).toEqual({ intent: "question", reads: [{ tool: "agenda", days: 7, offset: -7, person: "Lorenzo" }, { tool: "spend" }] });
        expect(parseUnderstanding('{"intent":"question","reads":[{"tool":"drafts"},{"tool":"diary"},{"tool":"guide"},{"tool":"pipeline"}]}')).toHaveProperty("invalid");
        expect(parseUnderstanding('{"intent":"question","reads":[{"tool":"drafts"},{"tool":"sql"}]}')).toHaveProperty("invalid");
        expect(parseUnderstanding('{"intent":"question","reads":[]}')).toHaveProperty("invalid");
        expect(parseUnderstanding('{"intent":"question","reads":[{"tool":"diary","days":30}]}')).toEqual({ intent: "question", reads: [{ tool: "diary", days: 7 }] });
    });

    it("Gea 2: scrivere un testo, con o senza locale", () => {
        expect(parseUnderstanding('{"intent":"write","brief":"messaggio di benvenuto","venue":"Bar Uno"}')).toEqual({
            intent: "write", brief: "messaggio di benvenuto", venue: "Bar Uno"
        });
        expect(parseUnderstanding('{"intent":"write","brief":"una mail breve"}')).toEqual({ intent: "write", brief: "una mail breve" });
        expect(parseUnderstanding('{"intent":"write","brief":""}')).toHaveProperty("invalid");
    });

    it("strumenti fuori elenco o senza argomenti: invalid", () => {
        expect(parseUnderstanding('{"intent":"question","tool":"sql","query":"drop table"}')).toHaveProperty("invalid");
        expect(parseUnderstanding('{"intent":"question","tool":"today"}')).toHaveProperty("invalid");
        expect(parseUnderstanding('{"intent":"question","tool":"venue_card","venue":"a"}')).toHaveProperty("invalid");
        expect(parseUnderstanding("niente json")).toHaveProperty("invalid");
        expect(parseUnderstanding('{"intent":"delete_all"}')).toHaveProperty("invalid");
    });

    it("comandi del gruppo 1 e 2", () => {
        expect(parseUnderstanding('{"intent":"command","command":{"name":"add_note","venue":"Bar Uno","text":"Richiamare"}}')).toEqual({
            intent: "command", command: { name: "add_note", venue: "Bar Uno", text: "Richiamare" }
        });
        expect(parseUnderstanding('{"intent":"command","command":{"name":"move_stage","venue":"Bar Uno","stage":"telefonata_fatta"}}')).toEqual({
            intent: "command", command: { name: "move_stage", venue: "Bar Uno", stage: "telefonata_fatta" }
        });
        expect(parseUnderstanding('{"intent":"command","command":{"name":"pause_agents"}}')).toEqual({
            intent: "command", command: { name: "pause_agents", reason: "Pausa chiesta a Gea." }
        });
        const resume = parseUnderstanding('{"intent":"command","command":{"name":"resume_agents"}}');
        expect(resume).toEqual({ intent: "command", command: { name: "resume_agents" } });
        expect(needsConfirmation({ name: "resume_agents" })).toBe(true);
        expect(confirmQuestionText({ name: "resume_agents" })).toBe(
            "Riprendo gli agenti? Da subito possono tornare a scrivere ai lead, con le stesse regole di prima: le bozze arrivano qui da approvare."
        );
        expect(confirmQuestionText({ name: "resume_agents" }, true)).toContain("partono da soli");
        expect(confirmQuestionText({ name: "resume_agents" }, true)).not.toContain("le bozze arrivano qui da approvare");
        expect(confirmButtonLabels({ name: "resume_agents" })).toEqual({ yes: "Sì, riprendi gli agenti", no: "No, lascia in pausa" });
        expect(confirmButtonLabels(null)).toEqual({ yes: "Sì, fallo", no: "No" });
        expect(needsConfirmation({ name: "pause_agents", reason: "x" })).toBe(false);
        expect(needsConfirmation({ name: "add_note", venue: "x", text: "y" })).toBe(false);
    });

    it("Perso e fasi inventate non passano", () => {
        expect(GEA_MOVABLE_STAGES).not.toContain("perso");
        expect(parseUnderstanding('{"intent":"command","command":{"name":"move_stage","venue":"Bar Uno","stage":"perso"}}')).toMatchObject({ intent: "refuse" });
        expect(parseUnderstanding('{"intent":"command","command":{"name":"move_stage","venue":"Bar Uno","stage":"vinto"}}')).toHaveProperty("invalid");
        expect(parseUnderstanding('{"intent":"command","command":{"name":"delete_venue","venue":"Bar Uno"}}')).toHaveProperty("invalid");
    });

    it("rifiuti, messaggi ai lead, chiacchiera", () => {
        expect(parseUnderstanding('{"intent":"refuse","reason":"rimborso"}')).toEqual({ intent: "refuse", reason: "rimborso" });
        expect(parseUnderstanding('{"intent":"message_lead"}')).toEqual({ intent: "message_lead" });
        expect(parseUnderstanding('{"intent":"other","reply":"Ciao!"}')).toEqual({ intent: "other", reply: "Ciao!" });
        expect(parseUnderstanding('{"intent":"other","reply":""}')).toHaveProperty("invalid");
        expect(refuseText("riguarda i soldi.")).toBe(
            "Questo non lo faccio: riguarda i soldi. Soldi, cancellazioni, chiavi e accessi restano a voi, da /admin."
        );
    });

    it("il testo della persona sta tra delimitatori, tagliato", () => {
        const req = buildUnderstandRequest({ text: "x".repeat(5000), askerName: "Alessandro", teamNames: ["Alessandro", "Lorenzo"], now: NOW });
        const content = req.messages[0].content;
        expect(content).toContain("<messaggio>");
        expect(content).toContain("Scrive Alessandro");
        expect(content.length).toBeLessThan(2200);
        expect(req.system[0]).toContain("Lorenzo");
        expect(req.system[0]).not.toContain("—");
    });
});

describe("scelte senza Claude", () => {
    const m = (name: string, city: string | null = null) => ({ id: name, name, city, stage: "nuovo", assigned_to: null });

    it("locale: uno solo, nome uguale tra tanti, oppure chiede", () => {
        expect(chooseVenue([], "bar")).toEqual({ none: true });
        expect(chooseVenue([m("Bar Uno")], "bar")).toEqual({ venue: m("Bar Uno") });
        expect(chooseVenue([m("Bar Uno"), m("Bar Due")], "bar due")).toEqual({ venue: m("Bar Due") });
        expect(chooseVenue([m("Caffè"), m("Caffè Nero")], "caffe")).toEqual({ venue: m("Caffè") });
        expect(chooseVenue([m("Bar Uno"), m("Bar Due")], "bar")).toEqual({ many: [m("Bar Uno"), m("Bar Due")] });
    });

    it("persona: nome intero o inizio, mai ambiguo", () => {
        const team = [{ display_name: "Alessandro" }, { display_name: "Lorenzo" }];
        expect(choosePerson(team, "lorenzo")).toEqual(team[1]);
        expect(choosePerson(team, "Ale")).toEqual(team[0]);
        expect(choosePerson(team, "Marco")).toBeNull();
        expect(choosePerson([{ display_name: "Luca" }, { display_name: "Lucia" }], "Luc")).toBeNull();
        expect(choosePerson(team, " ")).toBeNull();
    });

    it("agenda: dalla mezzanotte di Roma, anche al cambio dell'ora", () => {
        expect(agendaBounds(NOW, 1)).toEqual({ from: new Date("2026-10-04T22:00:00Z"), to: new Date("2026-10-05T22:00:00Z") });
        // 25 ottobre 2026: si torna all'ora solare.
        const b = agendaBounds(new Date("2026-10-24T10:00:00Z"), 2);
        expect(b.from).toEqual(new Date("2026-10-23T22:00:00Z"));
        expect(b.to).toEqual(new Date("2026-10-25T23:00:00Z"));
        // Fine mese.
        expect(agendaBounds(new Date("2026-10-31T10:00:00Z"), 1).to).toEqual(new Date("2026-10-31T23:00:00Z"));
    });
});

describe("risposte", () => {
    it("la fonte la scrive il server, e il trattino lungo sparisce", () => {
        expect(sourceLine("venue_card", NOW, "Bar Uno")).toBe("Fonte: CRM, scheda del locale (Bar Uno), letta alle 10:30.");
        expect(withSource("Bar Uno — in prova.", "pipeline", NOW)).toBe(
            "Bar Uno, in prova.\n\nFonte: CRM, conteggi della pipeline, letta alle 10:30."
        );
    });

    it("domanda e dati tra delimitatori", () => {
        const req = buildAnswerRequest({ question: "Com'è messo Bar Uno?", reads: [{ tool: "venue_card", data: { name: "Bar Uno" } }], now: NOW });
        expect(req.messages[0].content).toContain('<dati strumento="venue_card">');
        expect(req.messages[0].content).toContain("<domanda>");
        expect(req.system[0]).toContain("Dal CRM non lo so");
    });

    it("oggi: telefonate, bozze, nuovi, fermi, pausa, spesa", () => {
        const text = buildTodayText(
            {
                calls_today: [
                    { starts_at: "2026-10-05T07:30:00Z", status: "confirmed", venue: "Bar Uno", caller: "Lorenzo" },
                    { starts_at: "2026-10-05T15:30:00Z", status: "proposed", venue: "Tre", caller: "Alessandro" },
                    { starts_at: "2026-10-05T16:00:00Z", status: "cancelled", venue: "Annullata", caller: null }
                ],
                drafts_pending: [{ venue: "Due", kind: "reply" }],
                new_not_contacted: [{ venue: "Nuovo", city: "Roma" }],
                stale: [{ name: "Fermo", stage: "in_conversazione", last_activity_at: "2026-10-01T10:00:00Z" }],
                brake_on: true,
                ai_spend_today_usd: "0.4321"
            },
            NOW
        );
        expect(text).toContain("Telefonate (2):\n• 09:30 Bar Uno, chiama Lorenzo\n• 17:30 Tre, chiama Alessandro (da confermare)");
        expect(text).not.toContain("Annullata");
        expect(text).toContain("Bozze che aspettano un tocco (1):\n• Due");
        expect(text).toContain("• Nuovo, Roma");
        expect(text).toContain("• Fermo (In conversazione)");
        expect(text).toContain("Agenti in pausa.");
        expect(text).toContain("Spesa AI di oggi: 0,43 $.");
    });

    it("oggi vuoto e lunghe liste", () => {
        const text = buildTodayText(
            {
                calls_today: [],
                drafts_pending: [],
                new_not_contacted: Array.from({ length: 7 }, (_, i) => ({ venue: `L${i}`, city: null })),
                stale: [],
                brake_on: false,
                ai_spend_today_usd: 0
            },
            NOW
        );
        expect(text).toContain("Telefonate: nessuna.");
        expect(text).toContain("• e altri 2");
        expect(text).not.toContain("Bozze");
        expect(text).not.toContain("pausa");
    });

    it("diario in una riga", () => {
        expect(diaryReason({ name: "assign", venue: "x", person: "y" }, "Alessandro", "Bar Uno", "Lorenzo")).toBe(
            "Bar Uno girato a Lorenzo, chiesto da Alessandro."
        );
        expect(diaryReason({ name: "pause_agents", reason: "x".repeat(600) }, "Alessandro").length).toBeLessThanOrEqual(500);
    });
});

describe("stop", () => {
    it("Gea non toglie uno stop spostando il locale", () => {
        expect(isStopLocked({ stage: "perso", lost_kind: "stop" }, "contattato")).toBe(true);
        expect(isStopLocked({ stage: "perso", lost_kind: "stop" }, "perso")).toBe(false);
        expect(isStopLocked({ stage: "perso", lost_kind: "obiezione" }, "contattato")).toBe(false);
        expect(isStopLocked({ stage: "contattato", lost_kind: null }, "demo")).toBe(false);
        expect(stopLockedText("Bar Roma")).toContain("dalla scheda");
    });
});

describe("spostamenti con conferma", () => {
    it("uscita da Perso e ingresso in Cliente chiedono il tasto", () => {
        expect(moveNeedsConfirmation({ stage: "perso" }, "contattato")).toBe(true);
        expect(moveNeedsConfirmation({ stage: "demo_fissata" }, "cliente_pagante")).toBe(true);
        expect(moveNeedsConfirmation({ stage: "perso" }, "cliente_pagante")).toBe(true);
    });

    it("gli altri spostamenti restano immediati", () => {
        expect(moveNeedsConfirmation({ stage: "contattato" }, "in_conversazione")).toBe(false);
        expect(moveNeedsConfirmation({ stage: "cliente_pagante" }, "cliente_pagante")).toBe(false);
        expect(moveNeedsConfirmation({ stage: "perso" }, "perso")).toBe(false);
        expect(moveNeedsConfirmation(null, "cliente_pagante")).toBe(false);
    });

    it("domanda e tasti", () => {
        expect(moveConfirmText("Bar Roma", "perso", "contattato")).toBe(
            "Sposto Bar Roma da Perso a Contattato? Esce da Perso: gli agenti possono tornare a scrivergli."
        );
        expect(moveConfirmText("Bar Roma", "demo_fissata", "cliente_pagante")).toMatch(/^Sposto Bar Roma da .+ a Cliente pagante\?$/);
        expect(confirmButtonLabels({ name: "move_stage", venue: "Bar Roma", stage: "cliente_pagante" })).toEqual({
            yes: "Sì, spostalo",
            no: "No, lascialo dov'è"
        });
    });
});
