import { afterEach, describe, expect, it } from "vitest";
import { NEW_MODEL } from "@/pages/Dashboard/Programming/calendar/calendarFlags";
import { blankDraft, quandoScontro, scontriWait, type Draft, type Scontro } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { order, tie, why, type CalEntry, type CalSeat } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";

const seat: CalSeat = { activityId: "porto", groupIds: ["nord"] };
const menu = (id: string, o: { sede?: boolean; tscore?: number; priority?: number; created: number }): CalEntry => ({
    id,
    ruleId: id,
    kind: "menu",
    thing: id,
    where: o.sede ? { all: false, activityIds: ["porto"], groupIds: [] } : { all: true, activityIds: [], groupIds: [] },
    when: {},
    tscore: o.tscore ?? 2,
    priority: o.priority ?? 21,
    created: o.created,
    add: false,
    rule: {} as LayoutRule
});
const first = (...es: CalEntry[]) => es.slice().sort(order(seat))[0].id;
const where = (e: CalEntry) => (e.where.all ? "per tutte" : "per Porto");

describe("chi vince nel Calendario (D135 A)", () => {
    const keep = NEW_MODEL.newestWins;
    afterEach(() => void (NEW_MODEL.newestWins = keep));

    it("prima la sede e gli orari più stretti, comunque", () => {
        for (const on of [true, false]) {
            NEW_MODEL.newestWins = on;
            expect(first(menu("vecchio-sede", { sede: true, created: 1 }), menu("nuovo-tutte", { created: 2 }))).toBe("vecchio-sede");
            expect(first(menu("vecchio-fascia", { tscore: 2, created: 1 }), menu("nuovo-sempre", { tscore: 0, created: 2 }))).toBe("vecchio-fascia");
        }
    });

    it("a pari merito vince l'ultimo che hai messo, senza guardare la priorità", () => {
        NEW_MODEL.newestWins = true;
        const vecchio = menu("vecchio", { priority: 5, created: 1 }), nuovo = menu("nuovo", { priority: 30, created: 2 });
        expect(first(vecchio, nuovo)).toBe("nuovo");
        expect(tie(nuovo, vecchio, seat)).toBe(true);
        expect(why(nuovo, vecchio, seat, where)).toBe("è l'ultimo che hai messo");
    });

    it("finché il menù del cliente non cambia, il Calendario dice come va davvero: priorità, poi il più vecchio", () => {
        NEW_MODEL.newestWins = false;
        expect(first(menu("vecchio", { created: 1 }), menu("nuovo", { created: 2 }))).toBe("vecchio");
        expect(first(menu("vecchio", { priority: 30, created: 1 }), menu("nuovo", { priority: 10, created: 2 }))).toBe("nuovo");
        expect(why(menu("vecchio", { created: 1 }), menu("nuovo", { created: 2 }), seat, where)).toBe("c'era prima");
        expect(tie(menu("a", { sede: true, created: 1 }), menu("b", { created: 2 }), seat)).toBe(false);
    });
});

describe("l'avviso quando si accavalla (D135 A)", () => {
    const keep = { ...NEW_MODEL };
    afterEach(() => void Object.assign(NEW_MODEL, keep));
    const D = (o: Partial<Draft> = {}) => ({ ...blankDraft("menu", { all: true, activityIds: [], groupIds: [] }, null), ...o });
    const sc = (vince: boolean, pari: boolean): Scontro => ({ sedi: ["Porto"], con: "Menù pranzo", quando: "", vince, pari });

    it("dice i giorni e le ore a parole", () => {
        expect(quandoScontro([0, 1, 2, 3, 4].map(d => [d, 720, 840] as const))).toBe("dal lunedì al venerdì dalle 12 alle 14");
        expect(quandoScontro([[5, 690, 900]])).toBe("il sabato dalle 11:30 alle 15");
        expect(quandoScontro([0, 1, 2, 3, 4, 5, 6].map(d => [d, 720, 900] as const))).toBe("tutti i giorni dalle 12 alle 15");
    });

    it("prende il suo posto: si salva oggi se vince per sede o per orari, aspetta il database nuovo se vince solo perché è l'ultima", () => {
        NEW_MODEL.newestWins = true;
        expect(scontriWait(D(), [sc(true, false)])).toBe("");
        expect(scontriWait(D(), [sc(true, true)])).toMatch(/a pari merito: si salva col database nuovo/);
        expect(scontriWait(D({ insieme: true }), [sc(true, false)])).toMatch(/^Due menù insieme: si salva col database nuovo/);
        expect(scontriWait(D({ insieme: true }), [])).toBe("");
    });

    it("dove resta l'altro perché c'era prima (fuori da localhost) si salva lo stesso", () => {
        NEW_MODEL.newestWins = false;
        expect(scontriWait(D(), [sc(false, true)])).toBe("");
    });
});
