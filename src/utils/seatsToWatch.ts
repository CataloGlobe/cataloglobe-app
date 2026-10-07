import type { MatrixRow } from "@/utils/scheduleMatrix";

/**
 * Le sedi «da guardare» della card «Adesso» d'azienda (T9b, PG5): sospese,
 * senza menù che vince adesso, con modifiche a mano. Un motivo per sede, il
 * più grave. Il conteggio a mano mancante (null) non è un motivo.
 */
export type SeatWatchReason = "suspended" | "noMenu" | "manual";

export function seatWatchReason<R>(row: MatrixRow<R>): SeatWatchReason | null {
    if (row.suspended) return "suspended";
    if (row.cells.layout.kind !== "winner") return "noMenu";
    if ((row.manualCount ?? 0) > 0) return "manual";
    return null;
}

/** Prima le sedi da guardare, poi le altre; l'ordine dentro ciascun gruppo resta. */
export function seatsToWatchFirst<R>(rows: readonly MatrixRow<R>[]): MatrixRow<R>[] {
    const watch = rows.filter(row => seatWatchReason(row) !== null);
    const fine = rows.filter(row => seatWatchReason(row) === null);
    return [...watch, ...fine];
}

export function seatWatchLabel(reason: SeatWatchReason, catalogLabel: string): string {
    if (reason === "suspended") return "sospesa";
    if (reason === "noMenu") return `nessun ${catalogLabel.toLowerCase()} attivo`;
    return "modifiche a mano";
}
