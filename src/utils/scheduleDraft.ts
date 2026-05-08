import type { LayoutRule } from "@services/supabase/layoutScheduling";

/**
 * Returns true when a schedule rule is a draft.
 *
 * A rule is a draft when targets are empty OR its type-specific payload
 * is missing (layout: no catalog/style; featured: no contents;
 * price/visibility: no overrides).
 *
 * NOTE: FeaturedRuleDetail.tsx uses a NARROWER definition (wasOriginallyDraft)
 * intentionally — it gates the auto-activation flow on save, and only checks
 * targets + featured_contents. Do NOT consolidate that file here without
 * verifying the auto-activation semantics.
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
