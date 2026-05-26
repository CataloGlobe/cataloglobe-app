// Server-authoritative cart validation + snapshot for the table-ordering epic.
// Used by submit-order (Edge Function, task 2.5) to turn a client-side request
// into rows ready to INSERT into `orders` + `order_items`.
//
// ⚠️ SYNC: the unit-price formula
//     unit_price = base_price (or PRIMARY_PRICE absolute_price)
//                + Σ ADDON price_modifier
// is duplicated in src/components/PublicCollectionView/CollectionView/CollectionView.tsx
// (frontend rendering, not importable from a Deno Edge Function). If the formula
// changes, update BOTH places.
//
// Pricing pipeline mirrors src/services/supabase/resolveActivityCatalogs.ts
// (lines ~1743–1790, `applyPriceOverridesToCatalog`):
//   - scheduleResolver returns the winning priceRuleId (a schedule id) only.
//   - Caller queries `schedule_price_overrides` filtered by that schedule_id.
//   - option_value_id IS NULL  → product-level override; replaces absolute_price
//                                 of every PRIMARY_PRICE value of that product.
//   - option_value_id IS NOT NULL → value-level override; replaces absolute_price
//                                 of that single value (and wins over the
//                                 product-level one).
//   - Products WITHOUT a PRIMARY_PRICE group fall back to products.base_price
//     and are NOT affected by product-level overrides (matches the rendering
//     contract: what the customer sees in the catalog is what they pay).
//
// Trust boundary: every sensitive field (tenant_id, activity_id, table_id,
// order_group_id, customer_name) is rederived from the customer_sessions row
// looked up via the JWT-validated customer_session_id. NOTHING from the client
// payload is trusted besides product_id / quantity / option ids / item_notes.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveRulesForActivity } from "./scheduleResolver.ts";
import { getNowInRome } from "./schedulingNow.ts";

// ============================================================
// Public types
// ============================================================

export interface RequestedOrderItem {
    product_id: string;
    quantity: number;
    primary_option_value_id?: string;
    addon_value_ids?: string[];
    item_notes?: string;
}

export interface OptionsSnapshotPrimary {
    group_id: string;
    group_name: string;
    value_id: string;
    value_name: string;
}

export interface OptionsSnapshotAddon {
    group_id: string;
    group_name: string;
    value_id: string;
    value_name: string;
    price_delta: number;
}

export interface OptionsSnapshot {
    primary_option: OptionsSnapshotPrimary | null;
    addons: OptionsSnapshotAddon[];
}

export interface OrderItemSnapshot {
    product_id: string;
    product_name_snapshot: string;
    unit_price_snapshot: number;
    quantity: number;
    line_total: number;
    options_snapshot: OptionsSnapshot;
    item_notes: string | null;
}

export interface ValidatedOrder {
    tenant_id: string;
    activity_id: string;
    table_id: string;
    customer_session_id: string;
    order_group_id: string | null;
    customer_name_snapshot: string | null;
    resolved_schedule_id: string | null;
    items: OrderItemSnapshot[];
    total_amount: number;
    notes: string | null;
}

export type ValidateOrderItemsErrorCode =
    | "SESSION_INVALID"
    | "EMPTY_CART"
    | "INVALID_QUANTITY"
    | "UNAVAILABLE_PRODUCTS"
    | "PRODUCT_NOT_IN_CATALOG"
    | "INVALID_OPTIONS"
    | "PRICE_MISMATCH"
    | "INTERNAL_ERROR";

export class ValidateOrderItemsError extends Error {
    readonly code: ValidateOrderItemsErrorCode;
    readonly details?: Record<string, unknown>;

    constructor(
        code: ValidateOrderItemsErrorCode,
        message: string,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "ValidateOrderItemsError";
        this.code = code;
        if (details) this.details = details;
    }
}

// ============================================================
// Internal types
// ============================================================

type GroupKind = "PRIMARY_PRICE" | "ADDON";
type PricingMode = "ABSOLUTE" | "DELTA";

interface CustomerSessionRow {
    id: string;
    tenant_id: string;
    activity_id: string;
    current_table_id: string | null;
    order_group_id: string | null;
    customer_name: string | null;
    expires_at: string;
}

interface OptionValueRow {
    id: string;
    name: string;
    absolute_price: number | null;
    price_modifier: number | null;
}

interface OptionGroupRow {
    id: string;
    name: string;
    group_kind: GroupKind;
    pricing_mode: PricingMode;
    is_required: boolean;
    max_selectable: number | null;
    values: OptionValueRow[];
}

interface ProductWithOptions {
    id: string;
    name: string;
    base_price: number | null;
    option_groups: OptionGroupRow[];
}

interface PriceOverridesForProduct {
    productLevelOverride: number | null;
    optionLevelOverrides: Map<string, number>;
}

// ============================================================
// Public entry point
// ============================================================

export async function validateAndSnapshotOrderItems(
    supabase: SupabaseClient,
    customerSessionId: string,
    requestedItems: RequestedOrderItem[],
    notes?: string
): Promise<ValidatedOrder> {
    _validateCartShape(requestedItems);

    const session = await _loadCustomerSession(supabase, customerSessionId);

    const { catalogId, priceRuleId } = await _resolveActiveCatalog(
        supabase,
        session.activity_id,
        session.tenant_id
    );

    const requestedProductIds = Array.from(new Set(requestedItems.map(i => i.product_id)));

    const catalogProductIds = await _loadCatalogProductIds(supabase, catalogId);
    const invalidProductIds = requestedProductIds.filter(id => !catalogProductIds.has(id));
    if (invalidProductIds.length > 0) {
        throw new ValidateOrderItemsError(
            "PRODUCT_NOT_IN_CATALOG",
            "Uno o più prodotti non sono nel catalogo attivo per questa sede.",
            { invalid_product_ids: invalidProductIds }
        );
    }

    await _checkAvailabilityOverrides(supabase, session.activity_id, requestedProductIds);

    const productsById = await _loadProductDetails(
        supabase,
        session.tenant_id,
        requestedProductIds
    );

    // Defensive: ensure every requested product has been resolved. A miss here
    // would mean the product row vanished between the catalog membership check
    // and the detail fetch (e.g. hard-deleted concurrently).
    for (const pid of requestedProductIds) {
        if (!productsById.has(pid)) {
            throw new ValidateOrderItemsError(
                "PRODUCT_NOT_IN_CATALOG",
                "Uno o più prodotti non sono più disponibili.",
                { invalid_product_ids: [pid] }
            );
        }
    }

    const priceOverrides = await _loadPriceOverrides(
        supabase,
        priceRuleId,
        requestedProductIds
    );

    const items: OrderItemSnapshot[] = requestedItems.map(req => {
        const product = productsById.get(req.product_id);
        if (!product) {
            // Already guarded above, but keep TypeScript happy.
            throw new ValidateOrderItemsError(
                "INTERNAL_ERROR",
                "Stato inconsistente durante la validazione."
            );
        }
        const productOverrides = priceOverrides.get(req.product_id);
        return _validateAndSnapshotItem(req, product, productOverrides);
    });

    return _assembleValidatedOrder(session, items, priceRuleId, notes);
}

// ============================================================
// Helpers
// ============================================================

function _validateCartShape(requestedItems: RequestedOrderItem[]): void {
    if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
        throw new ValidateOrderItemsError(
            "EMPTY_CART",
            "Il carrello è vuoto."
        );
    }
    for (const item of requestedItems) {
        if (
            !item ||
            typeof item.product_id !== "string" ||
            typeof item.quantity !== "number" ||
            !Number.isInteger(item.quantity)
        ) {
            throw new ValidateOrderItemsError(
                "INVALID_QUANTITY",
                "Riga ordine malformata."
            );
        }
        if (item.quantity <= 0 || item.quantity > 99) {
            throw new ValidateOrderItemsError(
                "INVALID_QUANTITY",
                "La quantità deve essere compresa tra 1 e 99.",
                { product_id: item.product_id, quantity: item.quantity }
            );
        }
    }
}

async function _loadCustomerSession(
    supabase: SupabaseClient,
    customerSessionId: string
): Promise<CustomerSessionRow> {
    const { data, error } = await supabase
        .from("customer_sessions")
        .select(
            "id, tenant_id, activity_id, current_table_id, order_group_id, customer_name, expires_at"
        )
        .eq("id", customerSessionId)
        .maybeSingle();

    if (error) {
        throw new ValidateOrderItemsError(
            "INTERNAL_ERROR",
            "Impossibile leggere la sessione cliente.",
            { db_error: error.message }
        );
    }
    if (!data) {
        throw new ValidateOrderItemsError(
            "SESSION_INVALID",
            "Sessione cliente non trovata."
        );
    }

    const row = data as CustomerSessionRow;

    if (new Date(row.expires_at).getTime() <= Date.now()) {
        throw new ValidateOrderItemsError(
            "SESSION_INVALID",
            "La sessione cliente è scaduta."
        );
    }
    if (!row.current_table_id) {
        throw new ValidateOrderItemsError(
            "SESSION_INVALID",
            "Sessione cliente senza tavolo associato."
        );
    }

    return row;
}

async function _resolveActiveCatalog(
    supabase: SupabaseClient,
    activityId: string,
    tenantId: string
): Promise<{ catalogId: string; priceRuleId: string | null }> {
    const result = await resolveRulesForActivity({
        supabase,
        activityId,
        tenantId,
        now: getNowInRome(),
        includeLayoutStyle: false,
        ruleTypes: ["layout", "price"]
    });

    if (!result.layout.catalogId) {
        throw new ValidateOrderItemsError(
            "INTERNAL_ERROR",
            "Nessun catalogo attivo per questa sede in questo momento."
        );
    }

    return {
        catalogId: result.layout.catalogId,
        priceRuleId: result.priceRuleId
    };
}

async function _loadCatalogProductIds(
    supabase: SupabaseClient,
    catalogId: string
): Promise<Set<string>> {
    // catalog_category_products links (catalog, category, product). It also
    // carries an optional `variant_product_id` for products that orderable as
    // variants — include both ids in the orderable set.
    const { data, error } = await supabase
        .from("catalog_category_products")
        .select("product_id, variant_product_id")
        .eq("catalog_id", catalogId);

    if (error) {
        throw new ValidateOrderItemsError(
            "INTERNAL_ERROR",
            "Impossibile leggere il catalogo attivo.",
            { db_error: error.message }
        );
    }

    const ids = new Set<string>();
    for (const row of (data ?? []) as Array<{ product_id: string; variant_product_id: string | null }>) {
        ids.add(row.product_id);
        if (row.variant_product_id) ids.add(row.variant_product_id);
    }
    return ids;
}

async function _checkAvailabilityOverrides(
    supabase: SupabaseClient,
    activityId: string,
    productIds: string[]
): Promise<void> {
    if (productIds.length === 0) return;
    const { data, error } = await supabase
        .from("product_availability_overrides")
        .select("product_id")
        .eq("activity_id", activityId)
        .eq("available", false)
        .in("product_id", productIds);

    if (error) {
        throw new ValidateOrderItemsError(
            "INTERNAL_ERROR",
            "Impossibile verificare la disponibilità dei prodotti.",
            { db_error: error.message }
        );
    }

    const unavailable = (data ?? []).map(row => (row as { product_id: string }).product_id);
    if (unavailable.length > 0) {
        throw new ValidateOrderItemsError(
            "UNAVAILABLE_PRODUCTS",
            "Uno o più prodotti non sono al momento disponibili.",
            { unavailable_product_ids: unavailable }
        );
    }
}

async function _loadProductDetails(
    supabase: SupabaseClient,
    tenantId: string,
    productIds: string[]
): Promise<Map<string, ProductWithOptions>> {
    if (productIds.length === 0) return new Map();

    const { data, error } = await supabase
        .from("products")
        .select(
            `
            id,
            name,
            base_price,
            tenant_id,
            option_groups:product_option_groups(
                id,
                name,
                group_kind,
                pricing_mode,
                is_required,
                max_selectable,
                values:product_option_values(
                    id,
                    name,
                    absolute_price,
                    price_modifier
                )
            )
            `
        )
        .eq("tenant_id", tenantId)
        .in("id", productIds);

    if (error) {
        throw new ValidateOrderItemsError(
            "INTERNAL_ERROR",
            "Impossibile leggere i prodotti richiesti.",
            { db_error: error.message }
        );
    }

    type RawProductRow = {
        id: string;
        name: string;
        base_price: number | string | null;
        option_groups:
            | Array<{
                id: string;
                name: string;
                group_kind: string;
                pricing_mode: string;
                is_required: boolean;
                max_selectable: number | null;
                values:
                    | Array<{
                        id: string;
                        name: string;
                        absolute_price: number | string | null;
                        price_modifier: number | string | null;
                    }>
                    | null;
            }>
            | null;
    };

    const map = new Map<string, ProductWithOptions>();
    for (const row of (data ?? []) as RawProductRow[]) {
        const optionGroups: OptionGroupRow[] = (row.option_groups ?? []).map(g => ({
            id: g.id,
            name: g.name,
            group_kind: (g.group_kind as GroupKind) ?? "ADDON",
            pricing_mode: (g.pricing_mode as PricingMode) ?? "DELTA",
            is_required: g.is_required,
            max_selectable: g.max_selectable,
            values: (g.values ?? []).map(v => ({
                id: v.id,
                name: v.name,
                absolute_price: _toNumberOrNull(v.absolute_price),
                price_modifier: _toNumberOrNull(v.price_modifier)
            }))
        }));
        map.set(row.id, {
            id: row.id,
            name: row.name,
            base_price: _toNumberOrNull(row.base_price),
            option_groups: optionGroups
        });
    }
    return map;
}

async function _loadPriceOverrides(
    supabase: SupabaseClient,
    priceRuleId: string | null,
    productIds: string[]
): Promise<Map<string, PriceOverridesForProduct>> {
    const out = new Map<string, PriceOverridesForProduct>();
    if (!priceRuleId || productIds.length === 0) return out;

    const { data, error } = await supabase
        .from("schedule_price_overrides")
        .select("product_id, option_value_id, override_price")
        .eq("schedule_id", priceRuleId)
        .in("product_id", productIds);

    if (error) {
        throw new ValidateOrderItemsError(
            "INTERNAL_ERROR",
            "Impossibile leggere gli override prezzo.",
            { db_error: error.message }
        );
    }

    type Row = { product_id: string; option_value_id: string | null; override_price: number | string };
    for (const row of (data ?? []) as Row[]) {
        let entry = out.get(row.product_id);
        if (!entry) {
            entry = { productLevelOverride: null, optionLevelOverrides: new Map() };
            out.set(row.product_id, entry);
        }
        const price = _toNumberOrNull(row.override_price) ?? 0;
        if (row.option_value_id === null) {
            entry.productLevelOverride = price;
        } else {
            entry.optionLevelOverrides.set(row.option_value_id, price);
        }
    }
    return out;
}

function _validateAndSnapshotItem(
    req: RequestedOrderItem,
    product: ProductWithOptions,
    overrides: PriceOverridesForProduct | undefined
): OrderItemSnapshot {
    const requestedAddonIds = req.addon_value_ids ?? [];
    const requestedPrimaryId = req.primary_option_value_id ?? null;
    const allRequestedValueIds = new Set<string>([
        ...(requestedPrimaryId ? [requestedPrimaryId] : []),
        ...requestedAddonIds
    ]);

    const primaryGroup = product.option_groups.find(g => g.group_kind === "PRIMARY_PRICE") ?? null;
    const addonGroups = product.option_groups.filter(g => g.group_kind === "ADDON");

    // ── Validation: required groups ──
    for (const group of product.option_groups) {
        if (!group.is_required) continue;
        const groupValueIds = new Set(group.values.map(v => v.id));
        const selectedFromGroup = Array.from(allRequestedValueIds).filter(id => groupValueIds.has(id));
        if (selectedFromGroup.length === 0) {
            throw new ValidateOrderItemsError(
                "INVALID_OPTIONS",
                `Selezione obbligatoria mancante per "${group.name}".`,
                {
                    product_id: product.id,
                    group_id: group.id,
                    reason: "required_group_not_selected"
                }
            );
        }
    }

    // ── Validation: PRIMARY_PRICE exactly one selection ──
    let primaryValue: OptionValueRow | null = null;
    if (primaryGroup) {
        if (!requestedPrimaryId) {
            throw new ValidateOrderItemsError(
                "INVALID_OPTIONS",
                `Devi scegliere "${primaryGroup.name}".`,
                {
                    product_id: product.id,
                    group_id: primaryGroup.id,
                    reason: "primary_option_missing"
                }
            );
        }
        primaryValue = primaryGroup.values.find(v => v.id === requestedPrimaryId) ?? null;
        if (!primaryValue) {
            throw new ValidateOrderItemsError(
                "INVALID_OPTIONS",
                `Variante non valida per "${primaryGroup.name}".`,
                {
                    product_id: product.id,
                    group_id: primaryGroup.id,
                    value_id: requestedPrimaryId,
                    reason: "primary_option_invalid"
                }
            );
        }
    } else if (requestedPrimaryId) {
        throw new ValidateOrderItemsError(
            "INVALID_OPTIONS",
            "Questo prodotto non prevede varianti.",
            {
                product_id: product.id,
                value_id: requestedPrimaryId,
                reason: "primary_option_unexpected"
            }
        );
    }

    // ── Validation: addons must belong to an ADDON group of this product,
    //    and max_selectable per group ──
    const valueIdToAddonGroup = new Map<string, OptionGroupRow>();
    for (const group of addonGroups) {
        for (const v of group.values) {
            valueIdToAddonGroup.set(v.id, group);
        }
    }

    const addonSelections: Array<{ group: OptionGroupRow; value: OptionValueRow }> = [];
    const addonCountByGroup = new Map<string, number>();
    for (const valueId of requestedAddonIds) {
        const group = valueIdToAddonGroup.get(valueId);
        if (!group) {
            throw new ValidateOrderItemsError(
                "INVALID_OPTIONS",
                "Modificatore non valido per questo prodotto.",
                {
                    product_id: product.id,
                    value_id: valueId,
                    reason: "addon_not_in_product"
                }
            );
        }
        const value = group.values.find(v => v.id === valueId);
        if (!value) {
            // Should be unreachable given the map population above, but
            // narrow for the type system.
            throw new ValidateOrderItemsError(
                "INVALID_OPTIONS",
                "Modificatore non valido per questo prodotto.",
                {
                    product_id: product.id,
                    value_id: valueId,
                    reason: "addon_not_in_product"
                }
            );
        }
        addonSelections.push({ group, value });
        addonCountByGroup.set(group.id, (addonCountByGroup.get(group.id) ?? 0) + 1);
    }

    for (const [groupId, count] of addonCountByGroup) {
        const group = addonGroups.find(g => g.id === groupId);
        if (!group) continue;
        if (group.max_selectable !== null && count > group.max_selectable) {
            throw new ValidateOrderItemsError(
                "INVALID_OPTIONS",
                `Hai selezionato troppe opzioni per "${group.name}" (max ${group.max_selectable}).`,
                {
                    product_id: product.id,
                    group_id: group.id,
                    selected: count,
                    max_selectable: group.max_selectable,
                    reason: "max_selectable_exceeded"
                }
            );
        }
    }

    // ── Pricing ──
    let unitPrice: number;
    if (primaryGroup && primaryValue) {
        const valueOverride = overrides?.optionLevelOverrides.get(primaryValue.id);
        const productOverride = overrides?.productLevelOverride ?? null;
        if (valueOverride !== undefined) {
            unitPrice = valueOverride;
        } else if (productOverride !== null) {
            unitPrice = productOverride;
        } else if (primaryValue.absolute_price !== null) {
            unitPrice = primaryValue.absolute_price;
        } else {
            throw new ValidateOrderItemsError(
                "INVALID_OPTIONS",
                "La variante selezionata non ha un prezzo configurato.",
                {
                    product_id: product.id,
                    value_id: primaryValue.id,
                    reason: "primary_value_missing_price"
                }
            );
        }
    } else {
        // Product without PRIMARY_PRICE: fall back to base_price. Product-level
        // price overrides are intentionally NOT applied here to match the
        // public rendering contract (resolveActivityCatalogs only patches
        // PRIMARY_PRICE values).
        if (product.base_price === null) {
            throw new ValidateOrderItemsError(
                "INVALID_OPTIONS",
                "Questo prodotto non ha un prezzo configurato.",
                {
                    product_id: product.id,
                    reason: "product_missing_base_price"
                }
            );
        }
        unitPrice = product.base_price;
    }

    const addonsSnapshot: OptionsSnapshotAddon[] = addonSelections.map(({ group, value }) => {
        const delta = value.price_modifier ?? 0;
        return {
            group_id: group.id,
            group_name: group.name,
            value_id: value.id,
            value_name: value.name,
            price_delta: delta
        };
    });

    for (const addon of addonsSnapshot) {
        unitPrice += addon.price_delta;
    }

    if (unitPrice < 0) {
        // Defensive: deltas could in theory yield a negative unit price if a
        // tenant misconfigures discounts as ADDON values. Treat as a config
        // error and refuse rather than charging a negative line.
        throw new ValidateOrderItemsError(
            "PRICE_MISMATCH",
            "Prezzo calcolato non valido per questo prodotto.",
            { product_id: product.id, computed_unit_price: unitPrice }
        );
    }

    const unitPriceRounded = _roundCurrency(unitPrice);
    const lineTotal = _roundCurrency(unitPriceRounded * req.quantity);

    const primarySnapshot: OptionsSnapshotPrimary | null =
        primaryGroup && primaryValue
            ? {
                group_id: primaryGroup.id,
                group_name: primaryGroup.name,
                value_id: primaryValue.id,
                value_name: primaryValue.name
            }
            : null;

    return {
        product_id: product.id,
        product_name_snapshot: product.name,
        unit_price_snapshot: unitPriceRounded,
        quantity: req.quantity,
        line_total: lineTotal,
        options_snapshot: {
            primary_option: primarySnapshot,
            addons: addonsSnapshot
        },
        item_notes: req.item_notes && req.item_notes.trim().length > 0 ? req.item_notes : null
    };
}

function _assembleValidatedOrder(
    session: CustomerSessionRow,
    items: OrderItemSnapshot[],
    priceRuleId: string | null,
    notes: string | undefined
): ValidatedOrder {
    const totalAmount = _roundCurrency(
        items.reduce((sum, item) => sum + item.line_total, 0)
    );

    // current_table_id is non-null here — _loadCustomerSession guarantees it.
    const tableId = session.current_table_id!;

    return {
        tenant_id: session.tenant_id,
        activity_id: session.activity_id,
        table_id: tableId,
        customer_session_id: session.id,
        order_group_id: session.order_group_id,
        customer_name_snapshot: session.customer_name,
        resolved_schedule_id: priceRuleId,
        items,
        total_amount: totalAmount,
        notes: notes && notes.trim().length > 0 ? notes : null
    };
}

// ============================================================
// Low-level utilities
// ============================================================

function _toNumberOrNull(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function _roundCurrency(value: number): number {
    // Two-decimal banker's-agnostic rounding; matches NUMERIC(10, 2) precision
    // of unit_price_snapshot / line_total / total_amount in the orders schema.
    return Math.round(value * 100) / 100;
}
