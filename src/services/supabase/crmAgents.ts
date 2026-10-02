/**
 * Agenti del CRM (/admin/agenti): pausa degli agenti, spesa AI, modelli per ruolo,
 * regole del brand, diario delle decisioni.
 *
 * Tabelle di piattaforma (migration 20261002160000): niente tenant_id, il
 * confine è RLS su `is_platform_admin()`. Chi ha agito lo scrivono i trigger
 * dal JWT, mai il client: qui si passano solo le scelte.
 */
import { supabase } from "@/services/supabase/client";
import type {
    CrmAgentCheckResult,
    CrmAgentDecision,
    CrmAgentSettings,
    CrmAiRole,
    CrmAiSpend,
    CrmBrandRules
} from "@/types/crm";

const AGENT_SETTINGS_SELECT =
    "brake_on, brake_reason, brake_source, brake_changed_at, brake_changed_by, ai_month_cap_usd, ai_day_cap_usd, ai_model_conversation, ai_model_reviewer, ai_model_sensitive, ai_model_gea";

export async function getCrmAgentSettings(): Promise<CrmAgentSettings> {
    const { data, error } = await supabase.from("crm_settings").select(AGENT_SETTINGS_SELECT).eq("id", true).single();
    if (error) throw error;
    const row = data as CrmAgentSettings;
    // numeric arriva come stringa da PostgREST.
    return { ...row, ai_month_cap_usd: Number(row.ai_month_cap_usd), ai_day_cap_usd: Number(row.ai_day_cap_usd) };
}

export type CrmAgentSettingsPatch = Partial<
    Pick<
        CrmAgentSettings,
        | "ai_month_cap_usd"
        | "ai_day_cap_usd"
        | "ai_model_conversation"
        | "ai_model_reviewer"
        | "ai_model_sensitive"
        | "ai_model_gea"
    >
>;

export async function updateCrmAgentSettings(patch: CrmAgentSettingsPatch): Promise<void> {
    const { error } = await supabase.from("crm_settings").update(patch).eq("id", true);
    if (error) throw error;
}

/** Mette in pausa o riattiva gli agenti; false se era già così. */
export async function setCrmBrake(on: boolean, reason: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc("crm_set_brake", { p_on: on, p_reason: reason });
    if (error) throw error;
    return data === true;
}

type SpendRow = { r_day_usd: number | string; r_month_usd: number | string; r_day_cap: number | string; r_month_cap: number | string };

export async function getCrmAiSpend(): Promise<CrmAiSpend> {
    const { data, error } = await supabase.rpc("crm_ai_spend");
    if (error) throw error;
    const row = (data as SpendRow[] | null)?.[0];
    if (!row) throw new Error("crm_ai_spend: nessuna riga");
    return {
        dayUsd: Number(row.r_day_usd),
        monthUsd: Number(row.r_month_usd),
        dayCap: Number(row.r_day_cap),
        monthCap: Number(row.r_month_cap)
    };
}

export async function listCrmAgentDecisions(limit = 50): Promise<CrmAgentDecision[]> {
    const { data, error } = await supabase
        .from("crm_agent_decisions")
        .select("id, created_at, actor, actor_user_id, action, reason, venue_id, lead_id, review_outcome, decided_by, decided_at, payload")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []) as CrmAgentDecision[];
}

export async function listCrmBrandRules(): Promise<CrmBrandRules[]> {
    const { data, error } = await supabase
        .from("crm_brand_rules")
        .select("*")
        .order("version", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CrmBrandRules[];
}

/** Nuova versione in bozza; ritorna il numero. */
export async function proposeCrmBrandRules(body: string, note: string | null): Promise<number> {
    const { data, error } = await supabase.rpc("crm_propose_brand_rules", { p_body: body, p_note: note });
    if (error) throw error;
    return data as number;
}

export async function approveCrmBrandRules(version: number): Promise<void> {
    const { error } = await supabase.rpc("crm_approve_brand_rules", { p_version: version });
    if (error) throw error;
}

export async function discardCrmBrandRules(version: number): Promise<void> {
    const { error } = await supabase.rpc("crm_discard_brand_rules", { p_version: version });
    if (error) throw error;
}

/** Prova di collegamento a Claude col modello del ruolo (edge crm-agent-check). */
export async function checkCrmAgent(role: CrmAiRole): Promise<CrmAgentCheckResult> {
    const { data, error } = await supabase.functions.invoke("crm-agent-check", { body: { role } });
    if (error) throw error;
    return data as CrmAgentCheckResult;
}
