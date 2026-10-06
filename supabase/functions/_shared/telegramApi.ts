// @ts-nocheck
// =============================================================================
// Bot API di Telegram: chiamata minima con timeout
// =============================================================================
// Non lancia mai: ritorna `{ ok: false, description }` su errore di rete,
// timeout o risposta negativa, così il chiamante decide se riprovare.
// Il token arriva dal chiamante (env TELEGRAM_BOT_TOKEN): mai nei log.
// =============================================================================

const TIMEOUT_MS = 10_000;

export interface TelegramResult<T = unknown> {
    ok: boolean;
    result?: T;
    description?: string;
}

export async function telegramCall<T = unknown>(
    token: string,
    method: string,
    payload: Record<string, unknown>
): Promise<TelegramResult<T>> {
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        const body = await res.json().catch(() => ({}));
        return { ok: body?.ok === true, result: body?.result, description: body?.description };
    } catch (err) {
        return { ok: false, description: err instanceof Error ? err.name : "network_error" };
    }
}

/** «message is not modified»: il testo era già quello, non è un errore. */
export function isNotModified(result: TelegramResult): boolean {
    return !result.ok && /not modified/i.test(result.description ?? "");
}
