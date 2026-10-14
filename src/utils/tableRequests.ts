import { compareTableLabels, formatTableLabels } from "@/components/ui/TableAssignmentBadge/formatTableLabels";
import type { V2TableWithState } from "@/types/orders";

/**
 * Le richieste aperte dei tavoli («Conto richiesto», «Cameriere chiamato»),
 * contate dalla vista `v_tables_with_state` come per le tessere della Mappa.
 * Servono anche all'Elenco del Servizio e alle Comande, dove l'avviso di
 * `OperationalAlerts` dura pochi secondi e poi non ne resta traccia.
 */
export type TableRequests = { bill: boolean; waiter: boolean };

type CountedTable = Pick<V2TableWithState, "id" | "label" | "bill_requested_count" | "waiter_called_count">;

/** Solo i tavoli con almeno una richiesta aperta. */
export function tableRequestsById(tables: readonly CountedTable[]): Map<string, TableRequests> {
    const byId = new Map<string, TableRequests>();
    for (const t of tables) {
        const bill = t.bill_requested_count > 0;
        const waiter = t.waiter_called_count > 0;
        if (bill || waiter) byId.set(t.id, { bill, waiter });
    }
    return byId;
}

/** Le richieste di una tavolata: basta un suo tavolo. */
export function seatingRequests(tableIds: readonly string[], byId: ReadonlyMap<string, TableRequests>): TableRequests {
    let bill = false;
    let waiter = false;
    for (const id of tableIds) {
        const r = byId.get(id);
        if (!r) continue;
        bill ||= r.bill;
        waiter ||= r.waiter;
    }
    return { bill, waiter };
}

export type OpenRequest = { tableId: string; label: string; kind: "waiter" | "bill" };

/** In ordine: prima chi chiama il cameriere, poi il conto; dentro, per tavolo. */
export function openRequests(tables: readonly CountedTable[]): OpenRequest[] {
    const out: OpenRequest[] = [];
    for (const t of tables) {
        if (t.waiter_called_count > 0) out.push({ tableId: t.id, label: t.label, kind: "waiter" });
        if (t.bill_requested_count > 0) out.push({ tableId: t.id, label: t.label, kind: "bill" });
    }
    return out.sort((a, b) =>
        a.kind !== b.kind ? (a.kind === "waiter" ? -1 : 1) : compareTableLabels(a.label, b.label)
    );
}

/** «Tavolo 3: cameriere chiamato · Tavoli 5 + 7: conto richiesto». */
export function openRequestsText(requests: readonly OpenRequest[]): string {
    const parts: string[] = [];
    for (const kind of ["waiter", "bill"] as const) {
        const labels = requests.filter(r => r.kind === kind).map(r => r.label);
        if (labels.length === 0) continue;
        parts.push(`${formatTableLabels(labels)}: ${kind === "waiter" ? "cameriere chiamato" : "conto richiesto"}`);
    }
    return parts.join(" · ");
}
