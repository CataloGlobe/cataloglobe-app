import type { RuleType } from "@/services/supabase/layoutScheduling";

/**
 * Dove vive Programmazione (T9b, PG6-PG7). Con più sedi, dentro una sede, la
 * Programmazione della sede (`locations/:activityId/programmazione`); con una
 * sede sola, o fuori dalla sede, quella d'azienda (`scheduling`).
 */
export function schedulingPath(tenantId: string, activityId: string | null, singleSite: boolean): string {
    return activityId && !singleSite
        ? `/business/${tenantId}/locations/${activityId}/programmazione`
        : `/business/${tenantId}/scheduling`;
}

/** Il dettaglio di una regola sotto la stessa base; in evidenza ha la sua rotta. */
export function schedulingRulePath(
    tenantId: string,
    activityId: string | null,
    singleSite: boolean,
    rule: { id: string; rule_type: RuleType }
): string {
    const base = schedulingPath(tenantId, activityId, singleSite);
    return rule.rule_type === "featured" ? `${base}/featured/${rule.id}` : `${base}/${rule.id}`;
}
