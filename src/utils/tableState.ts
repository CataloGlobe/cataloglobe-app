import type { V2TableWithState } from "@/types/orders";

export type TableStatus = "free" | "occupied" | "maintenance";

/**
 * Stato categorico derivato dai contatori della view `v_tables_with_state`.
 *
 * Predicato "occupied" compound: il tavolo conta come occupato se ha almeno
 * una sessione attiva, OPPURE almeno un ordine non-terminale, OPPURE un
 * order_group aperto. La sola `active_sessions_count` lascerebbe falsi-liberi
 * in scenari di drift (sentinel staff scaduta con ordine ancora attivo,
 * order_group orfano post-cleanup parziale).
 */
export function deriveTableStatus(
    t: Pick<
        V2TableWithState,
        "maintenance_mode" | "active_sessions_count" | "open_orders_count" | "open_groups_count"
    >
): TableStatus {
    if (t.maintenance_mode) return "maintenance";
    if (
        t.active_sessions_count > 0 ||
        t.open_orders_count > 0 ||
        t.open_groups_count > 0
    ) {
        return "occupied";
    }
    return "free";
}
