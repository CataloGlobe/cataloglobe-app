import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import type { CrmEventType, CrmLeadSource, CrmLostKind, CrmStage } from "@/types/crm";

/** Etichette delle 8 colonne della pipeline (wiki: pipeline-crm). */
export const CRM_STAGE_LABEL: Record<CrmStage, string> = {
    nuovo: "Nuovo",
    contattato: "Contattato",
    in_conversazione: "In conversazione",
    appuntamento: "Appuntamento",
    chiamata_fatta: "Chiamata fatta",
    in_prova: "In prova",
    cliente_pagante: "Cliente pagante",
    perso: "Perso"
};

export const CRM_STAGE_VARIANT: Record<CrmStage, StatusBadgeVariant> = {
    nuovo: "pending",
    contattato: "info",
    in_conversazione: "info",
    appuntamento: "info",
    chiamata_fatta: "info",
    in_prova: "warning",
    cliente_pagante: "success",
    perso: "neutral"
};

export const CRM_LOST_KIND_LABEL: Record<CrmLostKind, string> = {
    obiezione: "Non adesso (si può riprovare)",
    stop: "Non vuole essere contattato"
};

export const CRM_SOURCE_LABEL: Record<CrmLeadSource, string> = {
    landing: "Landing",
    meta_form: "Modulo Meta",
    whatsapp: "Chat WhatsApp",
    manuale: "A mano"
};

export const CRM_EVENT_LABEL: Record<CrmEventType, string> = {
    lead_in: "Lead entrato",
    lead_returned: "È tornato",
    assigned: "Assegnato",
    stage_changed: "Cambio di fase",
    whatsapp_opened: "WhatsApp aperto",
    note: "Nota",
    account_linked: "Account collegato",
    escalated: "Sollecito"
};

/** Messaggio italiano per gli errori delle RPC `crm_*` (RAISE in 20261001120100). */
export function crmErrorMessage(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err ?? "");
    if (message.includes("lost_reason_required")) return "Per Perso servono tipo e motivo.";
    if (message.includes("invalid_phone")) return "Il telefono non è valido.";
    if (message.includes("venue_not_found")) return "Questo locale non esiste più.";
    if (message.includes("not_a_team_member")) return "Questa persona non è nel team del CRM.";
    if (message.includes("invalid_note")) return "La nota è vuota o troppo lunga.";
    return "Qualcosa non ha funzionato. Riprova.";
}
