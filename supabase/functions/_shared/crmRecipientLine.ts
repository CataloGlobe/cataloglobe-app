// =============================================================================
// CRM: riga in testa agli avvisi Telegram che dice a chi arrivano
// =============================================================================
// Chiesto da Alex il 2026-10-06: aprendo un avviso si capisce subito se lo
// vede solo chi lo legge o anche gli altri del team. Vale per gli avvisi che
// il CRM manda da sé; le risposte di Gea e del bot nella chat ne restano
// senza. Puro, senza import: lo usano le edge e i test.
// =============================================================================

export interface RecipientTeamMember {
    user_id: string;
    display_name?: string | null;
}

const ONLY_YOU = "👤 Solo per te";
const SHARED_PREFIX = "👥 Per te";

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function joinNames(names: string[]): string {
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/**
 * La riga per chi legge (`me`), dati tutti i destinatari dello stesso avviso.
 * HTML: i nomi sono protetti. Chi non ha un nome diventa «un altro del team».
 */
export function recipientLine(team: RecipientTeamMember[], recipientIds: string[], me: string): string {
    const others = [...new Set(recipientIds)].filter(id => id !== me);
    if (others.length === 0) return ONLY_YOU;
    const named: string[] = [];
    let unnamed = 0;
    for (const id of others) {
        const name = team.find(m => m.user_id === id)?.display_name?.trim();
        if (name) named.push(escapeHtml(name));
        else unnamed += 1;
    }
    if (unnamed === 1) named.push("un altro del team");
    else if (unnamed > 1) named.push(`altri ${unnamed} del team`);
    return `👥 Per ${joinNames(["te", ...named])}`;
}

/** Il messaggio con la riga in testa. */
export function withRecipientLine<T extends { text: string }>(
    message: T,
    team: RecipientTeamMember[],
    recipientIds: string[],
    me: string
): T {
    return { ...message, text: `${recipientLine(team, recipientIds, me)}\n\n${message.text}` };
}

/**
 * Riscrivendo un avviso (pulsanti che cambiano testo), la riga resta quella
 * dell'invio: Telegram restituisce il testo senza HTML, qui si riprotegge.
 */
export function keepRecipientLine(previousText: string | null | undefined, newText: string): string {
    const first = previousText?.split("\n", 1)[0] ?? "";
    if (!first.startsWith(ONLY_YOU) && !first.startsWith(SHARED_PREFIX)) return newText;
    if (newText.startsWith(first)) return newText;
    return `${escapeHtml(first)}\n\n${newText}`;
}
