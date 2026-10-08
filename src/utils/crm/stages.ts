import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import type { CrmEventType, CrmLostKind, CrmStage } from "@/types/crm";

export { CRM_STAGE_LABEL, CRM_SOURCE_LABEL } from "@shared/crmLabels";

export const CRM_STAGE_VARIANT: Record<CrmStage, StatusBadgeVariant> = {
    nuovo: "pending",
    contattato: "info",
    in_conversazione: "info",
    telefonata_fissata: "info",
    telefonata_fatta: "info",
    demo_fissata: "info",
    demo_fatta: "info",
    in_prova: "warning",
    cliente_pagante: "success",
    perso: "neutral"
};

export const CRM_LOST_KIND_LABEL: Record<CrmLostKind, string> = {
    obiezione: "Non adesso (si può riprovare)",
    stop: "Non vuole essere contattato"
};

export const CRM_EVENT_LABEL: Record<CrmEventType, string> = {
    lead_in: "Lead entrato",
    lead_returned: "È tornato",
    assigned: "Assegnato",
    stage_changed: "Cambio di fase",
    whatsapp_opened: "WhatsApp aperto",
    note: "Nota",
    account_linked: "Account collegato",
    escalated: "Sollecito",
    stage_locked: "Fase bloccata a mano",
    stage_unlocked: "Fase sbloccata",
    subscription_changed: "Abbonamento",
    venue_renamed: "Locale completato",
    venue_name_confirmed: "Stesso locale confermato",
    venue_name_deferred: "Locale da verificare",
    agent_hold: "La gestisce una persona",
    agent_released: "Ridato all'agente",
    call_scheduled: "Telefonata fissata",
    call_moved: "Telefonata spostata",
    call_cancelled: "Telefonata annullata",
    call_caller_answered: "Risposta di chi chiama",
    call_outcome: "Esito della telefonata"
};

/**
 * La tabella o la funzione non c'è ancora sul database (migrazione non
 * applicata): PostgREST risponde PGRST202/PGRST205, Postgres 42P01/42883.
 */
export function isMissingOnDatabase(err: unknown): boolean {
    const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: unknown }).code : null;
    return code === "PGRST202" || code === "PGRST205" || code === "42P01" || code === "42883";
}

export const CRM_NOT_YET_ACTIVE = "Non ancora attivo: manca l'aggiornamento del database.";

/** Per le pagine di /admin fuori dal CRM (Incidenti, Supporto): niente «non ancora attivo». */
export function adminErrorMessage(err: unknown): string {
    if (isMissingOnDatabase(err)) return "Non è andata: riprova tra poco. Se si ripete, avvisa Lorenzo.";
    return crmErrorMessage(err);
}

/** Messaggio italiano per gli errori delle RPC `crm_*` (RAISE in 20261001120100; VN001 in 20261002155000). */
export function crmErrorMessage(err: unknown): string {
    // Codici SQLSTATE dedicati prima del testo: il messaggio può cambiare, il codice no.
    const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: unknown }).code : null;
    if (code === "VN001") return "Non c'è un nome del locale da verificare.";
    if (isMissingOnDatabase(err)) return CRM_NOT_YET_ACTIVE;
    const message =
        err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && typeof (err as { message?: unknown }).message === "string"
              ? (err as { message: string }).message
              : String(err ?? "");
    if (message.includes("lost_reason_required")) return "Per Perso servono tipo e motivo.";
    if (message.includes("invalid_phone")) return "Il telefono non è valido.";
    if (message.includes("venue_not_found")) return "Questo locale non esiste più.";
    if (message.includes("not_a_team_member")) return "Questa persona non è nel team del CRM.";
    if (message.includes("invalid_note")) return "La nota è vuota o troppo lunga.";
    if (message.includes("lock_note_required")) return "Scrivi una nota: perché blocchi la fase.";
    if (message.includes("invalid_venue_name")) return "Scrivi il nome del locale (al massimo 160 caratteri).";
    if (message.includes("invalid_city")) return "La città è troppo lunga.";
    if (message.includes("contact_stopped")) return "Ha chiesto di non essere contattato.";
    if (message.includes("draft_not_found")) return "Questa bozza non c'è più.";
    if (message.includes("invalid_text")) return "Il testo è vuoto o troppo lungo.";
    if (message.includes("stage_changed")) return "La fase del lead è cambiata: riapri la scheda.";
    if (message.includes("decision_not_allowed")) return "Questa bozza non si può più decidere così.";
    if (message.includes("stop_confirm_required")) return "Ha chiesto di non essere contattato: per spostarlo serve una conferma.";
    if (message.includes("not_allowed")) return "Non hai i permessi per farlo.";
    return "Qualcosa non ha funzionato. Riprova.";
}
