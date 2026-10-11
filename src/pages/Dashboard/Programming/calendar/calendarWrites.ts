// I ritocchi del pannello piccolo: togliere una cosa dal calendario.
// Con le funzioni di scrittura che usa già il dettaglio della regola: la regola
// resta com'è, cambia solo l'elenco dei suoi piatti o contenuti.
import { deleteLayoutRule, updateRule, type LayoutRule } from "@/services/supabase/layoutScheduling";
import { updateFeaturedRule } from "@/services/supabase/featuredScheduling";

export type DropItem =
    | { kind: "price"; productId: string; optionValueId: string | null }
    | { kind: "visibility"; productId: string }
    | { kind: "featured"; contentId: string };

/** Toglie tutta la regola. */
export async function dropRule(rule: LayoutRule): Promise<void> {
    await deleteLayoutRule(rule.id);
}

/** Toglie un piatto o un contenuto; se era l'ultimo, toglie la regola. */
export async function dropItem(rule: LayoutRule, item: DropItem): Promise<void> {
    if (item.kind === "featured") {
        const left = rule.featured_contents.filter(c => c.featured_content_id !== item.contentId);
        if (!left.length) return dropRule(rule);
        await updateFeaturedRule({
            id: rule.id,
            tenantId: rule.tenant_id,
            name: rule.name ?? "",
            enabled: rule.enabled,
            startAt: rule.start_at,
            endAt: rule.end_at,
            timeFrom: rule.time_from,
            timeTo: rule.time_to,
            daysOfWeek: rule.days_of_week,
            alwaysActive: rule.time_mode === "always",
            targetMode: rule.applyToAll ? "all" : rule.activityIds.length ? "activities" : "groups",
            activityIds: rule.activityIds,
            groupIds: rule.groupIds,
            featuredContents: left.map(c => ({ featured_content_id: c.featured_content_id, slot: c.slot, sort_order: c.sort_order }))
        });
        return;
    }
    const base = {
        scheduleId: rule.id,
        tenantId: rule.tenant_id,
        ruleType: rule.rule_type,
        name: rule.name,
        applyToAll: rule.applyToAll,
        activityIds: rule.activityIds,
        groupIds: rule.groupIds,
        enabled: rule.enabled,
        timeMode: rule.time_mode,
        daysOfWeek: rule.days_of_week,
        timeFrom: rule.time_from,
        timeTo: rule.time_to,
        startAt: rule.start_at,
        endAt: rule.end_at
    };
    if (item.kind === "price") {
        const left = rule.price_overrides.filter(p => !(p.product_id === item.productId && (p.option_value_id ?? null) === item.optionValueId));
        if (!left.length) return dropRule(rule);
        await updateRule({
            ...base,
            priceProducts: left.map(p => ({
                productId: p.product_id,
                optionValueId: p.option_value_id,
                overridePrice: p.override_price,
                showOriginalPrice: p.show_original_price
            }))
        });
        return;
    }
    const left = rule.visibility_overrides.filter(p => p.product_id !== item.productId);
    if (!left.length) return dropRule(rule);
    await updateRule({ ...base, visibilityProductOverrides: left.map(p => ({ productId: p.product_id, mode: p.mode })) });
}
