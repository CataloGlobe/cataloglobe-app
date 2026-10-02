// @ts-nocheck
// =============================================================================
// crmClaude — l'unica strada da cui gli agenti del CRM chiamano Claude
// =============================================================================
//
// Ogni chiamata, nell'ordine:
//   1. crm_ai_gate(ruolo): modello del ruolo da crm_settings; niente chiamata
//      sopra un tetto di spesa, né col freno a mano (tranne Gea, che risponde
//      al team e non scrive ai lead; e la prova di collegamento da /admin,
//      `ignoreBrake`);
//   2. modello senza prezzo nel listino (crmAi.ts) → niente chiamata: il
//      tetto non potrebbe contarla;
//   3. Messages API con timeout; regole e contesto fisso in cache;
//   4. crm_record_ai_usage: token e costo, anche per le chiamate fallite
//      (costo 0). Se ritorna un avviso (80% o tetto raggiunto, freno già
//      tirato dal database) lo manda su Telegram a tutto il team collegato.
//
// Non lancia: ritorna `{ ok: false, reason }` e chi chiama decide (la bozza
// resta da fare a mano, il lead resta in coda).
// Il client `supabase` deve essere service role. Env: CRM_ANTHROPIC_API_KEY,
// TELEGRAM_BOT_TOKEN (facoltativo: senza, gli avvisi restano nel diario).
// =============================================================================

import { telegramCall } from "./telegramApi.ts";
import {
    buildClaudeRequest,
    claudeCostUsd,
    CRM_AI_PRICE_VERSION,
    isPricedModel,
    parseClaudeResponse,
    spendAlertMessage,
    unrecordedCostMessage
} from "./crmAi.ts";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 60_000;

export interface CrmClaudeCall {
    role: "conversation" | "reviewer" | "sensitive" | "gea";
    system: string[];
    messages: { role: "user" | "assistant"; content: string }[];
    maxTokens: number;
    decisionId?: string | null;
    venueId?: string | null;
    timeoutMs?: number;
    /** Solo per la prova di collegamento da /admin: non scrive a nessun lead. */
    ignoreBrake?: boolean;
}

export type CrmClaudeResult =
    | {
          ok: true;
          model: string;
          text: string;
          stopReason: string | null;
          costUsd: number;
          usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
      }
    | {
          ok: false;
          reason: "not_configured" | "brake" | "day_cap" | "month_cap" | "unpriced_model" | "api_error" | "gate_error";
          model?: string;
          detail?: string;
      };

async function notifyTeam(supabase, text: string): Promise<void> {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) return;
    const { data: team, error } = await supabase
        .from("crm_team_members")
        .select("telegram_chat_id")
        .not("telegram_chat_id", "is", null);
    if (error) {
        console.error("crmClaude: team non letto per l'avviso", error.code);
        return;
    }
    for (const member of team ?? []) {
        const result = await telegramCall(token, "sendMessage", {
            chat_id: member.telegram_chat_id,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true
        });
        if (!result.ok) console.warn("crmClaude: avviso non consegnato", result.description);
    }
}

async function brakeOnUnrecordedCost(supabase, costUsd: number): Promise<void> {
    const { data: changed, error } = await supabase.rpc("crm_set_brake", {
        p_on: true,
        p_reason: "Un costo di Claude non è stato registrato: il tetto di spesa non lo conta.",
        p_source: "system"
    });
    if (error) {
        console.error("crmClaude: freno non tirato dopo un costo non registrato", error.code, error.message);
        return;
    }
    if (!changed) return; // già tirato: avviso già partito o freno messo da altri
    await notifyTeam(supabase, unrecordedCostMessage(costUsd));
}

async function record(supabase, call: CrmClaudeCall, model: string, values): Promise<void> {
    const { data: alert, error } = await supabase.rpc("crm_record_ai_usage", {
        p_role: call.role,
        p_model: model,
        p_input_tokens: values.usage.inputTokens,
        p_output_tokens: values.usage.outputTokens,
        p_cache_read_tokens: values.usage.cacheReadTokens,
        p_cache_write_tokens: values.usage.cacheWriteTokens,
        p_cost_usd: values.costUsd,
        p_price_version: CRM_AI_PRICE_VERSION,
        p_ok: values.ok,
        p_request_id: values.requestId,
        p_decision_id: call.decisionId ?? null,
        p_venue_id: call.venueId ?? null
    });
    if (error) {
        console.error("crmClaude: costo non registrato", error.code, error.message);
        // Chiamata pagata ma non contata: il tetto non la vede. Meglio agenti
        // fermi che spesa fuori controllo: freno tirato e team avvisato.
        if (values.costUsd > 0) await brakeOnUnrecordedCost(supabase, values.costUsd);
        return;
    }
    if (!alert) return;

    const { data: spend } = await supabase.rpc("crm_ai_spend");
    const row = spend?.[0];
    if (!row) return;
    await notifyTeam(
        supabase,
        spendAlertMessage(alert, {
            dayUsd: Number(row.r_day_usd),
            monthUsd: Number(row.r_month_usd),
            dayCap: Number(row.r_day_cap),
            monthCap: Number(row.r_month_cap)
        })
    );
}

const ZERO = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export async function callCrmClaude(supabase, call: CrmClaudeCall): Promise<CrmClaudeResult> {
    const apiKey = Deno.env.get("CRM_ANTHROPIC_API_KEY");
    if (!apiKey) return { ok: false, reason: "not_configured" };

    const { data: gate, error: gateError } = await supabase.rpc("crm_ai_gate", { p_role: call.role });
    const row = gate?.[0];
    if (gateError || !row) {
        return { ok: false, reason: "gate_error", detail: gateError?.message };
    }
    const model = row.r_model;
    if (!row.r_allowed && !(row.r_reason === "brake" && call.ignoreBrake)) {
        return { ok: false, reason: row.r_reason, model };
    }
    if (!isPricedModel(model)) return { ok: false, reason: "unpriced_model", model };

    let res: Response;
    let body: unknown;
    try {
        res = await fetch(API_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": API_VERSION
            },
            body: JSON.stringify(buildClaudeRequest({ ...call, model })),
            signal: AbortSignal.timeout(call.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        });
        body = await res.json().catch(() => ({}));
    } catch (err) {
        await record(supabase, call, model, { ok: false, usage: ZERO, costUsd: 0, requestId: null });
        return { ok: false, reason: "api_error", model, detail: err instanceof Error ? err.name : "network_error" };
    }

    if (!res.ok) {
        await record(supabase, call, model, { ok: false, usage: ZERO, costUsd: 0, requestId: null });
        const type = body?.error?.type ?? "errore";
        return { ok: false, reason: "api_error", model, detail: `${res.status} ${type}` };
    }

    const reply = parseClaudeResponse(body);
    const costUsd = claudeCostUsd(model, reply.usage) ?? 0;
    await record(supabase, call, model, { ok: true, usage: reply.usage, costUsd, requestId: reply.id });
    return { ok: true, model, text: reply.text, stopReason: reply.stopReason, costUsd, usage: reply.usage };
}
