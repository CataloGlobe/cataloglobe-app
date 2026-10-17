import { createLayoutRule } from "@/services/supabase/layoutScheduling";
import { createMenuAndStyleRules } from "@/services/supabase/scheduleModel";
import { NEW_MODEL } from "@/pages/Dashboard/Programming/calendar/calendarFlags";

/**
 * La prima regola del wizard: col modello nuovo (multi menù) una regola menù e
 * una stile, altrimenti una `layout` come oggi.
 */
export async function createSetupRule(input: { tenantId: string; name: string; activityId: string; catalogId: string; styleId: string }) {
    if (NEW_MODEL.splitLayout) {
        await createMenuAndStyleRules(input);
        return;
    }
    await createLayoutRule({
        tenantId: input.tenantId,
        name: input.name,
        targetType: "activity",
        targetId: input.activityId,
        catalogId: input.catalogId,
        styleId: input.styleId,
        priorityLevel: "medium",
        displayOrder: 0,
        enabled: true,
        timeMode: "always",
        daysOfWeek: null,
        timeFrom: null,
        timeTo: null
    });
}
