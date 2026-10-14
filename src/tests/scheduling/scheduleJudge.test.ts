import { describe, expect, it } from "vitest";
import {
    compareStacked,
    isJudgeRuleActiveAt,
    judge,
    laterMenusToday,
    resolveCompetition,
    type CompetitionRule,
    type JudgeRule,
    type JudgeSlot,
    type RomeDateTime
} from "@shared/scheduleCompetition";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";

// Giudice nuovo (piano 9b, passo 3): fasce, menù «insieme» / «al posto»,
// stile, regole che si sommano, «più tardi».

const SEAT_X = { activityId: "sede-x", groupIds: ["gruppo-nord"] };
const SEAT_Y = { activityId: "sede-y", groupIds: [] };

const at = (iso: string) => toRomeDateTime(new Date(iso));

function slot(input: Partial<JudgeSlot> & { start: number; end: number }): JudgeSlot {
    return {
        id: input.id ?? `fascia-${input.start}-${input.end}`,
        days_of_week: input.days_of_week ?? null,
        start_minute: input.start,
        end_minute: input.end,
        activityIds: input.activityIds ?? [],
        groupIds: input.groupIds ?? []
    };
}

function rule(input: Partial<JudgeRule> & { id: string }): JudgeRule {
    const created = input.created_at ?? "2026-01-01T00:00:00.000Z";
    return {
        id: input.id,
        rule_type: input.rule_type ?? "menu",
        enabled: input.enabled ?? true,
        priority: input.priority ?? 10,
        created_at: created,
        on_air_since: input.on_air_since ?? created,
        time_mode: input.time_mode ?? (input.slots?.length ? "window" : "always"),
        start_at: input.start_at ?? null,
        end_at: input.end_at ?? null,
        applyToAll: input.applyToAll ?? true,
        activityIds: input.activityIds ?? [],
        groupIds: input.groupIds ?? [],
        slots: input.slots ?? [],
        overlap_mode: input.overlap_mode ?? null,
        overlapByActivity: input.overlapByActivity,
        overlapByGroup: input.overlapByGroup,
        hasMenu: input.hasMenu,
        hasStyle: input.hasStyle
    };
}

const ids = (entries: Array<{ rule: { id: string } }>) => entries.map(entry => entry.rule.id);

// Giovedì 26/03/2026 13:00 a Roma (CET).
const THU_13 = at("2026-03-26T12:00:00.000Z");

describe("giudice nuovo — fasce (M1, M2)", () => {
    const friday19to02 = rule({ id: "notte", slots: [slot({ start: 19 * 60, end: 26 * 60, days_of_week: [5] })] });

    it("una fascia oltre la mezzanotte vale anche il giorno dopo fino alla fine", () => {
        // Sabato 28/03/2026 01:30 a Roma: la fascia è partita venerdì.
        expect(isJudgeRuleActiveAt(friday19to02, SEAT_X, at("2026-03-28T00:30:00.000Z"))).toBe(true);
        // Venerdì 27/03 01:30: la fascia di giovedì non c'è (solo venerdì).
        expect(isJudgeRuleActiveAt(friday19to02, SEAT_X, at("2026-03-27T00:30:00.000Z"))).toBe(false);
        // Sabato 02:00: fine esclusa.
        expect(isJudgeRuleActiveAt(friday19to02, SEAT_X, at("2026-03-28T01:00:00.000Z"))).toBe(false);
    });

    it("sabato 19:00-02:00 all'1:30 di domenica", () => {
        const saturday = rule({ id: "sab", slots: [slot({ start: 1140, end: 1560, days_of_week: [6] })] });
        // Domenica 29/03/2026 01:30 a Roma (ancora CET, il cambio è alle 02:00).
        expect(isJudgeRuleActiveAt(saturday, SEAT_X, at("2026-03-29T00:30:00.000Z"))).toBe(true);
        // Sabato 28/03 01:30: la fascia di venerdì non c'è.
        expect(isJudgeRuleActiveAt(saturday, SEAT_X, at("2026-03-28T00:30:00.000Z"))).toBe(false);
    });

    it("giorno del cambio d'ora: conta l'ora di Roma sull'orologio", () => {
        const morning = rule({ id: "mattina", slots: [slot({ start: 180, end: 240, days_of_week: [0] })] });
        // 29/03/2026: alle 02:00 si passa alle 03:00. 01:30Z = 03:30 CEST.
        expect(isJudgeRuleActiveAt(morning, SEAT_X, at("2026-03-29T01:30:00.000Z"))).toBe(true);
        // 25/10/2026: le 02:30 arrivano due volte; 23:30Z del 24 = 01:30 CEST, fuori.
        const night = rule({ id: "notte-ottobre", slots: [slot({ start: 150, end: 180, days_of_week: [0] })] });
        expect(isJudgeRuleActiveAt(night, SEAT_X, at("2026-10-25T00:30:00.000Z"))).toBe(true); // 02:30 CEST
        expect(isJudgeRuleActiveAt(night, SEAT_X, at("2026-10-25T01:30:00.000Z"))).toBe(true); // 02:30 CET
        expect(isJudgeRuleActiveAt(night, SEAT_X, at("2026-10-24T23:30:00.000Z"))).toBe(false);
    });

    it("una fascia con le sue sedi vale solo lì; una regola senza fasce per la sede qui non vale", () => {
        const onlyY = rule({ id: "solo-y", slots: [slot({ start: 0, end: 1440, activityIds: ["sede-y"] })] });
        expect(isJudgeRuleActiveAt(onlyY, SEAT_Y, THU_13)).toBe(true);
        expect(isJudgeRuleActiveAt(onlyY, SEAT_X, THU_13)).toBe(false);
        const byGroup = rule({ id: "gruppo", slots: [slot({ start: 0, end: 1440, groupIds: ["gruppo-nord"] })] });
        expect(isJudgeRuleActiveAt(byGroup, SEAT_X, THU_13)).toBe(true);
    });

    it("«Fascia» con inizio e senza fine non vale mai, come oggi", () => {
        const open = rule({
            id: "aperta",
            time_mode: "window",
            start_at: "2026-01-01T00:00:00.000Z",
            slots: [slot({ start: 0, end: 1440 })]
        });
        expect(isJudgeRuleActiveAt(open, SEAT_X, THU_13)).toBe(false);
    });

    it("giorni vuoti = mai", () => {
        const never = rule({ id: "mai", slots: [slot({ start: 0, end: 1440, days_of_week: [] })] });
        expect(isJudgeRuleActiveAt(never, SEAT_X, THU_13)).toBe(false);
    });
});

describe("giudice nuovo — menù (M5)", () => {
    it("due «insieme» si vedono tutti e due", () => {
        const a = rule({ id: "pranzo", overlap_mode: "together" });
        const b = rule({ id: "vini", overlap_mode: "together", on_air_since: "2026-02-01T00:00:00.000Z" });
        const v = judge([a, b], SEAT_X, THU_13);
        expect(ids(v.menus)).toEqual(["vini", "pranzo"]);
        expect(v.coveredMenus).toEqual([]);
    });

    it("un «al posto» copre gli «insieme»", () => {
        const together = rule({ id: "pranzo", overlap_mode: "together", on_air_since: "2026-03-01T00:00:00.000Z" });
        const replace = rule({ id: "natale", overlap_mode: "replace" });
        const v = judge([together, replace], SEAT_X, THU_13);
        expect(ids(v.menus)).toEqual(["natale"]);
        expect(ids(v.coveredMenus)).toEqual(["pranzo"]);
    });

    it("fra due «al posto» vale l'ultima scelta salvata (on_air_since)", () => {
        const older = rule({ id: "vecchia", overlap_mode: "replace", on_air_since: "2026-01-01T00:00:00.000Z" });
        const newer = rule({
            id: "nuova",
            overlap_mode: "replace",
            created_at: "2025-01-01T00:00:00.000Z",
            on_air_since: "2026-02-01T00:00:00.000Z"
        });
        expect(ids(judge([older, newer], SEAT_X, THU_13).menus)).toEqual(["nuova"]);
    });

    it("un menù senza scelta salvata parte da «insieme»", () => {
        const a = rule({ id: "a" });
        const b = rule({ id: "b" });
        expect(ids(judge([a, b], SEAT_X, THU_13).menus)).toHaveLength(2);
    });

    it("la scelta per sede vince su quella della regola (sede, poi gruppo)", () => {
        const a = rule({ id: "a", overlap_mode: "together" });
        const b = rule({
            id: "b",
            overlap_mode: "together",
            overlapByActivity: { "sede-x": "replace" },
            overlapByGroup: { "gruppo-nord": "together" }
        });
        expect(ids(judge([a, b], SEAT_X, THU_13).menus)).toEqual(["b"]);
        expect(ids(judge([a, b], SEAT_Y, THU_13).menus)).toHaveLength(2);
        const c = rule({ id: "c", overlap_mode: "together", overlapByGroup: { "gruppo-nord": "replace" } });
        expect(ids(judge([a, c], SEAT_X, THU_13).menus)).toEqual(["c"]);
    });

    it("le regole layout: ne vince una sola con l'ordine di oggi, e copre gli «insieme»", () => {
        const all = rule({ id: "tutte", rule_type: "layout", on_air_since: "2026-03-01T00:00:00.000Z" });
        const seat = rule({ id: "sede", rule_type: "layout", applyToAll: false, activityIds: ["sede-x"] });
        const together = rule({ id: "vini", overlap_mode: "together" });
        const v = judge([all, seat, together], SEAT_X, THU_13);
        // La più precisa per la sede vince anche se più vecchia (D83).
        expect(ids(v.menus)).toEqual(["sede"]);
        expect(ids(v.coveredMenus).sort()).toEqual(["tutte", "vini"]);
    });

    it("una layout senza menù non vince: passa la successiva", () => {
        const empty = rule({ id: "vuota", rule_type: "layout", applyToAll: false, activityIds: ["sede-x"], hasMenu: false });
        const all = rule({ id: "tutte", rule_type: "layout" });
        expect(ids(judge([empty, all], SEAT_X, THU_13).menus)).toEqual(["tutte"]);
    });

    it("una regola spenta o di un'altra sede non conta", () => {
        const off = rule({ id: "spenta", enabled: false });
        const other = rule({ id: "altra", applyToAll: false, activityIds: ["sede-y"] });
        expect(judge([off, other], SEAT_X, THU_13).menus).toEqual([]);
    });
});

describe("giudice nuovo — stile (M5)", () => {
    it("vince la «replace» più nuova; la layout vincente conta come «replace»", () => {
        const layout = rule({ id: "layout", rule_type: "layout", on_air_since: "2026-01-01T00:00:00.000Z" });
        const xmas = rule({ id: "natale", rule_type: "style", overlap_mode: "replace", on_air_since: "2026-02-01T00:00:00.000Z" });
        const v = judge([layout, xmas], SEAT_X, THU_13);
        expect(v.style?.rule.id).toBe("natale");
        expect(ids(v.coveredStyles)).toEqual(["layout"]);
    });

    it("senza «replace» resta la «keep» più vecchia", () => {
        const a = rule({ id: "a", rule_type: "style", overlap_mode: "keep", on_air_since: "2026-02-01T00:00:00.000Z" });
        const b = rule({ id: "b", rule_type: "style", overlap_mode: "keep", on_air_since: "2026-01-01T00:00:00.000Z" });
        expect(judge([a, b], SEAT_X, THU_13).style?.rule.id).toBe("b");
    });

    it("una «replace» più vecchia vince comunque su una «keep»", () => {
        const keep = rule({ id: "keep", rule_type: "style", overlap_mode: "keep", on_air_since: "2026-03-01T00:00:00.000Z" });
        const replace = rule({ id: "replace", rule_type: "style", overlap_mode: "replace" });
        expect(judge([keep, replace], SEAT_X, THU_13).style?.rule.id).toBe("replace");
    });

    it("la layout che perde non dà lo stile", () => {
        const winner = rule({ id: "vince", rule_type: "layout", applyToAll: false, activityIds: ["sede-x"] });
        const loser = rule({ id: "perde", rule_type: "layout", on_air_since: "2026-03-01T00:00:00.000Z" });
        expect(judge([winner, loser], SEAT_X, THU_13).style?.rule.id).toBe("vince");
    });
});

describe("giudice nuovo — prezzi, disponibilità, in evidenza si sommano (M6)", () => {
    it("valgono tutte le attive; per lo stesso piatto la più precisa, poi la più nuova", () => {
        const all = rule({ id: "tutte", rule_type: "price", on_air_since: "2026-03-01T00:00:00.000Z" });
        const seat = rule({ id: "sede", rule_type: "price", applyToAll: false, activityIds: ["sede-x"] });
        const allOlder = rule({ id: "tutte-vecchia", rule_type: "price" });
        const v = judge([all, seat, allOlder], SEAT_X, THU_13);
        expect(ids(v.price)).toEqual(["sede", "tutte", "tutte-vecchia"]);
    });

    it("a pari sede gli orari più stretti vengono prima (→ D87)", () => {
        const always = rule({ id: "sempre", rule_type: "visibility", on_air_since: "2026-03-01T00:00:00.000Z" });
        const lunch = rule({ id: "pranzo", rule_type: "visibility", slots: [slot({ start: 720, end: 900 })] });
        expect(ids(judge([always, lunch], SEAT_X, THU_13).visibility)).toEqual(["pranzo", "sempre"]);
    });

    it("in evidenza: tutte le attive, fuori fascia no", () => {
        const a = rule({ id: "a", rule_type: "featured" });
        const b = rule({ id: "b", rule_type: "featured", slots: [slot({ start: 1140, end: 1380 })] });
        expect(ids(judge([a, b], SEAT_X, THU_13).featured)).toEqual(["a"]);
    });

    it("compareStacked è un ordine totale (stesso risultato in qualunque ordine d'ingresso)", () => {
        const r = [
            rule({ id: "c", rule_type: "price" }),
            rule({ id: "a", rule_type: "price" }),
            rule({ id: "b", rule_type: "price" })
        ];
        const one = ids(judge(r, SEAT_X, THU_13).price);
        const two = ids(judge([...r].reverse(), SEAT_X, THU_13).price);
        expect(one).toEqual(two);
        expect(one).toEqual(["a", "b", "c"]);
        expect(compareStacked({ rule: r[0], specificity: 0 }, { rule: r[0], specificity: 0 })).toBe(0);
    });
});

describe("giudice nuovo — «più tardi» (scelta 1 del 2026-10-13)", () => {
    // Giovedì 26/03/2026 11:00 a Roma; l'istante di un minuto di oggi lo dà il test.
    const now = at("2026-03-26T10:00:00.000Z");
    const instantAt = (minute: number): RomeDateTime => ({
        ...now,
        epoch: now.epoch + (minute - (now.hour * 60 + now.minute)) * 60_000,
        hour: Math.floor(minute / 60),
        minute: minute % 60,
        second: 0
    });

    it("i menù di oggi dopo adesso, con la prima ora in cui si vedono", () => {
        const breakfast = rule({ id: "colazione", slots: [slot({ start: 420, end: 690 })] });
        const lunch = rule({ id: "pranzo", slots: [slot({ start: 720, end: 900 })] });
        const dinner = rule({ id: "cena", slots: [slot({ start: 1140, end: 1500 })] });
        const later = laterMenusToday([breakfast, lunch, dinner], SEAT_X, now, instantAt);
        expect(later.map(l => [l.entry.rule.id, l.startMinute, l.endMinute])).toEqual([
            ["pranzo", 720, 900],
            ["cena", 1140, 1500]
        ]);
    });

    it("solo ciò che il giudice mostrerà davvero: un «insieme» coperto non c'è", () => {
        const wine = rule({ id: "vini", overlap_mode: "together", slots: [slot({ start: 1140, end: 1380 })] });
        const xmas = rule({ id: "natale", overlap_mode: "replace", slots: [slot({ start: 1080, end: 1440 })] });
        const later = laterMenusToday([wine, xmas], SEAT_X, now, instantAt);
        expect(later.map(l => l.entry.rule.id)).toEqual(["natale"]);
    });

    it("un menù che si vede adesso non è fra quelli di più tardi", () => {
        const always = rule({ id: "sempre" });
        const evening = rule({ id: "sera", slots: [slot({ start: 1140, end: 1380 })] });
        const later = laterMenusToday([always, evening], SEAT_X, now, instantAt);
        expect(later.map(l => l.entry.rule.id)).toEqual(["sera"]);
    });

    it("un menù coperto per un tratto si vede dal momento in cui il giudice lo mostra", () => {
        const wine = rule({ id: "vini", overlap_mode: "together", slots: [slot({ start: 1080, end: 1380 })] });
        const happy = rule({ id: "aperitivo", overlap_mode: "replace", slots: [slot({ start: 1080, end: 1200 })] });
        const later = laterMenusToday([wine, happy], SEAT_X, now, instantAt);
        expect(later.map(l => [l.entry.rule.id, l.startMinute, l.endMinute])).toEqual([
            ["aperitivo", 1080, 1200],
            ["vini", 1200, 1380]
        ]);
    });
});

describe("giudice nuovo — parità con quello di oggi sulle regole layout (D83)", () => {
    // Le colonne di oggi e le fasce come le scrive la migrazione 20261014090000.
    type Old = CompetitionRule;
    const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    function asJudge(old: Old): JudgeRule {
        const slots: JudgeSlot[] = [];
        if (old.time_mode === "window") {
            if (!old.time_from || !old.time_to) {
                if (old.days_of_week !== null) slots.push(slot({ start: 0, end: 1440, days_of_week: old.days_of_week }));
            } else {
                const from = toMinutes(old.time_from);
                const rawTo = toMinutes(old.time_to);
                const to = rawTo === 1439 && from < 1439 ? 1440 : rawTo;
                if (to <= from) slots.push(slot({ start: 0, end: 1440, days_of_week: [] }));
                else slots.push(slot({ start: from, end: to, days_of_week: old.days_of_week }));
            }
        }
        return rule({
            id: old.id,
            rule_type: "layout",
            priority: old.priority,
            created_at: old.created_at,
            time_mode: old.time_mode,
            start_at: old.start_at,
            end_at: old.end_at,
            applyToAll: old.applyToAll,
            activityIds: old.activityIds,
            groupIds: old.groupIds,
            slots,
            hasMenu: old.hasPayload
        });
    }
    function old(input: Partial<Old> & { id: string }): Old {
        return {
            id: input.id,
            rule_type: "layout",
            enabled: true,
            priority: input.priority ?? 10,
            created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
            time_mode: input.time_mode ?? "always",
            days_of_week: input.days_of_week ?? null,
            time_from: input.time_from ?? null,
            time_to: input.time_to ?? null,
            start_at: input.start_at ?? null,
            end_at: input.end_at ?? null,
            applyToAll: input.applyToAll ?? false,
            activityIds: input.activityIds ?? [],
            groupIds: input.groupIds ?? [],
            hasPayload: input.hasPayload
        };
    }

    const rules: Old[] = [
        old({ id: "base", applyToAll: true }),
        old({ id: "pranzo-gruppo", groupIds: ["gruppo-nord"], time_mode: "window", time_from: "12:00", time_to: "15:00" }),
        old({ id: "weekend", activityIds: ["sede-x"], time_mode: "window", days_of_week: [0, 6] }),
        old({ id: "sera-sede", activityIds: ["sede-x"], time_mode: "window", time_from: "19:00", time_to: "23:59", priority: 5 }),
        old({ id: "sera-tardi", activityIds: ["sede-x"], time_mode: "window", time_from: "19:00", time_to: "23:59", created_at: "2025-06-01T00:00:00.000Z" }),
        old({ id: "periodo", applyToAll: true, start_at: "2026-03-27T00:00:00.000Z", end_at: "2026-03-29T00:00:00.000Z" }),
        old({ id: "rotta", activityIds: ["sede-x"], time_mode: "window", time_from: "18:00", time_to: "10:00" }),
        old({ id: "vuota", activityIds: ["sede-x"], hasPayload: false }),
        old({ id: "giorni-sempre", activityIds: ["sede-y"], time_mode: "always", days_of_week: [1] })
    ];

    it("ogni 15 minuti di una settimana, in due sedi, vince la stessa regola", () => {
        const judgeRules = rules.map(asJudge);
        const start = Date.parse("2026-03-23T00:00:00.000Z");
        for (let t = start; t < start + 7 * 24 * 3_600_000; t += 15 * 60_000) {
            const now = toRomeDateTime(new Date(t));
            for (const seat of [SEAT_X, SEAT_Y]) {
                const before = resolveCompetition(rules, seat, now).layout.winner?.rule.id ?? null;
                const after = judge(judgeRules, seat, now);
                expect(after.menus.map(e => e.rule.id)[0] ?? null).toBe(before);
                expect(after.style?.rule.id ?? null).toBe(before);
            }
        }
    });
});
