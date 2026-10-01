/**
 * CRM interno (/admin/lead): locali, contatti, ingressi, storia.
 *
 * Tabelle di piattaforma `crm_*` (migration 20261001120000): niente tenant_id,
 * quindi le firme non lo prendono. Il confine di sicurezza è RLS su
 * `is_platform_admin()`, non questo file. Le scritture che toccano più righe
 * (cambio fase + evento, ingresso con regola dei doppioni) passano dalle RPC
 * `crm_*` (20261001120100), che le fanno in una transazione.
 */
import { supabase } from "@/services/supabase/client";
import type {
    CrmContact,
    CrmEvent,
    CrmIngestInput,
    CrmIngestOutcome,
    CrmIngestResult,
    CrmLead,
    CrmLostKind,
    CrmStage,
    CrmTeamMember,
    CrmVenue,
    CrmVenueDetail,
    CrmVenueListItem
} from "@/types/crm";

const VENUE_LIST_SELECT =
    "*, crm_contacts(id, name, phone_e164, email), crm_leads(id, source, received_at, ad_name)";

export async function listCrmVenues(): Promise<CrmVenueListItem[]> {
    const { data, error } = await supabase
        .from("crm_venues")
        .select(VENUE_LIST_SELECT)
        .order("last_activity_at", { ascending: false })
        .order("received_at", { referencedTable: "crm_leads", ascending: false });
    if (error) throw error;
    return (data ?? []) as CrmVenueListItem[];
}

export async function getCrmVenue(venueId: string): Promise<CrmVenueDetail> {
    const [venueRes, contactsRes, leadsRes, eventsRes] = await Promise.all([
        supabase.from("crm_venues").select("*").eq("id", venueId).single(),
        supabase
            .from("crm_contacts")
            .select("*")
            .eq("venue_id", venueId)
            .order("created_at", { ascending: true }),
        supabase
            .from("crm_leads")
            .select("*")
            .eq("venue_id", venueId)
            .order("received_at", { ascending: false }),
        supabase
            .from("crm_events")
            .select("*")
            .eq("venue_id", venueId)
            .order("created_at", { ascending: false })
    ]);
    if (venueRes.error) throw venueRes.error;
    if (contactsRes.error) throw contactsRes.error;
    if (leadsRes.error) throw leadsRes.error;
    if (eventsRes.error) throw eventsRes.error;
    return {
        venue: venueRes.data as CrmVenue,
        contacts: (contactsRes.data ?? []) as CrmContact[],
        leads: (leadsRes.data ?? []) as CrmLead[],
        events: (eventsRes.data ?? []) as CrmEvent[]
    };
}

export async function listCrmTeamMembers(): Promise<CrmTeamMember[]> {
    const { data, error } = await supabase
        .from("crm_team_members")
        .select("user_id, display_name, telegram_chat_id, is_default_assignee, receives_escalations")
        .order("display_name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as CrmTeamMember[];
}

type IngestRow = { r_lead_id: string; r_venue_id: string; r_outcome: CrmIngestOutcome };

/** Un ingresso, con la regola dei doppioni sul telefono (lato DB). */
export async function ingestCrmLead(input: CrmIngestInput): Promise<CrmIngestResult> {
    const { data, error } = await supabase.rpc("crm_ingest_lead", {
        p_source: input.source,
        p_source_ref: input.sourceRef,
        p_name: input.name,
        p_venue_name: input.venueName,
        p_phone_e164: input.phoneE164,
        p_email: input.email ?? null,
        p_city: input.city ?? null,
        p_interests: input.interests ?? [],
        p_form_answers: input.formAnswers ?? {},
        p_ad_id: input.adId ?? null,
        p_ad_name: input.adName ?? null,
        p_campaign: input.campaign ?? null,
        p_consent_at: input.consentAt ?? null,
        p_consent_text: input.consentText ?? null,
        p_received_at: input.receivedAt ?? null
    });
    if (error) throw error;
    const row = (data as IngestRow[] | null)?.[0];
    if (!row) throw new Error("crm_ingest_lead: nessuna riga");
    return { leadId: row.r_lead_id, venueId: row.r_venue_id, outcome: row.r_outcome };
}

/** Ritorna false se la carta era già lì (o non era in `expectedStage`). */
export async function moveCrmStage(
    venueId: string,
    stage: CrmStage,
    lost?: { kind: CrmLostKind; reason: string }
): Promise<boolean> {
    const { data, error } = await supabase.rpc("crm_move_stage", {
        p_venue_id: venueId,
        p_stage: stage,
        p_lost_kind: lost?.kind ?? null,
        p_lost_reason: lost?.reason ?? null
    });
    if (error) throw error;
    return data === true;
}

export async function assignCrmVenue(venueId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("crm_assign", {
        p_venue_id: venueId,
        p_user_id: userId
    });
    if (error) throw error;
    return data === true;
}

export async function addCrmNote(venueId: string, text: string): Promise<void> {
    const { error } = await supabase.rpc("crm_add_note", {
        p_venue_id: venueId,
        p_text: text
    });
    if (error) throw error;
}

// -----------------------------------------------------------------------------
// Team e Telegram
// -----------------------------------------------------------------------------

export interface CrmSettings {
    telegram_bot_username: string | null;
    whatsapp_template: string | null;
}

export async function getCrmSettings(): Promise<CrmSettings> {
    const { data, error } = await supabase
        .from("crm_settings")
        .select("telegram_bot_username, whatsapp_template")
        .eq("id", true)
        .single();
    if (error) throw error;
    return data as CrmSettings;
}

export async function updateCrmSettings(patch: Partial<CrmSettings>): Promise<void> {
    const { error } = await supabase.from("crm_settings").update(patch).eq("id", true);
    if (error) throw error;
}

/** Crea o aggiorna la propria riga del team e ritorna il token per /start. */
export async function startCrmTelegramLink(displayName: string): Promise<string> {
    const { data, error } = await supabase.rpc("crm_start_telegram_link", {
        p_display_name: displayName
    });
    if (error) throw error;
    return data as string;
}

/** Un solo assegnatario di default (indice unico parziale): prima si toglie, poi si mette. */
export async function setCrmDefaultAssignee(userId: string): Promise<void> {
    const { error: clearError } = await supabase
        .from("crm_team_members")
        .update({ is_default_assignee: false })
        .eq("is_default_assignee", true)
        .neq("user_id", userId);
    if (clearError) throw clearError;
    const { error } = await supabase
        .from("crm_team_members")
        .update({ is_default_assignee: true })
        .eq("user_id", userId);
    if (error) throw error;
}

export async function setCrmReceivesEscalations(userId: string, value: boolean): Promise<void> {
    const { error } = await supabase
        .from("crm_team_members")
        .update({ receives_escalations: value })
        .eq("user_id", userId);
    if (error) throw error;
}

// -----------------------------------------------------------------------------
// WhatsApp
// -----------------------------------------------------------------------------

/** Evento nella storia e, se la carta è in Nuovo, passaggio a Contattato. */
export async function logCrmWhatsappOpened(venueId: string, leadId?: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc("crm_log_whatsapp_opened", {
        p_venue_id: venueId,
        p_lead_id: leadId ?? null
    });
    if (error) throw error;
    return data === true;
}

// -----------------------------------------------------------------------------
// Legame con gli account CataloGlobe
// -----------------------------------------------------------------------------

export interface CrmLinkableTenant {
    id: string;
    name: string;
    subscription_status: string;
}

export interface CrmAccountSuggestion {
    id: string;
    tenant_id: string;
    reason: "email" | "name";
}

/** Aziende leggibili dagli admin di piattaforma (policy 20260828130000). */
export async function listCrmLinkableTenants(): Promise<CrmLinkableTenant[]> {
    const { data, error } = await supabase
        .from("tenants")
        .select("id, name, subscription_status")
        .is("deleted_at", null)
        .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as CrmLinkableTenant[];
}

export async function listCrmAccountSuggestions(venueId: string): Promise<CrmAccountSuggestion[]> {
    const { data, error } = await supabase
        .from("crm_account_suggestions")
        .select("id, tenant_id, reason")
        .eq("venue_id", venueId)
        .is("dismissed_at", null);
    if (error) throw error;
    return (data ?? []) as CrmAccountSuggestion[];
}

export async function dismissCrmAccountSuggestion(id: string): Promise<void> {
    const { error } = await supabase
        .from("crm_account_suggestions")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", id);
    if (error) throw error;
}

export async function linkCrmAccount(venueId: string, tenantId: string): Promise<void> {
    const { error } = await supabase.rpc("crm_link_account", {
        p_venue_id: venueId,
        p_tenant_id: tenantId
    });
    if (error) throw error;
}

export async function unlinkCrmAccount(venueId: string): Promise<void> {
    const { error } = await supabase.rpc("crm_unlink_account", { p_venue_id: venueId });
    if (error) throw error;
}
