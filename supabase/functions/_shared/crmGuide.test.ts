import { describe, expect, it } from "vitest";
import {
    CRM_GUIDE,
    CRM_MESSAGE_STEPS,
    formatWait,
    guideForGea,
    guideTopic,
    guideTopicsOf,
    waitLevel,
    workingMinutesBetween
} from "./crmGuide";
import { CRM_STAGE_LABEL } from "./crmLabels";
import { CRM_AI_ROLE_LABEL } from "./crmAi";

describe("CRM_GUIDE", () => {
    it("id unici", () => {
        const ids = CRM_GUIDE.map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("una voce per ogni fase della pipeline, con la stessa etichetta", () => {
        for (const [key, label] of Object.entries(CRM_STAGE_LABEL)) {
            expect(guideTopic(key)?.kind).toBe("fase");
            expect(guideTopic(key)?.title).toBe(label);
        }
        expect(guideTopicsOf("fase")).toHaveLength(Object.keys(CRM_STAGE_LABEL).length);
    });

    it("i ruoli AI hanno una voce col loro nome", () => {
        const titles = guideTopicsOf("agente").map(t => t.title);
        for (const label of Object.values(CRM_AI_ROLE_LABEL)) {
            expect(titles).toContain(label);
        }
    });

    it("niente trattino lungo nei testi", () => {
        for (const t of CRM_GUIDE) {
            expect(`${t.title} ${t.short} ${t.body} ${t.example ?? ""}`).not.toContain("—");
        }
    });

    it("i passi del giro nominano solo voci della guida o persone", () => {
        for (const s of CRM_MESSAGE_STEPS) {
            for (const who of s.who) {
                if (who !== "persone") expect(guideTopic(who)).toBeDefined();
            }
        }
    });
});

describe("guideForGea", () => {
    it("ha tutte le sezioni e resta corta per il prompt", () => {
        const text = guideForGea();
        expect(text).toContain("Agenti\n- Conversazione:");
        expect(text).toContain("Fasi della pipeline");
        expect(text).toContain("Colori di ciò che aspetta");
        expect(text.length).toBeLessThan(9000);
    });
});

describe("workingMinutesBetween", () => {
    // Lunedì 5 ottobre 2026, ora legale: Roma = UTC+2
    it("dentro la fascia conta i minuti veri", () => {
        expect(workingMinutesBetween(new Date("2026-10-05T08:00:00Z"), new Date("2026-10-05T08:45:00Z"))).toBe(45);
    });

    it("la notte non conta", () => {
        // lunedì 19:30 → martedì 9:15 di Roma: 30 + 15
        expect(workingMinutesBetween(new Date("2026-10-05T17:30:00Z"), new Date("2026-10-06T07:15:00Z"))).toBe(45);
    });

    it("la domenica non conta", () => {
        // sabato 19:00 → lunedì 8:00 di Roma: solo l'ora di sabato
        expect(workingMinutesBetween(new Date("2026-10-03T17:00:00Z"), new Date("2026-10-05T06:00:00Z"))).toBe(60);
    });

    it("al cambio dell'ora (25 ottobre) resta giusto", () => {
        // sabato 24 19:00 (UTC+2) → lunedì 26 10:00 (UTC+1): 60 + 60
        expect(workingMinutesBetween(new Date("2026-10-24T17:00:00Z"), new Date("2026-10-26T09:00:00Z"))).toBe(120);
    });

    it("zero se la fine non è dopo l'inizio", () => {
        const d = new Date("2026-10-05T08:00:00Z");
        expect(workingMinutesBetween(d, d)).toBe(0);
    });
});

describe("waitLevel e formatWait", () => {
    it("soglie 30 minuti e 2 ore", () => {
        expect(waitLevel(29)).toBe("normale");
        expect(waitLevel(30)).toBe("arancio");
        expect(waitLevel(119)).toBe("arancio");
        expect(waitLevel(120)).toBe("rosso");
    });

    it("formato unico", () => {
        expect(formatWait(5)).toBe("5 min");
        expect(formatWait(60)).toBe("1 ora");
        expect(formatWait(150)).toBe("2 ore");
        expect(formatWait(10 * 60 + 59)).toBe("10 ore");
        // Tre giorni di lavoro fermi: «3 gg», non «33 ore».
        expect(formatWait(3 * 660 + 10)).toBe("3 gg");
    });
});
