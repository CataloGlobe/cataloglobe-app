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
    venue_name_deferred: "Locale da verificare"
};

/** Messaggio italiano per gli errori delle RPC `crm_*` (RAISE in 20261001120100; VN001 in 20261002155000). */
export function crmErrorMessage(err: unknown): string {
    // Codici SQLSTATE dedicati prima del testo: il messaggio può cambiare, il codice no.
    const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: unknown }).code : null;
    if (code === "VN001") return "Non c'è un nome del locale da verificare.";
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
    return "Qualcosa non ha funzionato. Riprova.";
}
