import { describe, expect, it } from "vitest";
import { buildWeeklyEmail, formatChange } from "./crmWeeklyEmail";

const empty = { leads_in: 0, contacted: 0, stages: {}, lost: {}, first_contact_minutes_median: null, leads_by_source: {} };

describe("mail settimanale", () => {
    it("differenze", () => {
        expect(formatChange(5, 3)).toBe("+2");
        expect(formatChange(3, 5)).toBe("-2");
        expect(formatChange(4, 4)).toBe("=");
    });

    it("oggetto, righe e fonti", () => {
        const mail = buildWeeklyEmail({
            current: {
                leads_in: 7,
                contacted: 6,
                stages: { telefonata_fissata: 3, telefonata_fatta: 2 },
                lost: { stop: 1, obiezione: 2 },
                first_contact_minutes_median: 4.5,
                leads_by_source: { meta_form: 5, landing: 2 }
            },
            previous: { ...empty, leads_in: 4, stages: { telefonata_fatta: 2 } },
            weekLabel: "dal 28 settembre al 4 ottobre",
            summaryUrl: "https://app.x/admin/lead?vista=riepilogo"
        });
        expect(mail.subject).toBe("CRM, la settimana dal 28 settembre al 4 ottobre: 7 lead, 2 telefonate fatte");
        expect(mail.text).toContain("Lead entrati: 7 (+3)");
        expect(mail.text).toContain("Telefonate fatte: 2 (=)");
        expect(mail.text).toContain("Persi: 3 (2 per obiezione, 1 stop)");
        expect(mail.text).toContain("Primo contatto, mediana: 5 minuti");
        expect(mail.text).toContain("Fonti: Modulo Meta 5, Landing 2");
        expect(mail.html).toContain('<a href="https://app.x/admin/lead?vista=riepilogo">');
        expect(mail.text).not.toMatch(/—/);
    });

    it("settimana vuota", () => {
        const mail = buildWeeklyEmail({ current: empty, previous: empty, weekLabel: "x", summaryUrl: null });
        expect(mail.text).toContain("Fonti: nessun lead");
        expect(mail.text).toContain("nessun primo contatto");
        expect(mail.html).not.toContain("<a ");
    });
});

describe("settimana appena finita", () => {
    it("lunedì mattina: da lunedì a lunedì, ora di Roma", async () => {
        const { lastWeekBounds } = await import("./crmWeeklyEmail");
        const w = lastWeekBounds(new Date("2026-10-05T06:00:00Z")); // lunedì 5, 8:00 Roma
        expect(w.from.toISOString()).toBe("2026-09-27T22:00:00.000Z");
        expect(w.to.toISOString()).toBe("2026-10-04T22:00:00.000Z");
        expect(w.previousFrom.toISOString()).toBe("2026-09-20T22:00:00.000Z");
        expect(w.key).toBe("2026-09-28");
        expect(w.label).toBe("dal 28 settembre al 4 ottobre");
    });

    it("a cavallo del cambio dell'ora", async () => {
        const { lastWeekBounds } = await import("./crmWeeklyEmail");
        const w = lastWeekBounds(new Date("2026-10-26T07:00:00Z"));
        expect(w.from.toISOString()).toBe("2026-10-18T22:00:00.000Z");
        expect(w.to.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    });
});
