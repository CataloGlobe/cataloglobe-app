import { supabase } from "@/services/supabase/client";

/**
 * Ordini con almeno una comanda che non uscira' mai (job `kind='comanda'`
 * in stato `failed`, cap tentativi esaurito lato sweeper). Usata dal kanban
 * "Comande" per il badge "Comanda non stampata": lo staff deve avvisare la
 * cucina a voce, la comanda non verra' ritentata.
 *
 * Solo `failed`: un job `pending`/`processing` sta ancora ritentando (si
 * risolve entro il ciclo dello sweeper o diventa `failed`), segnalarlo
 * sarebbe rumore. Gli `annullo` riguardano ordini gia' fuori dal kanban.
 */
export async function listFailedComandaOrderIds(
    tenantId: string,
    activityId: string
): Promise<Set<string>> {
    const { data, error } = await supabase
        .from("print_jobs")
        .select("order_id")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .eq("kind", "comanda")
        .eq("status", "failed");
    if (error) throw error;
    return new Set((data ?? []).map(row => (row as { order_id: string }).order_id));
}
