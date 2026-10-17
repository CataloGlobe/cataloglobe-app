import { supabase } from "@/services/supabase/client";
import { revalidatePublicCatalogForTenant } from "@services/publicCatalog/revalidatePublicCatalog";

/**
 * L'ordine dei menù per i clienti (multi menù, passo 5): quello dei riquadri
 * di «Scegli il menu» e, a pari ora, di «Più tardi». Uno per azienda, uguale
 * in tutte le sedi (deciso da Alex il 2026-10-12). Colonna `catalogs.sort_order`
 * (mig 20261013120200), riscritta da 1 con la RPC `reorder_catalogs`
 * (mig 20261017100000).
 */

export type CatalogOrderItem = {
    id: string;
    name: string;
};

/** I menù dell'azienda nell'ordine dei clienti; a pari numero il più nuovo prima, come il trigger. */
export async function listCatalogOrder(tenantId: string): Promise<CatalogOrderItem[]> {
    const { data, error } = await supabase
        .from("catalogs")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

/** Tutti i menù dell'azienda, nell'ordine nuovo: un elenco parziale il database lo rifiuta. */
export async function reorderCatalogs(tenantId: string, catalogIds: string[]): Promise<void> {
    const { error } = await supabase.rpc("reorder_catalogs", {
        p_tenant_id: tenantId,
        p_catalog_ids: catalogIds
    });

    if (error) throw error;
    void revalidatePublicCatalogForTenant(tenantId);
}
