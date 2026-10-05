/**
 * Parole della pagina Agenti (/admin/agenti): diario, pausa degli agenti, prova di
 * collegamento, errori delle funzioni crm_* degli agenti.
 */
import type {
    CrmAgentCheckResult,
    CrmAgentDraftKind,
    CrmAgentDraftStatus,
    CrmBrakeSource,
    CrmDecisionActor
} from "@/types/crm";
import { CLAUDE_PRICES, type CrmAiRole } from "@shared/crmAi";

export const CRM_BRAKE_SOURCE_LABEL: Record<CrmBrakeSource, string> = {
    setup: "avvio",
    admin: "da /admin",
    telegram: "da Telegram",
    spend_cap: "tetto di spesa",
    channel: "salute del canale",
    system: "automatico"
};

export const CRM_DECISION_ACTOR_LABEL: Record<CrmDecisionActor, string> = {
    agent: "Agente",
    reviewer: "Revisore",
    gea: "Gea",
    system: "Sistema",
    person: "Persona"
};

const ACTION_LABEL: Record<string, string> = {
    brake_on: "Agenti messi in pausa",
    brake_off: "Agenti riattivati",
    spend_alert: "Avviso di spesa",
    agent_settings_changed: "Impostazioni cambiate",
    brand_rules_proposed: "Regole proposte",
    brand_rules_approved: "Regole in vigore",
    brand_rules_discarded: "Regole scartate",
    message_sent: "Messaggio WhatsApp inviato",
    wa_settings_changed: "Impostazioni WhatsApp cambiate",
    lead_stop: "Stop del lead",
    draft_created: "Bozza preparata",
    draft_sent: "Bozza inviata così",
    draft_edited: "Bozza corretta e inviata",
    draft_discard: "Bozza non mandata",
    draft_handle: "Scrive una persona al lead",
    draft_stop: "Confermato lo stop",
    draft_objection: "È un «non adesso»",
    draft_other: "Proposti altri orari",
    call_from_agent: "Telefonata fissata da una bozza",
    draft_lost: "Messo in Perso",
    draft_auto_sent: "Partita da sola",
    draft_wrong: "Segnata come sbagliata",
    reactivation_lost: "Di nuovo in Perso: nessuna risposta alla riattivazione",
    autonomy_on: "Autonomia accesa",
    autonomy_off: "Autonomia spenta",
    replies_on: "Risposte dell'agente accese",
    replies_off: "Risposte dell'agente spente",
    followups_on: "Solleciti dell'agente accesi",
    followups_off: "Solleciti dell'agente spenti",
    gea_note: "Nota da Gea",
    gea_move_stage: "Fase cambiata da Gea",
    gea_assign: "Lead girato da Gea",
    gea_pause: "Agenti in pausa da Gea",
    gea_resume: "Agenti ripresi da Gea",
    gea_refused: "Richiesta rifiutata da Gea"
};

/** Azioni nuove (dalle PR dopo) senza etichetta: il codice, leggibile. */
export function decisionActionLabel(action: string): string {
    return ACTION_LABEL[action] ?? action.replace(/_/g, " ");
}

/** Opzioni del modello: solo quelli del listino (senza prezzo il tetto non conta). */
export const CRM_MODEL_OPTIONS = Object.entries(CLAUDE_PRICES).map(([value, price]) => ({
    value,
    label: price.label
}));

export function modelLabel(model: string): string {
    return CLAUDE_PRICES[model]?.label ?? model;
}

const CHECK_REASON: Record<string, string> = {
    not_configured: "Manca la chiave API di Anthropic nei segreti delle edge.",
    brake: "Agenti in pausa.",
    day_cap: "Tetto di spesa di oggi raggiunto.",
    month_cap: "Tetto di spesa del mese raggiunto.",
    unpriced_model: "Il modello scelto non è nel listino.",
    gate_error: "Non riesco a leggere le impostazioni degli agenti.",
    api_error: "Claude ha risposto con un errore."
};

/** Esito della prova di collegamento, in una riga. */
export function agentCheckMessage(result: CrmAgentCheckResult): string {
    if (result.ok) {
        const cost = result.cost_usd.toFixed(4).replace(".", ",");
        return `${modelLabel(result.model)} risponde: ${result.latency_ms} ms, ${cost} $.`;
    }
    const reason = CHECK_REASON[result.reason] ?? "La prova non è riuscita.";
    return result.detail && result.reason === "api_error" ? `${reason} (${result.detail})` : reason;
}

export function crmAgentErrorMessage(err: unknown): string {
    const message =
        err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err ?? "");
    if (message.includes("brake_release_needs_person")) return "Per riattivare gli agenti serve una persona.";
    if (message.includes("approval_needs_person")) return "Le regole le approva una persona.";
    if (message.includes("rules_not_draft")) return "Questa versione non è più in bozza.";
    if (message.includes("rules_not_found")) return "Questa versione non esiste.";
    if (message.includes("rules_immutable")) return "Una versione non si modifica: proponine una nuova.";
    if (message.includes("empty_rules")) return "Scrivi le regole.";
    if (message.includes("crm_settings_ai_day_cap_within_month")) return "Il tetto di oggi non può superare quello del mese.";
    if (message.includes("ai_month_cap_usd") || message.includes("ai_day_cap_usd")) {
        return "Il tetto deve essere maggiore di zero (al massimo 10.000 $ al mese).";
    }
    return "Qualcosa non ha funzionato. Riprova.";
}

/** Tetto scritto a mano («12,50», «100»): numero positivo con al massimo due decimali, o null. */
export function parseUsdCap(text: string): number | null {
    const clean = text.trim().replace(/\s|\$/g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
    const value = Number(clean);
    return value > 0 && value <= 10_000 ? value : null;
}

/** «12.5» come lo scrive una persona: «12,50». */
export function formatUsdInput(value: number): string {
    return value.toFixed(2).replace(".", ",");
}

// -----------------------------------------------------------------------------
// Agente in prova (F1-3)
// -----------------------------------------------------------------------------
export const CRM_AGENT_DRAFT_KIND_LABEL: Record<CrmAgentDraftKind, string> = {
    reply: "Risposta",
    follow_up: "Sollecito",
    bot_question: "«Sei un bot?»",
    ask: "Serve una persona",
    schedule: "Orario accettato",
    stop_check: "Stop o «non adesso»?",
    lost_proposal: "Proposta di Perso",
    reactivation: "Riattivazione"
};

/** Testo della riattivazione: vuoto = spento; segnaposti {nome} {locale} {mittente}. */
export function reactivationTextError(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (trimmed.length > 1000) return "Al massimo 1000 caratteri.";
    const unknown = [...trimmed.matchAll(/\{([a-z_]+)\}/gi)].map(m => m[1]).find(n => !["nome", "locale", "mittente"].includes(n));
    return unknown ? `Segnaposto sconosciuto: {${unknown}}.` : null;
}

export const CRM_AGENT_DRAFT_STATUS_LABEL: Record<CrmAgentDraftStatus, string> = {
    pending: "In attesa",
    sent: "Inviata così",
    edited: "Corretta e inviata",
    discarded: "Non mandata",
    expired: "Scaduta",
    scheduled: "Telefonata fissata",
    handled: "Gestita da una persona"
};

/**
 * «Gestita da una persona» copre esiti diversi: stop, «non adesso», altri
 * orari. Il motivo scritto dall'SQL (crm_agent_decide_draft) dice quale.
 * Stessi motivi di HANDLED_OUTCOME_BY_REASON in crmAgentMessages.ts.
 */
const HANDLED_STATUS_BY_REASON: Record<string, string> = {
    "È uno stop.": "Stop",
    "Obiezione, non stop.": "«Non adesso»",
    "Proponi altri orari.": "Altri orari",
    "Messo in Perso.": "Messo in Perso"
};

/** Partite senza approvazione (fuori dalla prova): mai «Inviata così». ⚠️ SYNC con crm_agent_auto_send / «Era sbagliata». */
const SENT_STATUS_BY_REASON: Record<string, string> = {
    "Inviata in autonomia.": "Partita da sola",
    "Era sbagliata.": "Partita da sola, era sbagliata"
};

export function draftStatusLabel(status: CrmAgentDraftStatus, reason: string | null, kind?: CrmAgentDraftKind): string {
    if (status === "discarded" && kind === "lost_proposal") return "Resta aperto";
    if (status === "sent" && reason && SENT_STATUS_BY_REASON[reason]) return SENT_STATUS_BY_REASON[reason];
    if (status === "handled" && reason && HANDLED_STATUS_BY_REASON[reason]) return HANDLED_STATUS_BY_REASON[reason];
    return CRM_AGENT_DRAFT_STATUS_LABEL[status];
}

/** «4 approvate di fila senza modifiche · in tutto …». */
export function describeTrust(t: {
    approved_in_row: number;
    total_approved: number;
    total_edited: number;
    total_discarded: number;
    required_in_row?: number;
    autonomous?: boolean;
    total_auto?: number;
}): string {
    const row = t.approved_in_row === 1 ? "1 approvata di fila" : `${t.approved_in_row} approvate di fila`;
    const state = t.autonomous
        ? "fuori dalla prova"
        : t.required_in_row
          ? `in prova (ne servono ${t.required_in_row} di fila e 3 giorni)`
          : null;
    const auto = t.total_auto ? `, ${t.total_auto} partite da sole` : "";
    return `${state ? `${state} · ` : ""}${row} senza modifiche · in tutto ${t.total_approved} approvate, ${t.total_edited} corrette, ${t.total_discarded} scartate${auto}`;
}

/** La colonna del modello di ogni ruolo AI in `crm_settings`. */
export const MODEL_FIELD: Record<CrmAiRole, "ai_model_conversation" | "ai_model_reviewer" | "ai_model_sensitive" | "ai_model_gea"> = {
    conversation: "ai_model_conversation",
    reviewer: "ai_model_reviewer",
    sensitive: "ai_model_sensitive",
    gea: "ai_model_gea"
};
