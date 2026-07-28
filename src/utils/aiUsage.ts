/**
 * Helper puri per la UI quota AI (FASE 5). Nessun React, testabili.
 *
 * ⚠️ Vincolo di linguaggio: mai costi/valute/token/crediti all'utente — solo
 * percentuali e linguaggio naturale. I nano-USD restano interni al tipo.
 */

import type { AiUsageCycle, AiUsageStatus } from "@/types/aiUsage";

/** Etichette IT delle operazioni AI (chiavi = `operation` del breakdown). */
export const AI_OPERATION_LABELS: Record<string, string> = {
    menu_import: "Import menù",
    product_enrich: "Descrizioni generate",
    translation: "Traduzioni"
};

/** Ordine di presentazione fisso nel "Dettaglio". */
const OPERATION_ORDER = ["menu_import", "product_enrich", "translation"];

/** Data lunga IT ("5 agosto 2026"). "—" se assente/non valida. */
export function formatResetDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Percentuale intera per la UI ("85%"). Clampa a ≥0; null (quota non
 * calcolabile, es. piano senza `ai_quota_nanos_usd_per_seat`) → "—", MAI "0%"
 * (0% legittimo solo a consumo realmente nullo con quota configurata).
 */
export function formatUsagePercent(percent: number | null): string {
    if (percent === null || !Number.isFinite(percent)) return "—";
    return `${Math.max(0, Math.round(percent))}%`;
}

export interface UsageDetailRow {
    operation: string;
    label: string;
    /** % arrotondata (larghezza barra). Mai un costo. */
    percent: number;
    /** Testo mostrato: "<1%" quando il consumo è >0 ma arrotonda a 0. */
    percentLabel: string;
}

/**
 * Voci "Dettaglio" per operazione, in percentuale della QUOTA (così sommano alla
 * percentuale complessiva). Se la quota non è calcolabile, ripiega sulla quota
 * del consumo totale. Solo operazioni note e presenti, in ordine fisso.
 *
 * Label "<1%" quando la voce ha consumo >0 ma arrotonda a 0 (evita che il totale
 * mostri 1% mentre tutte le voci mostrano 0% — numeri che non tornano). "0%" solo
 * a consumo effettivamente nullo.
 */
export function buildUsageDetail(usage: AiUsageCycle): UsageDetailRow[] {
    const denom =
        usage.quotaNanosUsd && usage.quotaNanosUsd > 0
            ? usage.quotaNanosUsd
            : usage.totalCostNanosUsd && usage.totalCostNanosUsd > 0
              ? usage.totalCostNanosUsd
              : 0;

    const byOp = new Map<string, number>();
    for (const item of usage.breakdown) {
        byOp.set(item.operation, (byOp.get(item.operation) ?? 0) + (item.costNanosUsd ?? 0));
    }

    return OPERATION_ORDER.filter(op => byOp.has(op)).map(op => {
        const cost = byOp.get(op) ?? 0;
        const percent = denom > 0 ? Math.round((cost * 100) / denom) : 0;
        const percentLabel = cost > 0 && percent === 0 ? "<1%" : `${percent}%`;
        return { operation: op, label: AI_OPERATION_LABELS[op] ?? op, percent, percentLabel };
    });
}

/**
 * Messaggio di blocco AI condiviso (generazione descrizione + import menù),
 * derivato dal `reason` dell'edge (402) e dalla data di reset. Spiega e dà la
 * data — non invita a "riprovare" qualcosa che non può riuscire.
 */
export function aiBlockMessage(reason: string | undefined, resetAt: string | null): string {
    if (reason === "not_eligible") {
        return "L'AI è disponibile con un abbonamento attivo.";
    }
    return `Hai esaurito l'AI di questo mese. Riparte il ${formatResetDate(resetAt)}.`;
}

/** true se lo stato deve mostrare la pill nell'header (solo warning/blocked). */
export function showsUsagePill(status: AiUsageStatus): boolean {
    return status === "warning" || status === "blocked";
}
