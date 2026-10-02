// =============================================================================
// crmLeadSendGate — il controllo unico prima di ogni invio verso un lead
// =============================================================================
//
// Contratto (review di Lorenzo del 2026-10-02): ogni invio fatto dal sistema
// verso un lead, su qualunque canale (WhatsApp dal connettore, email, i
// prossimi), passa da `crm_lead_send_gate` subito prima di partire. Se il
// cancello dice no, il messaggio non parte e chi chiama lo segna col motivo.
// Il cancello ferma la pausa agenti, gli stop e i contatti senza recapito.
//
// Mittenti: 'agent' (testo scritto da Claude) e 'system' (testi fissi). Gea
// non scrive mai ai lead: per lei, come per ogni altro mittente, la risposta
// è sempre no. Resta fuori solo una persona che scrive dal proprio telefono.
//
// Nessun import: il file vale per le edge (Deno) e per i test (Vitest).
// =============================================================================

export type CrmLeadChannel = "whatsapp" | "email";
export type CrmLeadSender = "agent" | "system";

export type CrmLeadSendBlock =
    | "brake"
    | "stop"
    | "suppressed"
    | "no_phone"
    | "no_email"
    | "not_found"
    | "sender_not_allowed"
    | "gate_error";

export type CrmLeadSendDecision = { allowed: true } | { allowed: false; reason: CrmLeadSendBlock };

/** Testo per Telegram e per /admin: perché un messaggio non è partito. */
export const CRM_LEAD_SEND_BLOCK_LABEL: Record<CrmLeadSendBlock, string> = {
    brake: "Agenti in pausa",
    stop: "Il locale ha chiesto di non essere più contattato",
    suppressed: "Il numero è nella lista stop",
    no_phone: "Il contatto non ha un telefono",
    no_email: "Il contatto non ha un'email",
    not_found: "Contatto non trovato",
    sender_not_allowed: "Questo mittente non può scrivere ai lead",
    gate_error: "Controllo non riuscito, invio fermato per prudenza"
};

const KNOWN_BLOCKS = new Set<string>(Object.keys(CRM_LEAD_SEND_BLOCK_LABEL));

/**
 * Legge la riga di `crm_lead_send_gate`. Tutto ciò che non è un sì esplicito
 * è un no: righe mancanti, errori e motivi sconosciuti fermano l'invio.
 */
export function interpretLeadSendGate(data: unknown, error: unknown): CrmLeadSendDecision {
    if (error) return { allowed: false, reason: "gate_error" };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return { allowed: false, reason: "gate_error" };
    const { r_allowed, r_reason } = row as { r_allowed?: unknown; r_reason?: unknown };
    if (r_allowed === true) return { allowed: true };
    if (typeof r_reason === "string" && KNOWN_BLOCKS.has(r_reason)) {
        return { allowed: false, reason: r_reason as CrmLeadSendBlock };
    }
    return { allowed: false, reason: "gate_error" };
}

interface RpcClient {
    rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** Chiama il cancello. Mai un'eccezione: un errore diventa `gate_error`. */
export async function checkLeadSend(
    client: RpcClient,
    contactId: string,
    channel: CrmLeadChannel,
    sender: CrmLeadSender
): Promise<CrmLeadSendDecision> {
    try {
        const { data, error } = await client.rpc("crm_lead_send_gate", {
            p_contact_id: contactId,
            p_channel: channel,
            p_sender: sender
        });
        return interpretLeadSendGate(data, error);
    } catch {
        return { allowed: false, reason: "gate_error" };
    }
}
