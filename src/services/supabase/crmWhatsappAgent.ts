/**
 * Connettore WhatsApp Web del CRM (F1-2): conversazione nella scheda del
 * lead, «La prendo io», stato del canale e impostazioni nella pagina Agenti.
 *
 * Tabelle di piattaforma (migration 20261002220000): niente tenant_id, il
 * confine è RLS su `is_platform_admin()`. I messaggi li scrive l'edge
 * `crm-wa-worker`; da qui si può solo annullare un messaggio in coda.
 */
import { supabase } from "@/services/supabase/client";
import type { CrmMessage, CrmWaChannel, CrmWaSettings } from "@/types/crm";

const MESSAGE_SELECT =
    "id, created_at, venue_id, contact_id, lead_id, direction, author, kind, body, purpose, status, status_reason, sent_at, appointment_id";

/** Gli ultimi messaggi del locale, dal più vecchio. */
export async function listCrmMessages(venueId: string, limit = 100): Promise<CrmMessage[]> {
    const { data, error } = await supabase
        .from("crm_messages")
        .select(MESSAGE_SELECT)
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return ((data ?? []) as CrmMessage[]).reverse();
}

/** I messaggi di tutti i locali dal momento dato, dal più recente (Home: «Da stamattina», «Caldi adesso»). */
export async function listCrmMessagesSince(sinceIso: string, limit = 1000): Promise<CrmMessage[]> {
    const { data, error } = await supabase
        .from("crm_messages")
        .select(MESSAGE_SELECT)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []) as CrmMessage[];
}

/** «La prendo io» (true) o «Ridalla all'agente» (false); false se era già così. */
export async function setCrmAgentHold(venueId: string, hold: boolean): Promise<boolean> {
    const { data, error } = await supabase.rpc("crm_set_agent_hold", { p_venue_id: venueId, p_hold: hold });
    if (error) throw error;
    return data === true;
}

/** Annulla un messaggio ancora in coda; false se nel frattempo è partito. */
export async function cancelCrmMessage(messageId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("crm_wa_cancel_message", { p_message_id: messageId });
    if (error) throw error;
    return data === true;
}

/** «Riprova» su un primo messaggio fallito; false se non era più fallito. */
export async function retryCrmMessage(messageId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("crm_wa_retry_message", { p_message_id: messageId });
    if (error) throw error;
    return data === true;
}

export async function getCrmWaChannel(): Promise<CrmWaChannel | null> {
    const { data, error } = await supabase
        .from("crm_wa_channel")
        .select("last_heartbeat_at, wa_state, wa_state_detail, wa_state_at, worker_version, failures_in_row, next_send_at, silent_alerted_at")
        .eq("id", true)
        .maybeSingle();
    if (error) throw error;
    return (data as CrmWaChannel | null) ?? null;
}

export async function getCrmWaSettings(): Promise<CrmWaSettings> {
    const { data, error } = await supabase
        .from("crm_settings")
        .select("wa_first_message, wa_test_only, wa_test_numbers")
        .eq("id", true)
        .single();
    if (error) throw error;
    return data as CrmWaSettings;
}

export async function updateCrmWaSettings(patch: Partial<CrmWaSettings>): Promise<void> {
    const { error } = await supabase.from("crm_settings").update(patch).eq("id", true);
    if (error) throw error;
}

/** Messaggi dell'agente in coda adesso (tutti i locali). */
export async function countCrmQueuedMessages(): Promise<number> {
    const { count, error } = await supabase
        .from("crm_messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued");
    if (error) throw error;
    return count ?? 0;
}
