import { supabase } from "@/services/supabase/client";

// =============================================================================
// product_pairings — abbinamenti prodotto↔prodotto (feature "Abbinamenti")
// =============================================================================
//
// Service dedicato (dominio prodotto già frammentato: productGroups.ts,
// productOptions.ts, productCharacteristics.ts, ...). Tabella tenant-scoped
// con RLS 4-policy (`tenant_id IN (SELECT get_my_tenant_ids())`).
//
// Persistenza set: RPC atomica `replace_product_pairings` (SECURITY DEFINER,
// DELETE + INSERT in una transazione, validazione tenant server-side) — stesso
// pattern di `replace_product_characteristics`. Vedi migration
// 20260705120000_replace_product_pairings_rpc.sql.
// =============================================================================

export type ProductPairing = {
    id: string;
    productId: string;
    pairedProductId: string;
    note: string | null;
    sortOrder: number;
    /**
     * Campi display dell'abbinato dal join a `products`. `null` = riga
     * degradata (abbinato non leggibile via RLS, es. residuo cross-tenant) —
     * il chiamante la mostra degradata, non crasha.
     */
    pairedProductName: string | null;
    pairedProductImageUrl: string | null;
};

export type PairingInput = {
    pairedProductId: string;
    note: string | null;
    sortOrder: number;
};

type PairedJoin = { name: string; image_url: string | null };

type PairingRow = {
    id: string;
    product_id: string;
    paired_product_id: string;
    note: string | null;
    sort_order: number;
    // Embed to-one via FK esplicita (product_pairings ha DUE FK verso products).
    paired: PairedJoin | null;
};

/**
 * Abbinamenti di un prodotto, ordinati per `sort_order`, con join a `products`
 * per i campi display dell'abbinato (name + image_url) in una sola query.
 */
export async function listPairings(
    productId: string,
    tenantId: string
): Promise<ProductPairing[]> {
    const { data, error } = await supabase
        .from("product_pairings")
        .select(
            "id, product_id, paired_product_id, note, sort_order, paired:products!product_pairings_paired_product_id_fkey(name, image_url)"
        )
        .eq("product_id", productId)
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });

    if (error) throw error;

    return (data ?? []).map(raw => {
        const row = raw as unknown as PairingRow;
        return {
            id: row.id,
            productId: row.product_id,
            pairedProductId: row.paired_product_id,
            note: row.note,
            sortOrder: row.sort_order,
            pairedProductName: row.paired?.name ?? null,
            pairedProductImageUrl: row.paired?.image_url ?? null
        };
    });
}

/**
 * Persiste l'intero set di abbinamenti di un prodotto via RPC atomica
 * `replace_product_pairings` (DELETE + INSERT in una transazione, con
 * validazione tenant server-side). `items` è la lista desiderata; l'ordine
 * array → `sortOrder`.
 *
 * Fonte di verità = RPC: dedupe, scarto self-pairing e cross-tenant guard sui
 * `paired_product_id` vivono nella funzione (confine reale, non igiene lato
 * browser). Note e sort_order modificati su righe pre-esistenti persistono
 * perché ogni save riscrive l'intero set (DELETE + INSERT). Chiamata con
 * user-client (non service_role): `auth.uid()` è NULL in service_role e la
 * guard si appoggia a `get_my_tenant_ids()` in user-context.
 */
export async function savePairings(
    tenantId: string,
    productId: string,
    items: PairingInput[]
): Promise<void> {
    const { error } = await supabase.rpc("replace_product_pairings", {
        p_tenant_id: tenantId,
        p_product_id: productId,
        p_pairings: items.map(item => ({
            paired_product_id: item.pairedProductId,
            note: item.note,
            sort_order: item.sortOrder
        }))
    });

    if (error) {
        if (error.code === "42501") throw new Error("Operazione non autorizzata");
        if (error.code === "P0002") throw new Error("Prodotto non trovato");
        throw error;
    }
}
