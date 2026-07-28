/**
 * Service layer per la quota AI del ciclo corrente (FASE 5, solo lettura).
 *
 * Chiama la RPC `get_ai_usage_current_cycle` con la SESSIONE UTENTE (client
 * standard): la RPC fa il proprio membership check interno via
 * `get_my_tenant_ids()`, quindi ogni tenant legge solo il proprio stato.
 * Nessuna scrittura, nessuna modifica a RPC/edge (quella è FASE 4).
 */

import { supabase } from "@/services/supabase/client";
import type { AiUsageBreakdownItem, AiUsageCycle, AiUsageStatus } from "@/types/aiUsage";

/** Forma grezza della riga RPC (snake_case), prima del mapping camelCase. */
interface RawRow {
    eligible: boolean | null;
    window_start: string | null;
    window_end: string | null;
    window_source: string | null;
    total_cost_nanos_usd: number | null;
    events_count: number | null;
    breakdown: unknown;
    quota_nanos_usd: number | null;
    percent: number | string | null;
    status: string | null;
    reset_at: string | null;
}

/**
 * Stato quota AI del ciclo corrente per il tenant. Ritorna `null` se la RPC non
 * restituisce righe (difensivo: la RPC ritorna sempre una riga sui path validi).
 */
export async function getAiUsageCurrentCycle(tenantId: string): Promise<AiUsageCycle | null> {
    const { data, error } = await supabase.rpc("get_ai_usage_current_cycle", {
        p_tenant_id: tenantId
    });
    if (error) throw error;

    const rows = data as RawRow[] | RawRow | null;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;
    return mapRow(row);
}

function mapRow(row: RawRow): AiUsageCycle {
    const breakdown: AiUsageBreakdownItem[] = Array.isArray(row.breakdown)
        ? (row.breakdown as Array<Record<string, unknown>>).map(b => ({
              provider: typeof b.provider === "string" ? b.provider : "",
              operation: typeof b.operation === "string" ? b.operation : "",
              costNanosUsd: typeof b.cost_nanos_usd === "number" ? b.cost_nanos_usd : null,
              events: typeof b.events === "number" ? b.events : 0
          }))
        : [];

    const rawPercent =
        row.percent === null || row.percent === undefined
            ? null
            : typeof row.percent === "string"
              ? Number(row.percent)
              : row.percent;
    const percent = rawPercent !== null && Number.isFinite(rawPercent) ? rawPercent : null;

    return {
        eligible: row.eligible === true,
        status: (row.status ?? "ok") as AiUsageStatus,
        percent,
        quotaNanosUsd: row.quota_nanos_usd ?? null,
        totalCostNanosUsd: row.total_cost_nanos_usd ?? null,
        resetAt: row.reset_at ?? row.window_end ?? null,
        windowStart: row.window_start ?? null,
        windowEnd: row.window_end ?? null,
        breakdown
    };
}
