import { supabase } from "@/services/supabase/client";
import {
    resolveActivityCatalogs,
    findLayoutCatalogId,
    loadCatalogById,
    normalizeCatalog,
    type ActivityProductOverrideRow,
    type RawCatalogRow,
    type VisibilityOverrideRow
} from "./resolveActivityCatalogs";
import { getNowInRome, type RomeDateTime } from "@/services/supabase/schedulingNow";
import { resolveRulesForActivity, type VisibilityMode } from "@/services/supabase/scheduleResolver";
import { explainCatalog, type CatalogExplanation, type PriceRuleRow, type RuleRef } from "@/utils/catalogExplanation";

// ==========================================
// TYPES
// ==========================================

export type ActiveCatalogMeta = {
    activityId: string;
    catalogId: string | null;
    catalogName: string | null;
    hasActiveCatalog: boolean;
    /**
     * Prodotti rimossi dalla pagina pubblica (override realtime, mode='hide').
     * Null se il conteggio non si è caricato: non vuol dire «nessuno».
     */
    hiddenCount: number | null;
    /** Prodotti mostrati come "Non disponibile" (override realtime, mode='disable'). Null come sopra. */
    unavailableCount: number | null;
};

/**
 * Tri-state visibility for the realtime "Gestisci disponibilità" control.
 * - `visible`     → nessun override (segue la programmazione)
 * - `hidden`      → rimosso dalla pagina pubblica (visible_override=false, mode='hide')
 * - `unavailable` → mostrato come "Non disponibile" (visible_override=false, mode='disable')
 */
export type ProductVisibilityState = "visible" | "hidden" | "unavailable";

export type RenderableProduct = {
    product_id: string;
    name: string;
    category_name?: string | null;
    /** Resolved single price. Null when the product uses format pricing. */
    final_price: number | null;
    /** Minimum format price. Set when the product has PRIMARY_PRICE option groups. */
    from_price: number | null;
    /** Tri-state realtime override. `hidden` = rimosso; `unavailable` = mostrato disabilitato. */
    visibility_state: ProductVisibilityState;
    /** true quando lo stato non è `hidden` (retrocompat filtro/count). */
    is_visible: boolean; // post-scheduling + post-activity-override
};

export type RenderableCatalog = {
    catalogId: string | null;
    catalogName: string | null;
    activeSchedule: { id: string; name: string } | null;
    products: RenderableProduct[];
};

// ==========================================
// SERVICE
// ==========================================

type OverrideCounts = { hiddenCount: number; unavailableCount: number };

/**
 * Batch fetch di conteggi hidden/unavailable per più attività in UNA query
 * (`.in("activity_id", ...)`), aggregati lato client — mai una query per
 * sede. Stesso fallback di `deriveVisibilityState`: `mode` assente/'hide' →
 * hidden, 'disable' → unavailable. L'errore arriva al chiamante: un
 * conteggio mancante non è «nessuna modifica».
 */
async function getOverrideCountsForActivities(
    activityIds: string[]
): Promise<Record<string, OverrideCounts>> {
    const result: Record<string, OverrideCounts> = {};
    if (activityIds.length === 0) return result;

    const { data, error } = await supabase
        .from("activity_product_overrides")
        .select("activity_id, mode")
        .eq("visible_override", false)
        .in("activity_id", activityIds);

    if (error) throw error;

    for (const row of (data ?? []) as Array<{ activity_id: string; mode: VisibilityMode | null }>) {
        const counts = result[row.activity_id] ?? { hiddenCount: 0, unavailableCount: 0 };
        if (row.mode === "disable") counts.unavailableCount += 1;
        else counts.hiddenCount += 1;
        result[row.activity_id] = counts;
    }

    return result;
}

/**
 * «A mano» della matrice di Programmazione (§20.3): quante modifiche della
 * sede ci sono su ogni sede, tutte (nascosti, non disponibili e visibili
 * forzati, §19.5), in UNA richiesta. Le sedi senza modifiche valgono 0.
 * L'errore arriva al chiamante: un conteggio mancante non è «nessuna».
 */
export async function countManualOverridesByActivity(activityIds: string[]): Promise<Record<string, number>> {
    if (activityIds.length === 0) return {};

    const { data, error } = await supabase
        .from("activity_product_overrides")
        .select("activity_id, visible_override")
        .in("activity_id", activityIds);

    if (error) throw error;

    const counts: Record<string, number> = Object.fromEntries(activityIds.map(id => [id, 0]));
    for (const row of (data ?? []) as Array<{ activity_id: string }>) {
        counts[row.activity_id] = (counts[row.activity_id] ?? 0) + 1;
    }
    return counts;
}

/** Conteggio delle modifiche a mano non caricato: si dice, non si spaccia per zero. */
export const OVERRIDES_UNKNOWN_LABEL = "Modifiche a mano non caricate";

/**
 * Formatta il riepilogo override per card/tabella Sedi: "N nascosti, M non
 * disponibili", omettendo la parte a zero. Null se non ci sono override
 * attivi (nessuna riga renderizzata dal chiamante); `OVERRIDES_UNKNOWN_LABEL`
 * se il conteggio non si è caricato.
 */
export function formatOverrideSummary(
    hiddenCount: number | null,
    unavailableCount: number | null,
    options?: { abbreviate?: boolean }
): string | null {
    if (hiddenCount === null || unavailableCount === null) return OVERRIDES_UNKNOWN_LABEL;
    if (hiddenCount === 0 && unavailableCount === 0) return null;
    const parts: string[] = [];
    if (hiddenCount > 0) {
        parts.push(`${hiddenCount} nascost${hiddenCount === 1 ? "o" : "i"}`);
    }
    if (unavailableCount > 0) {
        parts.push(
            options?.abbreviate
                ? `${unavailableCount} non disp.`
                : `${unavailableCount} non disponibil${unavailableCount === 1 ? "e" : "i"}`
        );
    }
    return parts.join(", ");
}

/**
 * Batch fetch of active catalog metadata for multiple activities.
 *
 * Risolve tutte le sedi in parallelo e affianca, in una sola query batch, i
 * conteggi hidden/unavailable — mai una query per sede.
 *
 * `tenantId` non è un dettaglio di comodo: senza, il resolver deve chiedere al
 * DB a quale tenant appartiene ogni sede prima di poter cominciare
 * (`resolveActivityCatalogs`, pre-flight su `activities`), e quell'andata e
 * ritorno è SERIALE — blocca l'intera catena, una volta per sede. Entrambi i
 * chiamanti il tenant lo conoscono già, quindi la domanda era inutile.
 */
export async function getActiveCatalogForActivities(
    tenantId: string,
    activityIds: string[]
): Promise<Record<string, ActiveCatalogMeta>> {
    if (activityIds.length === 0) return {};

    const now = getNowInRome();

    // ── Step 1: Resolve all activities in parallel + override counts in
    //    parallelo (query indipendente, stessi activityIds) ────────────────
    const [resolvedList, overrideCounts] = await Promise.all([
        Promise.all(
            activityIds.map(async activityId => {
                try {
                    const resolved = await resolveActivityCatalogs(activityId, now, tenantId);
                    // Il catalogo risolto porta con sé il proprio nome
                    // (`ResolvedCatalog.name`): leggerlo qui evita di richiederlo
                    // di nuovo al DB per un dato che abbiamo già in memoria.
                    return {
                        activityId,
                        catalogId: resolved.catalog?.id ?? null,
                        catalogName: resolved.catalog?.name ?? null
                    };
                } catch {
                    return { activityId, catalogId: null, catalogName: null };
                }
            })
        ),
        // Un conteggio che fallisce non spegne il nome del menù: resta null
        // e la card dice che non si è caricato.
        getOverrideCountsForActivities(activityIds).catch(error => {
            console.error("[activeCatalog] override counts failed:", error);
            return null;
        })
    ]);

    // ── Step 2: Build result map ────────────────────────────────────────────
    const result: Record<string, ActiveCatalogMeta> = {};

    for (const { activityId, catalogId, catalogName } of resolvedList) {
        const counts = overrideCounts ? (overrideCounts[activityId] ?? { hiddenCount: 0, unavailableCount: 0 }) : null;
        result[activityId] = {
            activityId,
            catalogId,
            catalogName,
            hasActiveCatalog: catalogId !== null,
            hiddenCount: counts?.hiddenCount ?? null,
            unavailableCount: counts?.unavailableCount ?? null
        };
    }

    return result;
}

/**
 * Variante "leggera" di `loadCatalogById` per il drawer/tab Gestisci disponibilità:
 * stessa struttura (categorie → prodotti → varianti → option_groups), ma SENZA
 * attributes/allergens/characteristics/ingredients/notes/image_url/assignment —
 * campi non renderizzati dalla tabella di visibilità. Riusa `normalizeCatalog`
 * (stessa logica di calcolo prezzo/from_price di `loadCatalogById`, nessuna
 * duplicazione) per evitare divergenze tra le due query.
 */
async function loadCatalogForVisibilityDrawer(
    catalogId: string,
    tenantId: string
) {
    const { data, error } = await supabase
        .from("catalogs")
        .select(
            `
            id,
            name,
            categories:catalog_categories(
              id,
              name,
              level,
              sort_order,
              parent_category_id,
              products:catalog_category_products(
                id,
                sort_order,
                product_id,
                variant_product_id,
                product:products!catalog_category_products_product_id_fkey(
                  id,
                  name,
                  base_price,
                  parent_product_id,
                  product_type,
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
                  ),
                  variants:products!parent_product_id(
                    id,
                    name,
                    base_price,
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
                  )
                )
              )
            )
        `
        )
        .eq("tenant_id", tenantId)
        .eq("id", catalogId)
        .maybeSingle();

    if (error) throw error;

    return normalizeCatalog((data as unknown as RawCatalogRow | null) ?? null);
}

/**
 * Returns a simplified, flattened list of products as rendered by the V2 resolver.
 * This reflects the final deterministic state (Schedule + Activity Overrides).
 */
export async function getRenderableCatalogForActivity(
    activityId: string,
    tenantId: string
): Promise<RenderableCatalog> {
    const now = getNowInRome();
    const { catalogId, scheduleId } = await findLayoutCatalogId(activityId, now, tenantId);

    if (!catalogId) {
        return { catalogId: null, catalogName: null, activeSchedule: null, products: [] };
    }

    const [catalog, overrides] = await Promise.all([
        loadCatalogForVisibilityDrawer(catalogId, tenantId),
        getActivityProductOverrides(activityId)
    ]);

    if (!catalog) {
        return { catalogId: null, catalogName: null, activeSchedule: null, products: [] };
    }

    let activeSchedule: { id: string; name: string } | null = null;
    if (scheduleId) {
        const { data: scheduleRow } = await supabase
            .from("schedules")
            .select("id, name")
            .eq("id", scheduleId)
            .maybeSingle();
        if (scheduleRow) {
            const row = scheduleRow as { id: string; name: string };
            activeSchedule = { id: row.id, name: row.name };
        }
    }

    const products: RenderableProduct[] = [];
    for (const category of catalog.categories || []) {
        for (const p of category.products || []) {
            const override = overrides[p.id];
            const state = deriveVisibilityState(override?.visible_override, override?.mode);
            products.push({
                product_id: p.id,
                name: p.name,
                category_name: category.name,
                final_price: p.price ?? null,
                from_price: p.from_price ?? null,
                visibility_state: state,
                is_visible: state !== "hidden"
            });
        }
    }

    return {
        catalogId: catalog.id,
        catalogName: catalog.name ?? "Catalogo senza nome",
        activeSchedule,
        products
    };
}

/**
 * Sets the realtime visibility override for a product in an activity (tri-state).
 *
 * - `"visible"`     → rimuove l'override di visibilità (torna alla programmazione).
 *                     La riga viene cancellata solo se non esiste un price_override,
 *                     altrimenti si azzerano visible_override + mode preservando il prezzo.
 * - `"hidden"`      → visible_override=false, mode='hide' (rimosso dalla pagina pubblica).
 * - `"unavailable"` → visible_override=false, mode='disable' (mostrato come "Non disponibile").
 *
 * NB: il realtime (Modello A) vince sempre sulla programmazione (Modello B) — invariato.
 */
export async function updateActivityProductVisibility(
    activityId: string,
    productId: string,
    state: ProductVisibilityState
): Promise<void> {
    const { data: existing } = await supabase
        .from("activity_product_overrides")
        .select("id, visible_override, price_override, mode")
        .eq("activity_id", activityId)
        .eq("product_id", productId)
        .maybeSingle();

    // "visible" = nessun override di visibilità.
    if (state === "visible") {
        if (!existing) return;
        if (existing.price_override === null) {
            // Nessun altro override da preservare → elimina la riga.
            await supabase.from("activity_product_overrides").delete().eq("id", existing.id);
            return;
        }
        // Preserva price_override, azzera solo la visibilità.
        const { error } = await supabase
            .from("activity_product_overrides")
            .update({
                visible_override: null,
                mode: null,
                updated_at: new Date().toISOString()
            })
            .eq("id", existing.id);
        if (error) throw error;
        return;
    }

    // "hidden" | "unavailable" → visible_override=false + mode dedicato.
    const mode: VisibilityMode = state === "unavailable" ? "disable" : "hide";
    const payload = {
        activity_id: activityId,
        product_id: productId,
        visible_override: false,
        mode,
        updated_at: new Date().toISOString()
    };

    if (existing) {
        const { error } = await supabase
            .from("activity_product_overrides")
            .update(payload)
            .eq("id", existing.id);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from("activity_product_overrides")
            .insert([{ ...payload, id: crypto.randomUUID() }]);
        if (error) throw error;
    }
}

/**
 * Variante batch di `updateActivityProductVisibility`: applica lo stesso stato
 * tri-state a più prodotti con un numero costante di query (mai una per prodotto).
 *
 * - `"visible"` → 2 statement filtrati lato SQL, nessun SELECT intermedio:
 *   DELETE delle righe senza price_override + UPDATE (azzera visible_override/mode)
 *   di quelle con price_override, che resta intatto — stessa semantica
 *   preserve-price del path single-product.
 * - `"hidden"` | `"unavailable"` → SELECT delle righe esistenti + UPDATE batch
 *   + INSERT batch dei mancanti (max 3 query). Niente upsert onConflict:
 *   `id` non ha default DB, quindi il DO UPDATE riscriverebbe la PK delle
 *   righe esistenti.
 */
export async function bulkUpdateActivityProductVisibility(
    activityId: string,
    productIds: string[],
    state: ProductVisibilityState
): Promise<void> {
    if (productIds.length === 0) return;

    const nowIso = new Date().toISOString();

    if (state === "visible") {
        const { error: deleteError } = await supabase
            .from("activity_product_overrides")
            .delete()
            .eq("activity_id", activityId)
            .in("product_id", productIds)
            .is("price_override", null);
        if (deleteError) throw deleteError;

        const { error: updateError } = await supabase
            .from("activity_product_overrides")
            .update({ visible_override: null, mode: null, updated_at: nowIso })
            .eq("activity_id", activityId)
            .in("product_id", productIds)
            .not("price_override", "is", null);
        if (updateError) throw updateError;
        return;
    }

    const mode: VisibilityMode = state === "unavailable" ? "disable" : "hide";

    const { data: existingRows, error: selectError } = await supabase
        .from("activity_product_overrides")
        .select("product_id")
        .eq("activity_id", activityId)
        .in("product_id", productIds);
    if (selectError) throw selectError;

    const existingIds = new Set(
        ((existingRows ?? []) as Array<{ product_id: string }>).map(r => r.product_id)
    );
    const toUpdate = productIds.filter(id => existingIds.has(id));
    const toInsert = productIds.filter(id => !existingIds.has(id));

    if (toUpdate.length > 0) {
        const { error } = await supabase
            .from("activity_product_overrides")
            .update({ visible_override: false, mode, updated_at: nowIso })
            .eq("activity_id", activityId)
            .in("product_id", toUpdate);
        if (error) throw error;
    }

    if (toInsert.length > 0) {
        const { error } = await supabase
            .from("activity_product_overrides")
            .insert(
                toInsert.map(productId => ({
                    id: crypto.randomUUID(),
                    activity_id: activityId,
                    product_id: productId,
                    visible_override: false,
                    mode,
                    updated_at: nowIso
                }))
            );
        if (error) throw error;
    }
}

/**
 * Fetches all product overrides for a specific activity.
 */
export type ActivityProductOverride = {
    visible_override: boolean | null;
    price_override: number | null;
    mode: VisibilityMode | null;
};

export async function getActivityProductOverrides(
    activityId: string
): Promise<Record<string, ActivityProductOverride>> {
    const { data, error } = await supabase
        .from("activity_product_overrides")
        .select("product_id, visible_override, price_override, mode")
        .eq("activity_id", activityId);

    if (error) throw error;

    const map: Record<string, ActivityProductOverride> = {};
    for (const row of data || []) {
        map[row.product_id] = {
            visible_override: row.visible_override,
            price_override: row.price_override,
            mode: (row.mode as VisibilityMode | null) ?? null
        };
    }
    return map;
}

/**
 * Deriva lo stato tri-state dalla coppia (visible_override, mode).
 * Fallback allineato al resolver: `visible_override=false` + mode assente/`hide` = hidden.
 */
export function deriveVisibilityState(
    visibleOverride: boolean | null | undefined,
    mode: VisibilityMode | null | undefined
): ProductVisibilityState {
    if (visibleOverride === false) {
        return mode === "disable" ? "unavailable" : "hidden";
    }
    return "visible";
}

// ==========================================
// «COSA VEDONO I CLIENTI» (§19, milestone 7)
// ==========================================

export type CatalogExplanationData = {
    /** L'istante di Roma della lettura: la banda dice «adesso, alle HH:MM». */
    at: RomeDateTime;
    catalogId: string | null;
    catalogName: string | null;
    /** Le regole che vincono adesso, per tipo. */
    layoutRule: RuleRef | null;
    visibilityRule: RuleRef | null;
    priceRule: RuleRef | null;
    /** Esiste almeno una regola menù accesa per la sede, anche se non vince adesso. */
    hasCatalogRule: boolean;
    /** Il resolver ha qualcosa da mostrare. */
    renderable: boolean;
    /** Null senza menù. */
    explanation: CatalogExplanation | null;
};

/**
 * Cosa vedono i clienti della sede adesso, e perché (§50.20).
 *
 * Il catalogo finale è quello del resolver del frontend, la copia in SYNC con
 * l'Edge; la provenienza la ricava `explainCatalog`. Gira con le RLS di chi
 * guarda: la pagina lo chiama solo con `canExplainActivityCatalog`, perché
 * senza quei permessi le regole lette non sono tutte quelle dell'Edge.
 */
export async function getCatalogExplanation(activityId: string, tenantId: string): Promise<CatalogExplanationData> {
    const now = getNowInRome();
    const [resolved, rules] = await Promise.all([
        resolveActivityCatalogs(activityId, now, tenantId),
        resolveRulesForActivity({ supabase, activityId, tenantId, now })
    ]);

    const catalogId = rules.layout.catalogId;
    const visibilityRuleId = rules.visibilityRule?.scheduleId ?? null;
    const priceRuleId = rules.priceRuleId;
    const ruleIds = [rules.layout.scheduleId, visibilityRuleId, priceRuleId].filter((id): id is string => !!id);

    const [base, ruleNames, visibilityRows, priceRows, manual] = await Promise.all([
        catalogId ? loadCatalogById(catalogId, tenantId) : Promise.resolve(undefined),
        loadScheduleNames(ruleIds, tenantId),
        visibilityRuleId ? loadVisibilityRuleRows(visibilityRuleId, tenantId) : Promise.resolve([]),
        priceRuleId ? loadPriceRuleRows(priceRuleId, tenantId) : Promise.resolve([]),
        catalogId ? getActivityProductOverrides(activityId) : Promise.resolve<Record<string, ActivityProductOverride>>({})
    ]);

    const ref = (id: string | null): RuleRef | null => (id ? { id, name: ruleNames[id] ?? "Regola senza nome" } : null);
    const visibilityRule = ref(visibilityRuleId);
    const priceRule = ref(priceRuleId);

    const manualRows: Record<string, ActivityProductOverrideRow> = {};
    for (const [productId, row] of Object.entries(manual)) {
        manualRows[productId] = { product_id: productId, visible_override: row.visible_override, mode: row.mode };
    }

    return {
        at: now,
        catalogId: base ? catalogId : null,
        catalogName: base ? base.name || "Catalogo senza nome" : null,
        layoutRule: ref(rules.layout.scheduleId),
        visibilityRule,
        priceRule,
        hasCatalogRule: resolved.hasConfiguredCatalogRule ?? rules.layoutCandidateCount > 0,
        renderable: !!resolved.catalog,
        explanation: base
            ? explainCatalog({
                  base,
                  final: resolved.catalog,
                  visibilityRule: visibilityRule && rules.visibilityRule ? { ...visibilityRule, mode: rules.visibilityRule.mode } : null,
                  visibilityRows,
                  priceRule,
                  priceRows,
                  manual: manualRows
              })
            : null
    };
}

async function loadScheduleNames(ids: string[], tenantId: string): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const { data, error } = await supabase.from("schedules").select("id, name").eq("tenant_id", tenantId).in("id", ids);
    if (error) throw error;
    const names: Record<string, string> = {};
    for (const row of (data ?? []) as Array<{ id: string; name: string | null }>) names[row.id] = row.name ?? "";
    return names;
}

async function loadVisibilityRuleRows(scheduleId: string, tenantId: string): Promise<VisibilityOverrideRow[]> {
    const { data, error } = await supabase
        .from("schedule_visibility_overrides")
        .select("product_id, visible, mode")
        .eq("tenant_id", tenantId)
        .eq("schedule_id", scheduleId);
    if (error) throw error;
    return (data ?? []) as VisibilityOverrideRow[];
}

async function loadPriceRuleRows(scheduleId: string, tenantId: string): Promise<PriceRuleRow[]> {
    const { data, error } = await supabase
        .from("schedule_price_overrides")
        .select("product_id, option_value_id")
        .eq("tenant_id", tenantId)
        .eq("schedule_id", scheduleId);
    if (error) throw error;
    return (data ?? []) as PriceRuleRow[];
}
