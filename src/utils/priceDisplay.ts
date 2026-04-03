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
    const prices: number[] = [];
    for (const group of product.option_groups ?? []) {
        if (group.group_kind !== "PRIMARY_PRICE") continue;
        for (const v of group.values ?? []) {
            if (typeof v.absolute_price === "number") {
                prices.push(v.absolute_price);
            }
        }
    }
    if (prices.length === 1) {
        return { label: `€${prices[0].toFixed(2)}`, type: "single" };
    }
    if (prices.length > 1) {
        return { label: `da €${Math.min(...prices).toFixed(2)}`, type: "multiple" };
    }

    // 3. Single base price
    if (typeof product.base_price === "number") {
        return { label: `€${product.base_price.toFixed(2)}`, type: "single" };
    }

    return { label: "—", type: "none" };
}
