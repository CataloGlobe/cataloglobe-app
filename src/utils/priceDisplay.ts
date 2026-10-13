import { resolvePriceSummary } from "@/utils/priceSummary";
import { formatPrice } from "@/utils/formatCurrency";

/**
 * Unified product price display utility.
 *
 * Rule:
 *  - 1 active price  → "2,90 €" (D166: all'italiana)
 *  - Multiple prices → "da 2,90 €"
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
        return { label: `da ${formatPrice(product.from_price)}`, type: "multiple" };
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
        return { label: formatPrice(summary.min), type: "single" };
    }
    if (summary.kind === "multi" && summary.min !== null) {
        return { label: `da ${formatPrice(summary.min)}`, type: "multiple" };
    }

    // 3. Single base price
    if (typeof product.base_price === "number") {
        return { label: formatPrice(product.base_price), type: "single" };
    }

    return { label: "—", type: "none" };
}
