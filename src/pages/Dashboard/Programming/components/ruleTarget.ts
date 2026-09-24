import { AlertCircle, Building2, Globe, Users } from "lucide-react";
import type { LayoutRule, LayoutRuleOption } from "@/services/supabase/layoutScheduling";

/** «Dove si applica» di una regola: icona, etichetta breve, elenco completo nel tooltip. */
type Target = { icon: typeof Globe; label: string; tooltip: string | null };

export function describeTarget(
    rule: LayoutRule,
    activityById: Map<string, Pick<LayoutRuleOption, "name">>,
    activityGroups: Array<Pick<LayoutRuleOption, "id" | "name">>
): Target {
    if (rule.applyToAll) {
        return { icon: Globe, label: "Tutte le sedi", tooltip: "Si applica a tutte le sedi, anche a quelle che aggiungerai" };
    }
    if (rule.activityIds.length > 0) {
        const names = rule.activityIds.map(id => activityById.get(id)?.name ?? id);
        const extra = names.length - 1;
        return { icon: Building2, label: `${names[0]}${extra > 0 ? ` +${extra}` : ""}`, tooltip: `Sedi: ${names.join(", ")}` };
    }
    if (rule.groupIds.length > 0) {
        const names = rule.groupIds.map(id => activityGroups.find(g => g.id === id)?.name ?? id);
        const extra = names.length - 1;
        return { icon: Users, label: `${names[0]}${extra > 0 ? ` +${extra}` : ""}`, tooltip: `Gruppi di sedi: ${names.join(", ")}` };
    }
    return { icon: AlertCircle, label: "Da scegliere", tooltip: null };
}
