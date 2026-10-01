/**
 * CRM interno (/admin/lead). Tabelle `crm_*`, migration 20261001120000.
 * Tabelle di piattaforma: niente tenant_id, accesso solo agli admin di
 * piattaforma (RLS su `is_platform_admin()`).
 */

export const CRM_STAGES = [
    "nuovo",
    "contattato",
    "in_conversazione",
    "appuntamento",
    "chiamata_fatta",
    "in_prova",
    "cliente_pagante",
    "perso"
] as const;

export type CrmStage = (typeof CRM_STAGES)[number];

export type CrmLostKind = "obiezione" | "stop";

export type CrmLeadSource = "landing" | "meta_form" | "whatsapp" | "manuale";

export type CrmEventType =
    | "lead_in"
    | "lead_returned"
    | "assigned"
    | "stage_changed"
    | "whatsapp_opened"
    | "note"
    | "account_linked"
    | "escalated";

export type CrmIngestOutcome = "created" | "returned" | "duplicate";

export interface CrmTeamMember {
    user_id: string;
    display_name: string;
    telegram_chat_id: number | null;
    is_default_assignee: boolean;
    receives_escalations: boolean;
}

export interface CrmContact {
    id: string;
    venue_id: string;
    name: string;
    phone_e164: string | null;
    email: string | null;
    role: string | null;
    created_at: string;
}

export interface CrmLead {
    id: string;
    venue_id: string;
    contact_id: string | null;
    source: CrmLeadSource;
    source_ref: string | null;
    ad_id: string | null;
    ad_name: string | null;
    campaign: string | null;
    form_answers: Record<string, unknown>;
    interests: string[];
    consent_at: string | null;
    consent_text: string | null;
    received_at: string;
    notified_at: string | null;
}

export interface CrmEvent {
    id: string;
    created_at: string;
    venue_id: string;
    lead_id: string | null;
    type: CrmEventType;
    actor_user_id: string | null;
    payload: Record<string, unknown>;
}

export interface CrmVenue {
    id: string;
    created_at: string;
    updated_at: string;
    name: string;
    city: string | null;
    stage: CrmStage;
    lost_kind: CrmLostKind | null;
    lost_reason: string | null;
    assigned_to: string | null;
    tenant_id: string | null;
    link_source: "phone_auto" | "manual" | null;
    referred_by: string | null;
    stage_changed_at: string;
    first_contacted_at: string | null;
    last_activity_at: string;
}

/** Riga dell'elenco: il locale col suo primo contatto e gli ingressi. */
export interface CrmVenueListItem extends CrmVenue {
    crm_contacts: Pick<CrmContact, "id" | "name" | "phone_e164" | "email">[];
    crm_leads: Pick<CrmLead, "id" | "source" | "received_at" | "ad_name">[];
}

export interface CrmVenueDetail {
    venue: CrmVenue;
    contacts: CrmContact[];
    leads: CrmLead[];
    events: CrmEvent[];
}

/** Argomenti di `crm_ingest_lead` (senza prefisso p_). */
export interface CrmIngestInput {
    source: CrmLeadSource;
    sourceRef: string | null;
    name: string;
    venueName: string;
    phoneE164: string;
    email?: string | null;
    city?: string | null;
    interests?: string[];
    formAnswers?: Record<string, string>;
    adId?: string | null;
    adName?: string | null;
    campaign?: string | null;
    consentAt?: string | null;
    consentText?: string | null;
    receivedAt?: string | null;
}

export interface CrmIngestResult {
    leadId: string;
    venueId: string;
    outcome: CrmIngestOutcome;
}
