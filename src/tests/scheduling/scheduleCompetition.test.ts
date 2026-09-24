import { describe, expect, it } from "vitest";
import {
    isTimeRuleActiveNow,
    resolveCompetition,
    type CompetitionRule
} from "@shared/scheduleCompetition";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";

// Giovedì 26/03/2026, 13:00 a Roma (CET).
const THURSDAY_NOON = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));

const SEAT_X = { activityId: "sede-x", groupIds: ["gruppo-nord"] };
const SEAT_Y = { activityId: "sede-y", groupIds: [] };

function rule(input: Partial<CompetitionRule> & { id: string }): CompetitionRule {
    return {
        id: input.id,
        rule_type: input.rule_type ?? "layout",
        enabled: input.enabled ?? true,
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

const ids = (entries: Array<{ rule: CompetitionRule }>) => entries.map(entry => entry.rule.id);

describe("resolveCompetition — chi vince per sede e strato", () => {
    it("1. a parità di sede vince la finestra più specifica, anche con priorità peggiore e più recente", () => {
        const always = rule({ id: "sempre", activityIds: ["sede-x"], priority: 1 });
        const lunch = rule({
            id: "pranzo",
            activityIds: ["sede-x"],
            priority: 30,
            created_at: "2026-02-01T00:00:00.000Z",
            time_mode: "window",
            time_from: "12:00",
            time_to: "15:00"
        });

        const outcome = resolveCompetition([always, lunch], SEAT_X, THURSDAY_NOON).layout;

        expect(outcome.winner?.rule.id).toBe("pranzo");
        expect(ids(outcome.contenders)).toEqual(["sempre"]);
    });

    it("2. sede batte gruppo, gruppo batte tutte, qualunque sia la priorità", () => {
        const all = rule({ id: "tutte", applyToAll: true, priority: 1 });
        const group = rule({ id: "gruppo", groupIds: ["gruppo-nord"], priority: 5 });
        const seat = rule({ id: "sede", activityIds: ["sede-x"], priority: 40 });

        const withSeat = resolveCompetition([all, group, seat], SEAT_X, THURSDAY_NOON).layout;
        expect(withSeat.winner).toEqual({ rule: seat, specificity: 2 });
        expect(withSeat.contenders.map(c => [c.rule.id, c.specificity])).toEqual([
            ["gruppo", 1],
            ["tutte", 0]
        ]);

        const withoutSeat = resolveCompetition([all, group], SEAT_X, THURSDAY_NOON).layout;
        expect(withoutSeat.winner?.rule.id).toBe("gruppo");
    });

    it("3. la competizione è per sede: la stessa regola vince in X e perde in Y", () => {
        const all = rule({ id: "tutte", applyToAll: true });
        const onlyY = rule({ id: "solo-y", activityIds: ["sede-y"] });

        const x = resolveCompetition([all, onlyY], SEAT_X, THURSDAY_NOON).layout;
        const y = resolveCompetition([all, onlyY], SEAT_Y, THURSDAY_NOON).layout;

        expect(x.winner?.rule.id).toBe("tutte");
        expect(x.contenders).toEqual([]);
        expect(y.winner?.rule.id).toBe("solo-y");
        expect(ids(y.contenders)).toEqual(["tutte"]);
    });

    it("4. una regola layout senza catalogo non vince né perde: passa la successiva", () => {
        const empty = rule({ id: "senza-catalogo", activityIds: ["sede-x"], hasPayload: false });
        const fallback = rule({ id: "con-catalogo", applyToAll: true });

        const outcome = resolveCompetition([empty, fallback], SEAT_X, THURSDAY_NOON).layout;

        expect(outcome.winner?.rule.id).toBe("con-catalogo");
        expect(outcome.contenders).toEqual([]);
        // Resta fra i candidati configurati (è il `layoutCandidateCount`).
        expect(ids(outcome.candidates)).toEqual(["senza-catalogo", "con-catalogo"]);
    });

    it("5. i quattro strati competono ciascuno per conto suo, «In evidenza» compreso", () => {
        const featuredAll = rule({ id: "evidenza-tutte", rule_type: "featured", applyToAll: true });
        const featuredSeat = rule({ id: "evidenza-sede", rule_type: "featured", activityIds: ["sede-x"] });
        const price = rule({ id: "prezzi", rule_type: "price", applyToAll: true });

        const outcome = resolveCompetition([featuredAll, featuredSeat, price], SEAT_X, THURSDAY_NOON);

        expect(outcome.featured.winner?.rule.id).toBe("evidenza-sede");
        expect(ids(outcome.featured.contenders)).toEqual(["evidenza-tutte"]);
        expect(outcome.price.winner?.rule.id).toBe("prezzi");
        expect(outcome.layout.winner).toBeNull();
        expect(outcome.visibility.winner).toBeNull();
    });

    it("11. una regola disabilitata non è nemmeno candidata", () => {
        const off = rule({ id: "spenta", activityIds: ["sede-x"], enabled: false });
        const on = rule({ id: "accesa", applyToAll: true });

        const outcome = resolveCompetition([off, on], SEAT_X, THURSDAY_NOON).layout;

        expect(outcome.winner?.rule.id).toBe("accesa");
        expect(ids(outcome.candidates)).toEqual(["accesa"]);
    });

    it("una regola che non raggiunge la sede resta fuori", () => {
        const other = rule({ id: "altrove", activityIds: ["sede-z"], groupIds: ["gruppo-sud"] });

        const outcome = resolveCompetition([other], SEAT_X, THURSDAY_NOON).layout;

        expect(outcome.winner).toBeNull();
        expect(outcome.candidates).toEqual([]);
    });

    it("apply_to_all resta specificità 0 anche con target specifici residui", () => {
        const stray = rule({ id: "globale", applyToAll: true, activityIds: ["sede-x"] });
        const group = rule({ id: "gruppo", groupIds: ["gruppo-nord"] });

        const outcome = resolveCompetition([stray, group], SEAT_X, THURSDAY_NOON).layout;

        expect(outcome.winner?.rule.id).toBe("gruppo");
        expect(outcome.contenders).toEqual([{ rule: stray, specificity: 0 }]);
    });
});

describe("isTimeRuleActiveNow — la finestra, all'ora di Roma", () => {
    const at = (iso: string) => toRomeDateTime(new Date(iso));

    it("6. inizio incluso, fine esclusa, orario da incluso e a escluso", () => {
        const dated = rule({
            id: "periodo",
            time_mode: "window",
            start_at: "2026-03-26T11:00:00.000Z",
            end_at: "2026-03-26T13:00:00.000Z"
        });
        expect(isTimeRuleActiveNow(dated, at("2026-03-26T11:00:00.000Z"))).toBe(true);
        expect(isTimeRuleActiveNow(dated, at("2026-03-26T13:00:00.000Z"))).toBe(false);

        const timed = rule({ id: "orario", time_mode: "window", time_from: "12:00", time_to: "15:00" });
        expect(isTimeRuleActiveNow(timed, at("2026-03-26T11:00:00.000Z"))).toBe(true); // 12:00 Roma
        expect(isTimeRuleActiveNow(timed, at("2026-03-26T13:59:00.000Z"))).toBe(true); // 14:59
        expect(isTimeRuleActiveNow(timed, at("2026-03-26T14:00:00.000Z"))).toBe(false); // 15:00
    });

    it("7. days_of_week vuoto vuol dire «mai»; null vuol dire ogni giorno", () => {
        // Fixture dal caso di staging aaa845cf: «In evidenza» 11–15 con '{}'.
        const noDays = rule({
            id: "nessun-giorno",
            rule_type: "featured",
            time_mode: "window",
            days_of_week: [],
            time_from: "11:00",
            time_to: "15:00"
        });
        const everyDay = rule({ ...noDays, id: "ogni-giorno", days_of_week: null });

        expect(isTimeRuleActiveNow(noDays, THURSDAY_NOON)).toBe(false);
        expect(isTimeRuleActiveNow(everyDay, THURSDAY_NOON)).toBe(true);
        expect(
            resolveCompetition([{ ...noDays, applyToAll: true }], SEAT_X, THURSDAY_NOON).featured.winner
        ).toBeNull();
    });

    it("8. una finestra con inizio e senza fine è esclusa", () => {
        const openEnded = rule({
            id: "senza-fine",
            time_mode: "window",
            start_at: "2026-01-01T00:00:00.000Z"
        });
        expect(isTimeRuleActiveNow(openEnded, THURSDAY_NOON)).toBe(false);
    });

    it("9. «Sempre» ignora giorni e orari", () => {
        const always = rule({
            id: "sempre",
            time_mode: "always",
            days_of_week: [1],
            time_from: "08:00",
            time_to: "09:00"
        });
        expect(isTimeRuleActiveNow(always, THURSDAY_NOON)).toBe(true);
    });

    it("10. ora legale (29/03) e ora solare (25/10): orari e giorni sono quelli di Roma", () => {
        const earlyMorning = rule({ id: "tre-quattro", time_mode: "window", time_from: "03:00", time_to: "04:00" });
        // 29/03: 00:30Z = 01:30 CET, 01:30Z = 03:30 CEST.
        expect(isTimeRuleActiveNow(earlyMorning, at("2026-03-29T00:30:00.000Z"))).toBe(false);
        expect(isTimeRuleActiveNow(earlyMorning, at("2026-03-29T01:30:00.000Z"))).toBe(true);

        const twoToThree = rule({ id: "due-tre", time_mode: "window", time_from: "02:00", time_to: "03:00" });
        // 25/10: 00:30Z = 02:30 CEST, 01:30Z = 02:30 CET — due volte dentro.
        expect(isTimeRuleActiveNow(twoToThree, at("2026-10-25T00:30:00.000Z"))).toBe(true);
        expect(isTimeRuleActiveNow(twoToThree, at("2026-10-25T01:30:00.000Z"))).toBe(true);

        const sundayOnly = rule({ id: "domenica", time_mode: "window", days_of_week: [0] });
        // Sabato 28/03 23:30Z = domenica 00:30 a Roma.
        expect(isTimeRuleActiveNow(sundayOnly, at("2026-03-28T23:30:00.000Z"))).toBe(true);
        expect(isTimeRuleActiveNow(sundayOnly, at("2026-03-28T22:30:00.000Z"))).toBe(false);
    });
});
