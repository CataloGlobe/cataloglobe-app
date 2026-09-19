import { supabase } from "@/services/supabase/client";
import type { ComandaPrintJobRow } from "@/types/orders";

/**
 * Job di stampa della comanda (`kind='comanda'`) degli ordini indicati,
 * in qualsiasi stato. Usata dal kanban "Comande" per derivare lo stato di
 * stampa per card (vedi `deriveComandaPrintStates`): `done` → "Ristampa",
 * `failed` → "Comanda non stampata" + "Riprova", `pending`/`processing` →
 * nessun pulsante (lo sweeper li chiude da solo).
 *
 * Filtro per `order_id` degli ordini a bordo: la coda e' storica e cresce
 * con la sede, leggere tutto sarebbe inutile. Gli `annullo` sono esclusi:
 * riguardano ordini gia' fuori dal kanban.
 */
export async function listComandaPrintJobsForOrders(
    tenantId: string,
    activityId: string,
    orderIds: string[]
): Promise<ComandaPrintJobRow[]> {
    if (orderIds.length === 0) return [];
    const { data, error } = await supabase
        .from("print_jobs")
        .select("id, order_id, status")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .eq("kind", "comanda")
        .in("order_id", orderIds);
    if (error) throw error;
    return (data ?? []) as ComandaPrintJobRow[];
}
