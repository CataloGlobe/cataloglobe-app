// =============================================================================
// aiUsageLog — persistenza best-effort del consumo AI (Edge-only)
// =============================================================================
//
// Helper unico chiamato dai 3 call site AI (menu-ai-import, product-ai-enrich,
// process-translation-jobs via TickDeps.logUsage) per registrare il consumo in
// ai_usage_events. Scrittura via client service_role (bypassa RLS — la tabella
// non ha policy di scrittura per design).
//
// Contratto (FASE 2 — solo logging, zero quota):
//   - MAI throw: un errore di metering non deve far fallire l'operazione AI
//     principale. Errori catturati e loggati su console, non propagati.
//   - Loggare SOLO su risposta AI valida: operazione fallita = nessun consumo
//     registrato (responsabilità del caller: chiamare dopo la validazione).
//   - Nessun controllo quota qui — l'enforcement è una fase futura, altrove.
// =============================================================================

import { PRICE_MAP_VERSION, computeCostNanoUsd } from "./aiPricing.ts";

export interface AiUsageEventInput {
    /** Tenant che ha innescato l'operazione. null solo per job di piattaforma. */
    tenantId: string | null;
    /** 'gemini' | 'deepl' (testo libero: provider futuri senza migration). */
    provider: string;
    /** Stringa modello reale, es. 'gemini-2.5-flash'. Per DeepL: 'deepl'. */
    model: string;
    /** 'menu_import' | 'product_enrich' | 'translation' */
    operation: string;
    unitKind: "tokens" | "chars";
    unitsInput?: number | null;
    unitsOutput?: number | null;
    unitsTotal?: number | null;
    /** usageMetadata Gemini completo (audit). Omesso per DeepL. */
    rawMeta?: unknown;
}

/**
 * Inserisce un evento di consumo in ai_usage_events. Best-effort: non lancia
 * mai. `supabase` deve essere un client service_role.
 */
export async function logAiUsage(
    // deno-lint-ignore no-explicit-any — client supabase-js senza Database generics (stesso pattern JobStore)
    supabase: any,
    event: AiUsageEventInput
): Promise<void> {
    try {
        const unitsInput = event.unitsInput ?? null;
        const unitsOutput = event.unitsOutput ?? null;
        const unitsTotal = event.unitsTotal ?? null;

        const cost = computeCostNanoUsd(event.model, unitsInput, unitsOutput, unitsTotal);

        const { error } = await supabase.from("ai_usage_events").insert({
            tenant_id: event.tenantId,
            provider: event.provider,
            model: event.model,
            operation: event.operation,
            unit_kind: event.unitKind,
            units_input: unitsInput,
            units_output: unitsOutput,
            units_total: unitsTotal,
            cost_nanos_usd: cost,
            price_map_version: cost !== null ? PRICE_MAP_VERSION : null,
            raw_meta: event.rawMeta ?? null
        });

        if (error) {
            console.error(
                "[aiUsageLog] insert failed",
                JSON.stringify({ operation: event.operation, provider: event.provider, message: error.message })
            );
        }
    } catch (err) {
        console.error(
            "[aiUsageLog] unexpected",
            err instanceof Error ? err.message : String(err)
        );
    }
}
