/**
 * CRM interno (/admin/lead). Tabelle `crm_*`, migration 20261001120000.
 * Tabelle di piattaforma: niente tenant_id, accesso solo agli admin di
 * piattaforma (RLS su `is_platform_admin()`).
 */

import type { CrmBillingInterval, CrmExpenseCategory, CrmExpenseKind } from "@shared/crmExpenses";
import type { CrmAiRole } from "@shared/crmAi";

export type { CrmBillingInterval, CrmExpenseCategory, CrmExpenseKind };

export const CRM_STAGES = [
    "nuovo",
    "contattato",
    "in_conversazione",
    "telefonata_fissata",
    "telefonata_fatta",
    "demo_fissata",
    "demo_fatta",
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
    | "escalated"
    | "stage_locked"
    | "stage_unlocked"
    | "subscription_changed"
    | "venue_renamed"
    | "venue_name_confirmed"
    | "venue_name_deferred"
    | "agent_hold"
    | "agent_released"
    | "call_scheduled"
    | "call_moved"
    | "call_cancelled"
    | "call_caller_answered"
    | "call_outcome";

/** Lead tornato: confronto del locale scritto con quello della carta (20261002130000). */
export type CrmVenueNameMatch = "same" | "typo" | "other";
/** Scelta scritta su quel lead: «È lo stesso locale» o «Decido dopo» (solo dati vecchi). */
export type CrmVenueNameCheck = "same" | "later";
/** Scelte offerte oggi (20261002230000): tieni il nome che avevamo o usa quello nuovo. */
export type CrmVenueNameChoice = "same" | "rename";

/** Stato dell'account collegato, copiato dal job (20261001150000). */
export type CrmAccountState = "registrato" | "trialing" | "active" | "past_due" | "suspended" | "canceled";

export type CrmTrialKind = "carta" | "codice";

/** `suppressed`: telefono che ha chiesto lo stop, nessuna scrittura. */
export type CrmIngestOutcome = "created" | "returned" | "duplicate" | "suppressed";

/** Il prossimo passo di un locale (`crm_next_steps`, scheda del lead). */
export interface CrmNextStep {
    venue_id: string;
    step: string;
    /** AAAA-MM-GG; null = senza scadenza. */
    due_on: string | null;
    owner_user_id: string | null;
    set_by: string;
    set_at: string;
    /** Scritto dal gesto «rimanda a domani» (migration 20261005150400). */
    snoozed: boolean;
}

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
    /** Quando è entrato nel CRM; `received_at` è quando la persona l'ha mandato. */
    created_at: string;
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
    /** Cosa ha scritto la persona in questa richiesta (null nei dati vecchi). */
    contact_name_given: string | null;
    venue_name_given: string | null;
    venue_name_match: CrmVenueNameMatch | null;
    venue_name_check: CrmVenueNameCheck | null;
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
    /** «Locale da completare»: entrato senza nome del locale (form Meta), `name` è quello della persona. */
    name_pending: boolean;
    /** «Locale da verificare»: il nome diverso scritto da un lead tornato, finché qualcuno non decide. */
    name_to_verify: string | null;
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
    account_state: CrmAccountState | null;
    trial_kind: CrmTrialKind | null;
    trial_ends_at: string | null;
    /** «Fase bloccata a mano»: il job non sposta la carta. */
    stage_locked_at: string | null;
    stage_locked_by: string | null;
    stage_lock_note: string | null;
    /** «La prendo io» (20261002220000): l'agente WhatsApp non scrive a questo locale. */
    agent_hold_at: string | null;
    agent_hold_by: string | null;
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
    /** Vuoto = locale da completare (il DB usa il nome della persona). */
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
    /** Import CSV: entra già notificato, niente messaggio singolo né sollecito. */
    silent?: boolean;
}

export interface CrmIngestResult {
    /** Null con `suppressed` e con `duplicate` di un locale cancellato. */
    leadId: string | null;
    /**
     * Null con `suppressed` da lista di esclusione e con `duplicate` di un
     * locale cancellato; il locale se è ancora in Perso per stop.
     */
    venueId: string | null;
    outcome: CrmIngestOutcome;
}

// -----------------------------------------------------------------------------
// Agenti (Fase 1, F1-1): freno a mano, spesa AI, regole del brand, diario
// -----------------------------------------------------------------------------

export type { CrmAiRole } from "@shared/crmAi";

export type CrmBrakeSource = "setup" | "admin" | "telegram" | "spend_cap" | "channel" | "system";

export interface CrmAgentSettings {
    brake_on: boolean;
    brake_reason: string | null;
    brake_source: CrmBrakeSource;
    brake_changed_at: string | null;
    brake_changed_by: string | null;
    ai_month_cap_usd: number;
    ai_day_cap_usd: number;
    ai_model_conversation: string;
    ai_model_reviewer: string;
    ai_model_sensitive: string;
    ai_model_gea: string;
}

export interface CrmAiSpend {
    dayUsd: number;
    monthUsd: number;
    dayCap: number;
    monthCap: number;
}

export type CrmDecisionActor = "agent" | "reviewer" | "gea" | "system" | "person";

export interface CrmAgentDecision {
    id: string;
    created_at: string;
    actor: CrmDecisionActor;
    actor_user_id: string | null;
    action: string;
    reason: string;
    venue_id: string | null;
    lead_id: string | null;
    review_outcome: "ok" | "rejected" | null;
    decided_by: string | null;
    decided_at: string | null;
    payload: Record<string, unknown>;
}

export type CrmBrandRulesStatus = "draft" | "approved" | "retired" | "discarded";

export interface CrmBrandRules {
    id: string;
    version: number;
    created_at: string;
    created_by: string | null;
    body: string;
    note: string | null;
    status: CrmBrandRulesStatus;
    approved_by: string | null;
    approved_at: string | null;
}

export type CrmAgentCheckResult =
    | { ok: true; model: string; reply: string; cost_usd: number; latency_ms: number }
    | { ok: false; reason: string; model: string | null; detail: string | null };

// -----------------------------------------------------------------------------
// Connettore WhatsApp Web (F1-2, migration 20261002220000)
// -----------------------------------------------------------------------------
export type CrmMessageDirection = "in" | "out";
export type CrmMessageAuthor = "lead" | "agent" | "person";
export type CrmMessageKind = "text" | "voice" | "image" | "video" | "document" | "sticker" | "other";
export type CrmMessagePurpose = "first_message" | "reply" | "follow_up" | "call_confirm" | "call_reminder" | "call_soon";
export type CrmMessageStatus = "queued" | "sending" | "sent" | "failed" | "cancelled";

export interface CrmMessage {
    id: string;
    created_at: string;
    venue_id: string;
    contact_id: string | null;
    lead_id: string | null;
    direction: CrmMessageDirection;
    author: CrmMessageAuthor;
    kind: CrmMessageKind;
    body: string | null;
    purpose: CrmMessagePurpose | null;
    status: CrmMessageStatus | null;
    status_reason: string | null;
    sent_at: string | null;
    appointment_id: string | null;
}

/** Un messaggio in coda con il nome del locale (pagina Agenti, «In arrivo»). */
export interface CrmQueuedMessage {
    id: string;
    created_at: string;
    send_after: string | null;
    venue_id: string;
    venue_name: string;
    purpose: CrmMessagePurpose | null;
    body: string | null;
}

/** Una chiamata a Claude, solo ruolo e costo (spesa per agente). */
export interface CrmAiUsageCost {
    role: CrmAiRole;
    cost_usd: number;
    created_at: string;
}

export type CrmWaState = "unknown" | "ok" | "needs_relink" | "warning";

export interface CrmWaChannel {
    last_heartbeat_at: string | null;
    wa_state: CrmWaState;
    wa_state_detail: string | null;
    wa_state_at: string | null;
    worker_version: string | null;
    failures_in_row: number;
    next_send_at: string | null;
    silent_alerted_at: string | null;
}

export interface CrmWaSettings {
    /** NULL = nessun primo messaggio automatico. */
    wa_first_message: string | null;
    wa_test_only: boolean;
    wa_test_numbers: string[];
}

// -----------------------------------------------------------------------------
// Sezione costi (/admin/costi, migration 20261003120000)
// -----------------------------------------------------------------------------

export interface CrmExpense {
    id: string;
    kind: CrmExpenseKind;
    name: string;
    category: CrmExpenseCategory;
    /** Centesimi di euro, IVA inclusa. */
    amount_cents: number;
    paid_by: string | null;
    /** Una tantum: giorno del pagamento. */
    paid_on: string | null;
    /** Abbonamento: primo addebito al prezzo indicato. */
    first_charge_on: string | null;
    billing_interval: CrmBillingInterval | null;
    /** Abbonamento disdetto: niente addebiti da questo giorno in poi. */
    cancelled_on: string | null;
    /** Promemoria su Telegram N giorni prima del rinnovo; null = nessuno. */
    remind_days_before: number | null;
    reminded_for: string | null;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

/** Un addebito calcolato da `crm_expense_charges`. */
export interface CrmExpenseCharge {
    expenseId: string;
    chargedOn: string;
    amountCents: number;
}

export interface CrmExpenseInput {
    kind: CrmExpenseKind;
    name: string;
    category: CrmExpenseCategory;
    amountCents: number;
    paidBy: string | null;
    paidOn: string | null;
    firstChargeOn: string | null;
    billingInterval: CrmBillingInterval | null;
    cancelledOn: string | null;
    remindDaysBefore: number | null;
    notes: string | null;
}

/** Un rimborso tra persone, o un versamento sul conto comune (mig 20261005180000). */
export interface CrmExpenseSettlement {
    id: string;
    from_name: string;
    to_name: string;
    amount_cents: number;
    settled_on: string;
    note: string | null;
    created_by: string | null;
    created_at: string;
}

export interface CrmExpenseSettlementInput {
    fromName: string;
    toName: string;
    amountCents: number;
    settledOn: string;
    note: string | null;
}

// -----------------------------------------------------------------------------
// Agenda delle telefonate (F1-4a, migration 20261003230000)
// -----------------------------------------------------------------------------
export type CrmAppointmentStatus = "proposed" | "confirmed" | "cancelled" | "done" | "no_show" | "postponed";
export type CrmCallOutcome = "done" | "no_show" | "postponed";
export type CrmGoogleSync = "pending" | "ok" | "error" | "none";

export interface CrmAppointment {
    id: string;
    created_at: string;
    venue_id: string;
    lead_id: string | null;
    contact_id: string | null;
    starts_at: string;
    ends_at: string;
    time_set_at: string;
    caller_user_id: string;
    created_by: string | null;
    status: CrmAppointmentStatus;
    status_reason: string | null;
    note: string | null;
    google_sync: CrmGoogleSync;
    google_error: string | null;
    reminder_queued_at: string | null;
    /** L'orario per cui è partito il promemoria di un'ora prima (spostata, ne parte un altro). */
    soon_queued_for: string | null;
    brief_sent_at: string | null;
    outcome_at: string | null;
    outcome_by: string | null;
}

/** Una telefonata con il nome del locale, per la pagina Agenda. */
export interface CrmAppointmentWithVenue extends CrmAppointment {
    venue_name: string;
    venue_city: string | null;
}

export interface CrmCallWindow {
    days: number[];
    start: string;
    end: string;
}

export interface CrmAgendaSettings {
    call_windows: CrmCallWindow[];
    call_duration_minutes: number;
    call_min_notice_minutes: number;
    google_calendar_id: string | null;
    call_confirm_message: string | null;
    call_reminder_message: string | null;
    call_soon_message: string | null;
}

/** Un impegno per gli orari liberi: telefonata del CRM o evento del calendario Google. */
export interface CrmAgendaBusy {
    start: string;
    end: string;
    label: string;
    appointment_id: string | null;
    caller_user_id: string | null;
}

export interface CrmAgendaBusyResult {
    google: "ok" | "off" | "error";
    google_error: string | null;
    busy: CrmAgendaBusy[];
}

// -----------------------------------------------------------------------------
// Agente WhatsApp in prova (F1-3, migration 20261004010000)
// -----------------------------------------------------------------------------
export type CrmAgentDraftKind =
    | "reply"
    | "follow_up"
    | "bot_question"
    | "ask"
    | "schedule"
    | "stop_check"
    | "lost_proposal"
    | "reactivation";
export type CrmAgentDraftStatus = "pending" | "sent" | "edited" | "discarded" | "expired" | "scheduled" | "handled";

export interface CrmAgentTrialSettings {
    agent_replies_on: boolean;
    agent_followups_on: boolean;
    /** NULL = riattivazione spenta (F1-6). */
    agent_reactivation_message: string | null;
    agent_reactivation_days: number;
    /** F1-7: i tipi fuori dalla prova partono senza approvazione. Spenta di default. */
    agent_autonomy_on: boolean;
}

export interface CrmAgentTrust {
    kind: "reply" | "follow_up";
    approved_in_row: number;
    since: string | null;
    total_approved: number;
    total_edited: number;
    total_discarded: number;
    required_in_row: number;
    autonomous: boolean;
    total_auto: number;
}

export interface CrmAgentDraftRow {
    id: string;
    created_at: string;
    venue_id: string;
    venue_name: string;
    kind: CrmAgentDraftKind;
    status: CrmAgentDraftStatus;
    reason: string | null;
    proposed_text: string | null;
    final_text: string | null;
    decided_at: string | null;
}

/** Riga di `crm_post_sale_accounts()` (20261006090100): segnali d'uso di un cliente. */
export interface CrmPostSaleAccountRow {
    venue_id: string;
    tenant_id: string;
    tenant_created_at: string;
    plan: string | null;
    paid_seats: number | null;
    activities_total: number;
    activities_published: number;
    products_count: number;
    has_live_menu: boolean;
    live_menu_since: string | null;
}

/** Riga di `crm_post_sale_actions` (20261006090000): cosa ne ha fatto il team. */
export interface CrmPostSaleActionRow {
    venue_id: string;
    kind: "abbandono" | "prova_in_scadenza" | "crescita" | "passaparola";
    alerted_at: string | null;
    done_at: string | null;
    done_by: string | null;
    snoozed_until: string | null;
}

/** Categorie della libreria delle obiezioni (CHECK in 20261006100000). */
export type CrmObjectionCategory =
    | "prezzo"
    | "ha_gia_soluzione"
    | "non_serve"
    | "tempo"
    | "decide_altri"
    | "non_ora"
    | "diffidenza"
    | "altro";

/** Riga di `crm_objections`: un'obiezione sentita da un locale. */
export interface CrmObjection {
    id: string;
    venue_id: string;
    category: CrmObjectionCategory;
    note: string | null;
    source: "perso" | "scheda";
    created_by: string | null;
    created_at: string;
}

/** Riga di `crm_objection_answers`: la risposta che funziona per una categoria. */
export interface CrmObjectionAnswer {
    category: CrmObjectionCategory;
    answer: string;
    updated_by: string | null;
    updated_at: string;
}
