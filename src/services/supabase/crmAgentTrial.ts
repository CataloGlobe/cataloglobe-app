/**
 * Agente WhatsApp in prova (F1-3): interruttori, contatori e bozze aperte per
 * la pagina Agenti. Le bozze si decidono su Telegram (crm-telegram-webhook);
 * qui si leggono soltanto. Tabelle in migration 20261004010000.
 */
import { supabase } from "@/services/supabase/client";
import type { CrmAgentDraftRow, CrmAgentTrialSettings, CrmAgentTrust } from "@/types/crm";

export async function getCrmAgentTrialSettings(): Promise<CrmAgentTrialSettings> {
    const { data, error } = await supabase
        .from("crm_settings")
        .select("agent_replies_on, agent_followups_on")
        .eq("id", true)
        .single();
    if (error) throw error;
    return data as CrmAgentTrialSettings;
}

export async function updateCrmAgentTrialSettings(patch: Partial<CrmAgentTrialSettings>): Promise<void> {
    const { error } = await supabase.from("crm_settings").update(patch).eq("id", true);
    if (error) throw error;
}

export async function listCrmAgentTrust(): Promise<CrmAgentTrust[]> {
    const { data, error } = await supabase.from("crm_agent_trust").select("*").order("kind");
    if (error) throw error;
    return (data ?? []) as CrmAgentTrust[];
}

type DraftRow = Omit<CrmAgentDraftRow, "venue_name"> & { crm_venues: { name: string } | null };

/** Bozze aperte e le ultime decise, dalla più recente. */
export async function listCrmAgentDrafts(limit = 20): Promise<CrmAgentDraftRow[]> {
    const { data, error } = await supabase
        .from("crm_agent_drafts")
        .select("id, created_at, venue_id, kind, status, reason, proposed_text, final_text, decided_at, crm_venues(name)")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return ((data ?? []) as unknown as DraftRow[]).map(({ crm_venues, ...row }) => ({
        ...row,
        venue_name: crm_venues?.name ?? "Locale"
    }));
}
