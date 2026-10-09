import { afterEach, describe, expect, it } from "vitest";
import { NEW_MODEL } from "@/pages/Dashboard/Programming/calendar/calendarFlags";
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
