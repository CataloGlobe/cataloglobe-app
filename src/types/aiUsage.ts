/**
 * Tipi per lo stato quota AI del ciclo di fatturazione corrente.
 *
 * Fonte: RPC `get_ai_usage_current_cycle` (FASE 4, fonte unica FE + enforcement).
 * ⚠️ I campi in nano-USD (`quotaNanosUsd`, `totalCostNanosUsd`) sono INTERNI:
 * la UI mostra SOLO percentuali e linguaggio naturale, mai costi/valute/token.
 */

export type AiUsageStatus = "ok" | "warning" | "blocked" | "not_eligible";

export interface AiUsageBreakdownItem {
    provider: string;
    /** `menu_import` | `product_enrich` | `translation` (etichette IT in utils). */
    operation: string;
    /** nano-USD — INTERNO, mai in UI. */
    costNanosUsd: number | null;
    events: number;
}

export interface AiUsageCycle {
    /** false = tenant senza diritto al servizio (canceled/unpaid). */
    eligible: boolean;
    status: AiUsageStatus;
    /** 0–100+ (null se quota non calcolabile). Interno; la UI arrotonda. */
    percent: number | null;
    /** nano-USD — INTERNO, mai in UI. */
    quotaNanosUsd: number | null;
    /** nano-USD — INTERNO, mai in UI. */
    totalCostNanosUsd: number | null;
    /** Quando la quota si azzera (= fine finestra ciclo). */
    resetAt: string | null;
    windowStart: string | null;
    windowEnd: string | null;
    breakdown: AiUsageBreakdownItem[];
}
