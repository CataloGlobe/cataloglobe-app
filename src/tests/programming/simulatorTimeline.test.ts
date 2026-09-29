import { describe, expect, it } from "vitest";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import {
    buildDailyTimeline,
    type TimelineRule
} from "@/pages/Dashboard/Programming/simulatorTimeline";

const SEAT = { activityId: "sede-x", groupIds: ["gruppo-nord"] };

function rule(input: Partial<TimelineRule> & { id: string }): TimelineRule {
    return {
        rule_type: "layout",
        enabled: true,
        priority: 10,
        created_at: "2026-01-01T00:00:00.000Z",
        time_mode: "always",
        days_of_week: null,
        time_from: null,
        time_to: null,
        start_at: null,
        end_at: null,
        applyToAll: false,
        activityIds: [],
        groupIds: [],
        layout: { catalog_id: "carta" },
        visibility_mode: "hide",
        ...input
    };
}

// Giovedì 26/03/2026: 48 mezz'ore, istanti a Roma (CET, UTC+1).
const SLOTS = Array.from({ length: 48 }, (_, i) => ({
    minutesOffset: i * 30,
    now: toRomeDateTime(new Date(Date.UTC(2026, 2, 25, 23, 0) + i * 30 * 60_000))
}));

describe("buildDailyTimeline — la giornata di una sede, in memoria", () => {
    it("fonde le mezz'ore uguali e cambia vincitore dove cambia la regola", () => {
        const blocks = buildDailyTimeline(
            [
                rule({ id: "carta", applyToAll: true }),
                rule({
                    id: "pranzo",
                    activityIds: ["sede-x"],
                    layout: { catalog_id: "menu-pranzo" },
                    time_mode: "window",
                    time_from: "12:00",
                    time_to: "15:00"
                })
            ],
            SEAT,
            SLOTS,
            30
        );

        expect(blocks.map(b => [b.startMinutes, b.endMinutes, b.layoutScheduleId, b.layoutCatalogId, b.layoutSpecificity])).toEqual([
            [0, 720, "carta", "carta", 0],
            [720, 900, "pranzo", "menu-pranzo", 2],
            [900, 1440, "carta", "carta", 0]
        ]);
    });

    it("gli altri strati: prezzi, disponibilità col suo modo, in evidenza", () => {
        const [block] = buildDailyTimeline(
            [
                rule({ id: "sconto", rule_type: "price", groupIds: ["gruppo-nord"], layout: null }),
                rule({ id: "esauriti", rule_type: "visibility", applyToAll: true, layout: null, visibility_mode: "disable" }),
                rule({ id: "vetrina", rule_type: "featured", activityIds: ["sede-x"], layout: null })
            ],
            SEAT,
            SLOTS,
            30
        );

        expect(block).toMatchObject({
            startMinutes: 0,
            endMinutes: 1440,
            layoutScheduleId: null,
            priceRuleId: "sconto",
            priceSpecificity: 1,
            visibilityScheduleId: "esauriti",
            visibilityMode: "disable",
            visibilitySpecificity: 0,
            featuredScheduleId: "vetrina"
        });
    });

    it("una regola che non raggiunge la sede non compare", () => {
        const blocks = buildDailyTimeline([rule({ id: "altrove", activityIds: ["sede-z"] })], SEAT, SLOTS, 30);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].layoutScheduleId).toBeNull();
    });
});
