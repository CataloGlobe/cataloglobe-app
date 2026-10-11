import type { V2OrderWithItems } from "@/types/orders";

const COLUMN_ORDER = ["submitted", "acknowledged", "ready"] as const;

/**
 * Le comande nell'ordine in cui le legge la board: Nuove, In lavorazione,
 * Pronte, e in ogni corsia la più nuova in cima (come `OrdersKanban`). Serve
 * alle frecce ↑ ↓ del dettaglio accanto (D131).
 */
export function boardOrder(orders: V2OrderWithItems[]): V2OrderWithItems[] {
    return COLUMN_ORDER.flatMap(status =>
        orders
            .filter(o => o.status === status)
            .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    );
}
