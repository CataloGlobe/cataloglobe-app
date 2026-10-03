// @ts-nocheck
// =============================================================================
// CRM interno: messaggi Telegram al team (service role)
// =============================================================================
// `sendToTeam`: a chi è indicato (user_id) tra i collegati a Telegram; se
// nessuno di loro è collegato, o non è indicato nessuno, a tutto il team
// collegato. Ritorna quanti invii sono andati: 0 = da riprovare.
// Non lancia: un avviso mancato non ferma chi lo chiama.
// Env: TELEGRAM_BOT_TOKEN (senza, nessun invio).
// =============================================================================

import { telegramCall } from "./telegramApi.ts";

export async function sendToTeam(
    supabase,
    text: string,
    options: { preferUserIds?: (string | null)[]; logTag?: string } = {}
): Promise<number> {
    const tag = options.logTag ?? "crmTeamAlert";
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) return 0;
    const { data: team, error } = await supabase
        .from("crm_team_members")
        .select("user_id, telegram_chat_id")
        .not("telegram_chat_id", "is", null);
    if (error) {
        console.error(`${tag}: team non letto`, error.code);
        return 0;
    }
    const linked = team ?? [];
    const preferred = new Set((options.preferUserIds ?? []).filter(Boolean));
    const chosen = linked.filter(m => preferred.has(m.user_id));
    const recipients = chosen.length > 0 ? chosen : linked;

    let delivered = 0;
    for (const member of recipients) {
        const result = await telegramCall(token, "sendMessage", {
            chat_id: member.telegram_chat_id,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true
        });
        if (result.ok) delivered++;
        else console.warn(`${tag}: messaggio non consegnato`, result.description);
    }
    return delivered;
}
