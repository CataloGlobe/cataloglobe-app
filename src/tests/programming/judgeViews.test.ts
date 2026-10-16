import { describe, expect, it } from "vitest";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { buildDailyTimeline } from "@/pages/Dashboard/Programming/simulatorTimeline";
import { isViewRuleActiveNow, judgeSeat, toJudgeRule } from "@/utils/judgeView";
import { computeRuleInsights } from "@/utils/ruleInsights";
import { buildScheduleMatrix, describeBand } from "@/utils/scheduleMatrix";
import {
    COMPETITION_RULE_TYPES,
    isTimeRuleActiveNow,
    resolveCompetition,
    type CompetitionRule,
    type CompetitionSeat
} from "@shared/scheduleCompetition";

// Le viste del back office sul giudice nuovo (piano 9b, passo 3d): con le sole
// regole `layout` di oggi danno quello che dava il giudice vecchio; con le
// regole `menu` mostrano più menù insieme, «al posto degli altri», più fasce e
// le fasce oltre la mezzanotte.

const ACTIVITIES = [
    { id: "sede-x", name: "Comasina", status: "active" as const },
    { id: "sede-y", name: "Varedo", status: "active" as const }
];
const GROUPS: Record<string, string[]> = { "gruppo-nord": ["sede-x"] };
const SEATS: CompetitionSeat[] = [
    { activityId: "sede-x", groupIds: ["gruppo-nord"] },
    { activityId: "sede-y", groupIds: [] }
];

function rule(input: Partial<LayoutRule> & { id: string }): LayoutRule {
    return {
        tenant_id: "tenant-1",
        name: input.id,
        rule_type: "layout",
        target_type: "activity_group",
        target_id: "system-all",
        target_group: null,
        applyToAll: true,
        activityIds: [],
        groupIds: [],
        visibility_mode: "hide",
        priority: 10,
        priority_level: "medium",
        display_order: 0,
        enabled: true,
        time_mode: "always",
        days_of_week: null,
        time_from: null,
        time_to: null,
        start_at: null,
        end_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        layout: { style_id: "style-1", catalog_id: "carta" },
        price_overrides: [],
        visibility_overrides: [],
        featured_contents: [],
        ...input
    } as LayoutRule;
}

/** Una regola `menu` del modello nuovo (il tipo della UI la conosce dal passo 5). */
function menu(input: Partial<Omit<LayoutRule, "rule_type">> & { id: string; catalog: string }): LayoutRule {
    const { catalog, ...rest } = input;
    return { ...rule(rest), rule_type: "menu", layout: { style_id: null, catalog_id: catalog } } as unknown as LayoutRule;
}

function slot(id: string, start: string, end: string, days: number[] | null = null) {
    const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    let endMinute = minutes(end);
    if (endMinute <= minutes(start)) endMinute += 1440;
    return { id, days_of_week: days, start_minute: minutes(start), end_minute: endMinute, activityIds: [], groupIds: [] };
}

/** Un istante a Roma (marzo 2026, CET = UTC+1). Giovedì 26 = 4. */
function rome(day: number, hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    return toRomeDateTime(new Date(Date.UTC(2026, 2, day, h - 1, m)));
}

function dayHalfHours(day: number) {
    return Array.from({ length: 48 }, (_, i) => ({
        minutesOffset: i * 30,
        now: toRomeDateTime(new Date(Date.UTC(2026, 2, day - 1, 23, 0) + i * 30 * 60_000))
    }));
}

const CATALOG_NAMES: Record<string, string> = { carta: "Ristorante", bar: "Bar", drink: "Aperitivo" };

function insightsAt(rules: LayoutRule[], at: Date) {
    return computeRuleInsights({
        rules,
        activities: ACTIVITIES,
        activityIdsByGroupId: GROUPS,
        groupNameById: new Map(),
        filterActivityId: null,
        now: at,
        ruleName: r => r.name ?? r.id
    });
}

function matrixAt(rules: LayoutRule[], instant: ReturnType<typeof rome>, filterActivityId: string | null = null) {
    return buildScheduleMatrix({
        rules,
        activities: ACTIVITIES,
        activityIdsByGroupId: GROUPS,
        manualCounts: {},
        filterActivityId,
        instant,
        subscriptionInactive: false
    });
}

// ── Parità: con le sole `layout` il giudice nuovo dà il verdetto vecchio ─────

/** La forma del giudice vecchio, com'era `toCompetitionRule` prima del passo 3d. */
function toOldRule(r: LayoutRule): CompetitionRule {
    return {
        id: r.id,
        rule_type: r.rule_type,
        enabled: r.enabled,
        priority: r.priority,
        created_at: r.created_at,
        time_mode: r.time_mode,
        days_of_week: r.days_of_week,
        time_from: r.time_from,
        time_to: r.time_to,
        start_at: r.start_at,
        end_at: r.end_at,
        applyToAll: r.applyToAll,
        activityIds: r.activityIds,
        groupIds: r.groupIds,
        hasPayload: (r.layout?.catalog_id ?? null) !== null
    };
}

/** Generatore deterministico (mulberry32), così un errore si riproduce. */
function prng(seed: number) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const TARGETS: Array<Partial<LayoutRule>> = [
    { applyToAll: true },
    { applyToAll: false, activityIds: ["sede-x"] },
    { applyToAll: false, groupIds: ["gruppo-nord"] },
    { applyToAll: false, activityIds: ["sede-y"] }
];
const TIMES: Array<Partial<LayoutRule>> = [
    { time_mode: "always" },
    // «Sempre» coi giorni e le ore rimasti: oggi si ignorano.
    { time_mode: "always", days_of_week: [1, 2], time_from: "12:00", time_to: "15:00" },
    { time_mode: "window", days_of_week: null },
    { time_mode: "window", days_of_week: [4] },
    { time_mode: "window", days_of_week: [] },
    { time_mode: "window", time_from: "12:00", time_to: "15:00" },
    { time_mode: "window", time_from: "19:00:00", time_to: "23:00:00", days_of_week: [4, 5] },
    // Oggi una fine non dopo l'inizio non vale mai (il ponte la scrive così).
    { time_mode: "window", time_from: "22:00", time_to: "02:00" },
    { time_mode: "window", time_from: "00:00", time_to: "23:59" }
];
const PERIODS: Array<Partial<LayoutRule>> = [
    {},
    { start_at: "2026-03-24T00:00:00.000Z", end_at: "2026-03-28T00:00:00.000Z" },
    { start_at: "2026-03-25T00:00:00.000Z" },
    { end_at: "2026-03-26T18:00:00.000Z" }
];

function randomLayout(next: () => number, i: number): LayoutRule {
    const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)];
    return rule({
        id: `r${i}`,
        ...pick(TARGETS),
        ...pick(TIMES),
        ...pick(PERIODS),
        priority: pick([10, 20]),
        enabled: next() > 0.1,
        created_at: `2026-01-0${1 + Math.floor(next() * 3)}T00:00:00.000Z`,
        // Più nuova per on_air_since quando è più vecchia per created_at: l'ordine
        // delle layout non deve guardarla.
        on_air_since: `2026-02-0${9 - Math.floor(next() * 3)}T00:00:00.000Z`,
        layout: next() > 0.15 ? { style_id: "s", catalog_id: `c${i}` } : { style_id: "s", catalog_id: null }
    });
}

describe("viste sul giudice nuovo: parità con le sole layout", () => {
    // Martedì 24 - domenica 29 marzo, ogni mezz'ora (mai alle 23:59, l'unico
    // minuto in cui il ponte e il giudice vecchio differiscono).
    const INSTANTS = Array.from({ length: 6 * 48 }, (_, i) =>
        toRomeDateTime(new Date(Date.UTC(2026, 2, 23, 23, 0) + i * 30 * 60_000))
    );

    it("stesso vincitore, stesse perdenti, stesso «Adesso» su 300 insiemi di regole", () => {
        const next = prng(20261017);
        const mismatches: string[] = [];
        const ids = (list: Array<{ rule: { id: string } }>) => list.map(e => e.rule.id).sort().join(",");
        let checked = 0;
        for (let set = 0; set < 300; set++) {
            const rules = Array.from({ length: 1 + Math.floor(next() * 6) }, (_, i) => randomLayout(next, set * 10 + i));
            const oldRules = rules.map(toOldRule);
            const newRules = rules.map(toJudgeRule);
            for (const now of INSTANTS) {
                for (const seat of SEATS) {
                    const old = resolveCompetition(oldRules, seat, now).layout;
                    const verdict = judgeSeat(newRules, seat, now).layout;
                    const got = `${ids(verdict.shown)}|${ids(verdict.covered.map(c => c.entry))}|${ids(verdict.covered.map(c => c.by))}`;
                    const want = `${old.winner?.rule.id ?? ""}|${ids(old.contenders)}|${old.contenders.map(() => old.winner?.rule.id).join(",")}`;
                    if (got !== want) mismatches.push(`set ${set} ${seat.activityId} ${now.epoch}: ${got} ≠ ${want}`);
                    checked++;
                }
                for (const r of rules) {
                    if (isViewRuleActiveNow(r, now) !== (r.enabled && isTimeRuleActiveNow(r, now))) {
                        mismatches.push(`set ${set} ${r.id} ${now.epoch}: «Adesso» diverso`);
                    }
                }
            }
        }
        expect(mismatches.slice(0, 5)).toEqual([]);
        expect(checked).toBe(300 * INSTANTS.length * SEATS.length);
    });

    it("l'elenco («Adesso», «Sovrascritta da», sedi perse) è quello di prima su 150 insiemi", () => {
        // L'oracolo è il ciclo di `computeRuleInsights` col giudice vecchio, com'era prima del passo 3d.
        const oldInsights = (rules: LayoutRule[], now: ReturnType<typeof toRomeDateTime>) => {
            const oldRules = rules.map(toOldRule);
            const wins = new Set<string>();
            const participates = new Set<string>();
            const by = new Map<string, string>();
            const losing = new Map<string, string[]>();
            for (const seat of SEATS) {
                const outcome = resolveCompetition(oldRules, seat, now);
                for (const type of COMPETITION_RULE_TYPES) {
                    const { winner, contenders } = outcome[type];
                    if (!winner) continue;
                    wins.add(winner.rule.id);
                    participates.add(winner.rule.id);
                    for (const loser of contenders) {
                        participates.add(loser.rule.id);
                        if (!by.has(loser.rule.id)) by.set(loser.rule.id, winner.rule.id);
                        losing.set(loser.rule.id, [...(losing.get(loser.rule.id) ?? []), `${seat.activityId}>${winner.rule.id}`]);
                    }
                }
            }
            return new Map(
                rules.map(r => {
                    const active = r.enabled && isTimeRuleActiveNow(r, now);
                    const over = active && participates.has(r.id) && !wins.has(r.id);
                    return [r.id, `${active}|${over}|${by.get(r.id) ?? ""}|${(losing.get(r.id) ?? []).join(",")}`];
                })
            );
        };
        const next = prng(20261018);
        const mismatches: string[] = [];
        // Ogni tre ore e mezza (ore sempre diverse), dal martedì alla domenica.
        const instants = INSTANTS.filter((_, i) => i % 7 === 0);
        for (let set = 0; set < 150; set++) {
            const rules = Array.from({ length: 1 + Math.floor(next() * 6) }, (_, i) => randomLayout(next, set * 10 + i));
            for (const now of instants) {
                const want = oldInsights(rules, now);
                const got = insightsAt(rules, new Date(now.epoch));
                for (const r of rules) {
                    const g = got.get(r.id);
                    const losingGot = (g?.losingSeats ?? []).map(s => `${s.activityId}>${s.winnerId}`).join(",");
                    const line = `${g?.isActiveNow}|${g?.isOverridden}|${g?.overriddenById ?? ""}|${losingGot}`;
                    if (line !== want.get(r.id)) mismatches.push(`set ${set} ${r.id} ${now.epoch}: ${line} ≠ ${want.get(r.id)}`);
                }
            }
        }
        expect(mismatches.slice(0, 5)).toEqual([]);
    });
});

describe("viste sul giudice nuovo: prezzi, disponibilità e in evidenza si sommano", () => {
    const THU_13 = new Date("2026-03-26T12:00:00.000Z");
    const price = (id: string, extra: Partial<LayoutRule> = {}) =>
        rule({ id, rule_type: "price", layout: null, created_at: "2026-01-02T00:00:00.000Z", ...extra });
    const visibility = (id: string, mode: "hide" | "disable", extra: Partial<LayoutRule> = {}) =>
        rule({ id, rule_type: "visibility", visibility_mode: mode, layout: null, ...extra });

    it("due prezzi in onda nella stessa sede: nessuno è sovrascritto, la matrice li ha tutti e due", () => {
        const tutti = price("prezzi-tutti");
        const nord = price("prezzi-nord", { applyToAll: false, activityIds: ["sede-x"], created_at: "2026-01-01T00:00:00.000Z" });
        const insights = insightsAt([tutti, nord], THU_13);
        expect(insights.get("prezzi-tutti")).toMatchObject({ isActiveNow: true, isOverridden: false });
        expect(insights.get("prezzi-nord")).toMatchObject({ isActiveNow: true, isOverridden: false });
        expect(insights.get("prezzi-tutti")?.losingSeats).toBeUndefined();

        const cell = matrixAt([tutti, nord], rome(26, "13:00"), "sede-x").rows[0].cells.price;
        // La più specifica per prima, come la pagina pubblica le applica.
        expect(cell.kind === "winner" && cell.rules.map(r => r.id)).toEqual(["prezzi-nord", "prezzi-tutti"]);
    });

    it("l'andamento spezza il blocco quando entra un secondo prezzo, e tiene i modi di tutte le disponibilità", () => {
        const sempre = price("prezzi-sempre");
        const sera = price("prezzi-sera", { time_mode: "window", time_from: "19:00", time_to: "23:00" });
        const nascondi = visibility("nascondi", "hide");
        const spegni = visibility("spegni", "disable", { time_mode: "window", time_from: "12:00", time_to: "15:00" });
        const blocks = buildDailyTimeline([sempre, sera, nascondi, spegni], SEATS[0], dayHalfHours(26), 30);
        expect(blocks.map(b => [b.startMinutes, b.endMinutes, b.priceRuleIds.slice().sort(), b.visibilityModes.slice().sort()])).toEqual([
            [0, 720, ["prezzi-sempre"], ["hide"]],
            [720, 900, ["prezzi-sempre"], ["disable", "hide"]],
            [900, 1140, ["prezzi-sempre"], ["hide"]],
            [1140, 1380, ["prezzi-sempre", "prezzi-sera"], ["hide"]],
            [1380, 1440, ["prezzi-sempre"], ["hide"]]
        ]);
    });

    it("due in evidenza: l'andamento le nomina tutte e due", () => {
        const a = rule({ id: "promo-a", rule_type: "featured", layout: null });
        const b = rule({ id: "promo-b", rule_type: "featured", layout: null, created_at: "2026-01-02T00:00:00.000Z" });
        const [block] = buildDailyTimeline([a, b], SEATS[0], dayHalfHours(26), 30);
        expect(block.featuredScheduleIds.slice().sort()).toEqual(["promo-a", "promo-b"]);
        expect(insightsAt([a, b], THU_13).get("promo-a")).toMatchObject({ isOverridden: false });
    });
});

// ── Il modello nuovo ─────────────────────────────────────────────────────────

describe("viste sul giudice nuovo: più menù", () => {
    const THU_13 = new Date("2026-03-26T12:00:00.000Z");

    it("due menù «insieme»: si vedono tutti e due, nessuno è sovrascritto", () => {
        const carta = menu({ id: "carta-sempre", catalog: "carta", on_air_since: "2026-01-01T00:00:00.000Z" });
        const bar = menu({ id: "bar-sempre", catalog: "bar", on_air_since: "2026-02-01T00:00:00.000Z" });
        const rules = [carta, bar];

        const insights = insightsAt(rules, THU_13);
        expect(insights.get("carta-sempre")).toMatchObject({ isActiveNow: true, isOverridden: false });
        expect(insights.get("bar-sempre")).toMatchObject({ isActiveNow: true, isOverridden: false });

        const matrix = matrixAt(rules, rome(26, "13:00"), "sede-x");
        const cell = matrix.rows[0].cells.layout;
        expect(cell.kind === "winner" && cell.rules.map(r => r.id)).toEqual(["bar-sempre", "carta-sempre"]);
        expect(describeBand(matrix, id => CATALOG_NAMES[id]).headline).toBe("Comasina sta mostrando Bar e Ristorante");

        const blocks = buildDailyTimeline(rules, SEATS[0], dayHalfHours(26), 30);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].layoutCatalogIds).toEqual(["bar", "carta"]);
    });

    it("«al posto degli altri» copre i menù «insieme» solo nella sua fascia", () => {
        const carta = menu({ id: "carta-sempre", catalog: "carta" });
        const bar = menu({ id: "bar-sempre", catalog: "bar" });
        const sera = menu({
            id: "drink-sera",
            catalog: "drink",
            overlap_mode: "replace",
            time_mode: "window",
            slots: [slot("s1", "19:00", "23:00")]
        });
        const rules = [carta, bar, sera];

        expect(insightsAt(rules, THU_13).get("carta-sempre")).toMatchObject({ isOverridden: false });
        const evening = insightsAt(rules, new Date("2026-03-26T19:30:00.000Z"));
        expect(evening.get("drink-sera")).toMatchObject({ isActiveNow: true, isOverridden: false });
        expect(evening.get("carta-sempre")).toMatchObject({
            isOverridden: true,
            overriddenById: "drink-sera",
            excludedActivityNames: ["Comasina", "Varedo"]
        });

        const cell = matrixAt(rules, rome(26, "20:30"), "sede-x").rows[0].cells.layout;
        expect(cell.kind === "winner" && cell.rules.map(r => r.id)).toEqual(["drink-sera"]);

        const blocks = buildDailyTimeline(rules, SEATS[0], dayHalfHours(26), 30);
        expect(blocks.map(b => [b.startMinutes, b.endMinutes, b.layoutCatalogIds.slice().sort()])).toEqual([
            [0, 1140, ["bar", "carta"]],
            [1140, 1380, ["drink"]],
            [1380, 1440, ["bar", "carta"]]
        ]);
    });

    it("una regola layout attiva conta come «al posto» e copre i menù «insieme»", () => {
        // È il caso di San Pietro: la regola di oggi va spenta quando si creano i menù.
        const completo = rule({ id: "menu-completo", layout: { style_id: "s", catalog_id: "carta" } });
        const bar = menu({ id: "bar-sempre", catalog: "bar", on_air_since: "2026-02-01T00:00:00.000Z" });
        const insights = insightsAt([completo, bar], THU_13);
        expect(insights.get("bar-sempre")).toMatchObject({ isOverridden: true, overriddenById: "menu-completo" });
        expect(insights.get("menu-completo")).toMatchObject({ isOverridden: false });

        const spento = insightsAt([{ ...completo, enabled: false }, bar], THU_13);
        expect(spento.get("bar-sempre")).toMatchObject({ isActiveNow: true, isOverridden: false });
    });

    it("un menù con due fasce è in onda in tutte e due, non in mezzo", () => {
        const pranzoCena = menu({
            id: "pranzo-cena",
            catalog: "carta",
            time_mode: "window",
            slots: [slot("pranzo", "12:00", "15:00"), slot("cena", "19:00", "23:00")]
        });
        const blocks = buildDailyTimeline([pranzoCena], SEATS[0], dayHalfHours(26), 30);
        expect(blocks.map(b => [b.startMinutes, b.endMinutes, b.layoutCatalogId])).toEqual([
            [0, 720, null],
            [720, 900, "carta"],
            [900, 1140, null],
            [1140, 1380, "carta"],
            [1380, 1440, null]
        ]);
        expect(insightsAt([pranzoCena], new Date("2026-03-26T16:00:00.000Z")).get("pranzo-cena")?.isActiveNow).toBe(false);
        expect(insightsAt([pranzoCena], new Date("2026-03-26T20:00:00.000Z")).get("pranzo-cena")?.isActiveNow).toBe(true);
    });

    it("una fascia 19:00-02:00 del giovedì vale fino alle 2 di venerdì", () => {
        const notte = menu({
            id: "notte",
            catalog: "drink",
            time_mode: "window",
            slots: [slot("notte", "19:00", "02:00", [4])]
        });
        const thursday = buildDailyTimeline([notte], SEATS[0], dayHalfHours(26), 30);
        expect(thursday.map(b => [b.startMinutes, b.endMinutes, b.layoutCatalogId])).toEqual([
            [0, 1140, null],
            [1140, 1440, "drink"]
        ]);
        const friday = buildDailyTimeline([notte], SEATS[0], dayHalfHours(27), 30);
        expect(friday.map(b => [b.startMinutes, b.endMinutes, b.layoutCatalogId])).toEqual([
            [0, 120, "drink"],
            [120, 1440, null]
        ]);
        // Venerdì all'una sì, alle tre no; mercoledì notte no (la fascia parte il giovedì).
        expect(insightsAt([notte], new Date("2026-03-27T00:00:00.000Z")).get("notte")?.isActiveNow).toBe(true);
        expect(insightsAt([notte], new Date("2026-03-27T02:00:00.000Z")).get("notte")?.isActiveNow).toBe(false);
        expect(insightsAt([notte], new Date("2026-03-26T00:00:00.000Z")).get("notte")?.isActiveNow).toBe(false);
    });
});
