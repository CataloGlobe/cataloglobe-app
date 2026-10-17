import { afterEach, describe, expect, it, vi } from "vitest";

// NEW_MODEL è un oggetto: conta solo splitLayout. In vitest i flag sono spenti,
// come in produzione.
vi.mock("@/services/supabase/layoutScheduling", () => ({ createLayoutRule: vi.fn(async () => "layout-1") }));
vi.mock("@/services/supabase/scheduleModel", () => ({ createMenuAndStyleRules: vi.fn(async () => ({ menuId: "m", styleRuleId: "s" })) }));

import { createLayoutRule } from "@/services/supabase/layoutScheduling";
import { createMenuAndStyleRules } from "@/services/supabase/scheduleModel";
import { NEW_MODEL } from "@/pages/Dashboard/Programming/calendar/calendarFlags";
import { addsFromCalendar } from "@/pages/Dashboard/Programming/calendar/splitLayout";
import { createSetupRule } from "@/pages/Setup/setupRule";

const input = { tenantId: "t", name: "Menù principale", activityId: "a", catalogId: "c", styleId: "s" };
const keep = NEW_MODEL.splitLayout;
afterEach(() => {
    NEW_MODEL.splitLayout = keep;
    vi.clearAllMocks();
});

describe("modello nuovo solo con splitLayout acceso", () => {
    it("wizard col flag spento: una regola layout", async () => {
        NEW_MODEL.splitLayout = false;
        await createSetupRule(input);
        expect(createLayoutRule).toHaveBeenCalledWith(expect.objectContaining({ targetId: "a", catalogId: "c", styleId: "s", enabled: true }));
        expect(createMenuAndStyleRules).not.toHaveBeenCalled();
    });

    it("wizard col flag acceso: menù e stile", async () => {
        NEW_MODEL.splitLayout = true;
        await createSetupRule(input);
        expect(createMenuAndStyleRules).toHaveBeenCalledWith(input);
        expect(createLayoutRule).not.toHaveBeenCalled();
    });

    it("«Aggiungi» di menù e stile va al Calendario solo col flag acceso", () => {
        NEW_MODEL.splitLayout = false;
        expect(addsFromCalendar("layout")).toBe(false);
        NEW_MODEL.splitLayout = true;
        expect(addsFromCalendar("layout")).toBe(true);
        expect(addsFromCalendar("price")).toBe(false);
    });
});
