import { resolvePriceSummary } from "@/utils/priceSummary";

/**
 * Unified product price display utility.
 *
 * Rule:
 *  - 1 active price  → "€X.XX"
 *  - Multiple prices → "da €MIN"
 *  - No price        → "—"
 *
 * Accepts either a pre-computed `from_price` (e.g. from metadata) or
 * raw `option_groups` data so it works in every context.
 */

export type PriceDisplayResult = {
    label: string;
    type: "single" | "multiple" | "none";
};

type PriceInput = {
    base_price?: number | null;
    /** Pre-computed minimum format price (takes precedence over option_groups). */
    from_price?: number | null;
    /** Pre-computed maximum format price — non ancora consumato da getDisplayPrice (fondamenta per una futura sintesi a range). */
    to_price?: number | null;
    option_groups?: Array<{
        group_kind: string;
        values?: Array<{ absolute_price?: number | null }> | null;
    }> | null;
};

export function getDisplayPrice(product: PriceInput): PriceDisplayResult {
    // 1. Pre-computed from_price (from resolver / metadata) — fastest path
    if (typeof product.from_price === "number") {
        return { label: `da €${product.from_price.toFixed(2)}`, type: "multiple" };
    }

    // 2. Compute from PRIMARY_PRICE option groups when available
    const prices: Array<number | null | undefined> = [];
    for (const group of product.option_groups ?? []) {
        if (group.group_kind !== "PRIMARY_PRICE") continue;
        for (const v of group.values ?? []) {
            prices.push(v.absolute_price);
        }
    }
    const summary = resolvePriceSummary(prices);
    if (summary.kind === "single" && summary.min !== null) {
        return { label: `€${summary.min.toFixed(2)}`, type: "single" };
    }
    if (summary.kind === "multi" && summary.min !== null) {
        return { label: `da €${summary.min.toFixed(2)}`, type: "multiple" };
    }

    // 3. Single base price
    if (typeof product.base_price === "number") {
        return { label: `€${product.base_price.toFixed(2)}`, type: "single" };
    }

    return { label: "—", type: "none" };
}
