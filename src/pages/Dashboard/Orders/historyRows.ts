import type { V2OrderWithItems } from "@/types/orders";
import type { HistoryRow } from "./historyColumns";

/**
 * Riga Storico con gli storni figli agganciati. `storni` vive qui (non in
 * `HistoryRow`): il rowWrapper li rende come sotto-righe DENTRO il blocco
 * del padre.
 */
export type HistoryRowWithStorni = HistoryRow & { storni?: HistoryRow[] };

export type HistoryFilter = "all" | "delivered" | "cancelled";

/**
 * Una riga per comanda: il padre porta i suoi storni (`storni`), il netto
 * (`netTotal`) e `rectified`. Calcolato sull'insieme COMPLETO (prima dei
 * segmenti), così il padre conosce i suoi storni anche in «Serviti». Uno
 * storno il cui padre non è nell'insieme (padre servito ieri, storno oggi)
 * resta una riga a sé, non si perde. Ordine: il più recente in cima; per un
 * padre rettificato conta il più recente fra lui e i suoi storni.
 */
export function annotateHistory(orders: readonly V2OrderWithItems[]): HistoryRowWithStorni[] {
    const stornoByParent = new Map<string, V2OrderWithItems[]>();
    for (const o of orders) {
        if (o.is_rectification && o.parent_order_id) {
            const arr = stornoByParent.get(o.parent_order_id);
            if (arr) arr.push(o);
            else stornoByParent.set(o.parent_order_id, [o]);
        }
    }

    const groupTime = (o: V2OrderWithItems): number => new Date(o.updated_at).getTime();
    const parents = orders.filter(o => !o.is_rectification);
    const parentIds = new Set(parents.map(p => p.id));

    const rows: HistoryRowWithStorni[] = parents.map(p => {
        const children = (stornoByParent.get(p.id) ?? [])
            .slice()
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (children.length === 0) return p;
        const net = p.total_amount - children.reduce((s, c) => s + c.total_amount, 0);
        return { ...p, rectified: true, netTotal: net, storni: children };
    });

    for (const o of orders) {
        if (o.is_rectification && (!o.parent_order_id || !parentIds.has(o.parent_order_id))) {
            rows.push(o);
        }
    }

    const rowTime = (r: HistoryRowWithStorni): number => Math.max(groupTime(r), ...(r.storni ?? []).map(groupTime));
    return rows.sort((a, b) => rowTime(b) - rowTime(a));
}

/** I segmenti dello Storico. «Serviti» non conta gli storni orfani. */
export function filterHistory(rows: readonly HistoryRowWithStorni[], filter: HistoryFilter): HistoryRowWithStorni[] {
    if (filter === "delivered") return rows.filter(o => o.status === "delivered" && !o.is_rectification);
    if (filter === "cancelled") return rows.filter(o => o.status === "cancelled");
    return [...rows];
}
