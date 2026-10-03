/**
 * Parole del connettore WhatsApp Web (F1-2): messaggi nella scheda del lead,
 * stato del canale e impostazioni nella pagina Agenti, errori delle funzioni
 * crm_wa_* e crm_set_agent_hold.
 */
import type { CrmMessage, CrmMessageKind, CrmMessageStatus, CrmWaChannel } from "@/types/crm";

export const CRM_MESSAGE_KIND_LABEL: Record<CrmMessageKind, string> = {
    text: "Messaggio",
    voice: "Vocale, da ascoltare su WhatsApp",
    image: "Foto",
    video: "Video",
    document: "Documento",
    sticker: "Sticker",
    other: "Messaggio che il CRM non sa leggere"
};

export const CRM_MESSAGE_STATUS_LABEL: Record<CrmMessageStatus, string> = {
    queued: "In coda",
    sending: "In invio",
    sent: "Inviato",
    failed: "Non inviato",
    cancelled: "Annullato"
};

/** Chi ha scritto, in una parola. */
export function messageAuthorLabel(message: Pick<CrmMessage, "author" | "purpose">): string {
    if (message.author === "lead") return "Lead";
    if (message.author === "person") return "Scritto a mano";
    return message.purpose === "first_message" ? "Agente, primo messaggio" : "Agente";
}

/** Testo da mostrare: il corpo, o cosa è (vocale, foto…), o il primo messaggio ancora da comporre. */
export function messageText(message: Pick<CrmMessage, "body" | "kind" | "purpose" | "status">): string {
    if (message.body) {
        return message.kind === "text" ? message.body : `${CRM_MESSAGE_KIND_LABEL[message.kind]}: ${message.body}`;
    }
    if (message.purpose === "first_message" && message.status === "queued") {
        return "Testo del primo messaggio, scritto al momento dell'invio.";
    }
    return CRM_MESSAGE_KIND_LABEL[message.kind];
}

/** Stato di un messaggio dell'agente, col motivo quando c'è. Null per lead e persone. */
export function messageStatusLine(message: Pick<CrmMessage, "status" | "status_reason">): string | null {
    if (!message.status) return null;
    const label = CRM_MESSAGE_STATUS_LABEL[message.status];
    return message.status_reason ? `${label}: ${message.status_reason}` : label;
}

export type ChannelHealth = { label: string; variant: "success" | "warning" | "danger" | "neutral"; detail: string };

const SILENT_AFTER_MS = 15 * 60_000;

/** Salute del canale per la pagina Agenti. */
export function channelHealth(channel: CrmWaChannel | null, now: Date = new Date()): ChannelHealth {
    if (!channel || !channel.last_heartbeat_at) {
        return { label: "Mai collegato", variant: "neutral", detail: "Il Mac di WhatsApp non si è ancora fatto sentire." };
    }
    if (now.getTime() - new Date(channel.last_heartbeat_at).getTime() > SILENT_AFTER_MS) {
        return { label: "Mac muto", variant: "danger", detail: "Nessun segno di vita da più di 15 minuti." };
    }
    if (channel.wa_state === "needs_relink") {
        return { label: "Da ricollegare", variant: "danger", detail: "WhatsApp Web chiede il QR: inquadralo dal telefono dell'agente." };
    }
    if (channel.wa_state === "warning") {
        return {
            label: "Avviso",
            variant: "warning",
            detail: channel.wa_state_detail ? `WhatsApp Web mostra: «${channel.wa_state_detail}».` : "WhatsApp Web mostra un avviso."
        };
    }
    if (channel.failures_in_row > 0) {
        return {
            label: "Collegato",
            variant: "warning",
            detail: `${channel.failures_in_row} ${channel.failures_in_row === 1 ? "invio fallito" : "invii falliti"} di fila (al terzo gli agenti vanno in pausa).`
        };
    }
    return { label: "Collegato", variant: "success", detail: "Il Mac legge le chat e manda i messaggi in coda." };
}

const E164 = /^\+[1-9][0-9]{6,14}$/;
export const WA_TEST_NUMBERS_MAX = 20;

/**
 * Numeri di prova scritti uno per riga (o separati da virgole): spazi, punti
 * e trattini tolti, «00» davanti diventa «+». Doppioni tolti.
 */
export function parseTestNumbers(text: string): { numbers: string[]; invalid: string[] } {
    const numbers: string[] = [];
    const invalid: string[] = [];
    for (const raw of text.split(/[\n,;]+/)) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        let value = trimmed.replace(/[\s.\-()/]/g, "");
        if (value.startsWith("00")) value = `+${value.slice(2)}`;
        if (!E164.test(value)) invalid.push(trimmed);
        else if (!numbers.includes(value)) numbers.push(value);
    }
    return { numbers, invalid };
}

/** Messaggio italiano per gli errori del connettore. */
export function waErrorMessage(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err ?? "");
    if (message.includes("message_not_cancellable")) return "Questo messaggio non è più in coda: non si può annullare.";
    if (message.includes("hold_needs_person")) return "Serve una persona collegata per prendere il locale.";
    if (message.includes("venue_not_found")) return "Questo locale non esiste più.";
    if (message.includes("wa_test_numbers") || message.includes("crm_e164_list_ok")) {
        return "Numeri di prova non validi: servono numeri col prefisso, come +393331234567.";
    }
    if (message.includes("wa_first_message")) return "Il primo messaggio deve avere da 1 a 1000 caratteri.";
    return "Operazione non riuscita. Riprova.";
}
