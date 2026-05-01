/**
 * Categories for `product_characteristics.category`. Mirror of DB CHECK
 * constraint values.
 */
export type ProductCharacteristicCategory =
    | "diet"
    | "spicy"
    | "origin"
    | "preparation"
    | "warning"
    | "status";

/**
 * Icon prefix used in `product_characteristics.icon` (`<prefix>:<name>`).
 *
 *   lucide → component imported from `lucide-react`
 *   custom → SVG file in `src/components/icons/characteristics/`
 *   badge  → text-based React badge component (Halal, Kosher, FIVI, 18+, …)
 *            for trademarked or culturally-textual symbols without a clean
 *            Lucide equivalent.
 */
export type ProductCharacteristicIconPrefix = "lucide" | "custom" | "badge";

/**
 * Lookup row from `product_characteristics` (cross-tenant system table).
 *
 * `vertical` is typed as `string` rather than `VerticalType` because the DB
 * CHECK accepts only the canonical 4 values (`food_beverage | retail | hotel
 * | generic`); legacy `restaurant`/`bar` tenants must map to `food_beverage`
 * before calling `listCharacteristics(vertical)`.
 *
 * `mutex_group` is `null` unless this characteristic is part of a mutually-
 * exclusive radio group (e.g. spicy_mild / spicy_medium / spicy_hot share
 * `mutex_group = "spicy"`).
 */
export type ProductCharacteristic = {
    id: string;
    code: string;
    category: ProductCharacteristicCategory;
    vertical: string;
    label_it: string;
    label_en: string;
    icon: string;
    sort_order: number;
    mutex_group: string | null;
    dietary_claim: boolean;
    created_at: string;
};

/**
 * Join row from `product_characteristic_assignments` (tenant-scoped).
 * Mirrors the DB shape. Service consumers usually receive
 * `ResolvedProductCharacteristic` instead via batch fetches.
 */
export type ProductCharacteristicAssignment = {
    tenant_id: string;
    product_id: string;
    characteristic_id: string;
    created_at: string;
};

/**
 * Frontend-facing shape returned by `getProductsCharacteristics` (batch).
 * Flattened with the most commonly-needed fields from the lookup row joined
 * in. Mirror of `ResolvedProductAllergen` pattern.
 */
export type ResolvedProductCharacteristic = {
    characteristic_id: string;
    code: string;
    label_it: string;
    icon: string;
    category: ProductCharacteristicCategory;
};
