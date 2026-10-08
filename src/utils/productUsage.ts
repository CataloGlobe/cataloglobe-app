import type { RuleType } from "@/services/supabase/layoutScheduling";

export type ProductUsageItem = { id: string; name: string };

export type ProductUsageData = {
    catalogs: ProductUsageItem[];
    schedules: ProductUsageItem[];
    activities: ProductUsageItem[];
};

/** Una regola dell'azienda coi suoi target veri (`schedule_targets`). */
export type UsageRule = {
    id: string;
    name: string | null;
    rule_type: RuleType;
    /** Per le regole menù: il catalogo che mostrano. */
    catalogId: string | null;
    applyToAll: boolean;
    activityIds: string[];
    groupIds: string[];
};

export type ProductUsageInput = {
    /** I menù dell'azienda che contengono il prodotto. */
    catalogs: ProductUsageItem[];
    /**
     * Le regole menù dell'azienda, più le regole prezzo e visibilità che
     * nominano il prodotto (il chiamante le ha già filtrate così).
     */
    rules: UsageRule[];
    /** Le sedi dell'azienda, nell'ordine in cui mostrarle. */
    activities: ProductUsageItem[];
    activityIdsByGroupId: Record<string, string[]>;
};

const byName = (a: ProductUsageItem, b: ProductUsageItem) => a.name.localeCompare(b.name, "it");

/**
 * Dove si usa un prodotto (T19): le regole che lo toccano e le sedi che
 * raggiungono. Una regola menù lo tocca se il suo catalogo lo contiene; una
 * regola prezzo o visibilità se lo nomina. Le sedi vengono dai target veri:
 * «tutte le sedi», le sedi scelte, i membri dei gruppi; solo quelle
 * dell'azienda, ognuna una volta. Pura.
 */
export function resolveProductUsage(input: ProductUsageInput): ProductUsageData {
    const catalogIds = new Set(input.catalogs.map(c => c.id));
    const touching = input.rules.filter(rule =>
        rule.rule_type === "layout" ? rule.catalogId !== null && catalogIds.has(rule.catalogId) : true
    );

    const reached = new Set<string>();
    for (const rule of touching) {
        if (rule.applyToAll) {
            for (const a of input.activities) reached.add(a.id);
            continue;
        }
        for (const id of rule.activityIds) reached.add(id);
        for (const groupId of rule.groupIds) {
            for (const id of input.activityIdsByGroupId[groupId] ?? []) reached.add(id);
        }
    }

    return {
        catalogs: input.catalogs,
        schedules: touching
            .map(rule => ({ id: rule.id, name: rule.name?.trim() || "Regola senza nome" }))
            .sort(byName),
        activities: input.activities.filter(a => reached.has(a.id))
    };
}
