import type { LayoutRule } from "@services/supabase/layoutScheduling";

/**
 * Returns true when a schedule rule is a draft.
 *
 * A rule is a draft when targets are empty OR its type-specific payload
 * is missing (layout: no catalog/style; featured: no contents;
 * price/visibility: no overrides).
 *
 * Also gates auto-activation on save in the rule detail (`useRuleDetail`):
 * completing a saved draft turns it on. The two detail pages used to carry
 * one narrower copy each (layout/price/visibility, featured); their union is
 * exactly this function.
 */
export function isLayoutRuleDraft(rule: LayoutRule): boolean {
    if (!rule.applyToAll && rule.activityIds.length === 0 && rule.groupIds.length === 0) {
        return true;
    }
    if (rule.rule_type === "layout") {
        return !rule.layout?.catalog_id || !rule.layout?.style_id;
    }
    if (rule.rule_type === "featured") {
        return rule.featured_contents.length === 0;
    }
    if (rule.rule_type === "price") {
        return rule.price_overrides.length === 0;
    }
    if (rule.rule_type === "visibility") {
        return rule.visibility_overrides.length === 0;
    }
    return false;
}
