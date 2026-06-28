// Classificatore puro dei fallimenti Gemini per menu-ai-import.
// ZERO import Deno (solo logica) → node-testabile via Vitest, come
// _shared/aiImportPayloadSize.ts. Separa le cause che l'edge prima
// collassava in 502/500 indistinguibili (429-quota vs rete vs SAFETY vs
// parse) in status HTTP + code macchina + messaggio IT distinti.

export type GeminiFailureCode =
    | "rate_limit_rpd"
    | "rate_limit_rpm_tpm"
    | "rate_limit"
    | "content_blocked" // SAFETY / RECITATION
    | "max_tokens"
    | "upstream_unavailable" // rete / fetch fail / 5xx upstream
    | "bad_response"; // 400 Gemini / empty / JSON parse

export interface ClassifiedFailure {
    httpStatus: number;
    code: GeminiFailureCode;
    messageIt: string;
    retryAfterSeconds?: number;
}

export interface GeminiFailureInput {
    geminiHttpStatus?: number;
    geminiErrorBody?: unknown; // JSON già parsato se disponibile
    finishReason?: string;
    isNetworkError?: boolean;
}

const MESSAGES: Record<GeminiFailureCode, string> = {
    rate_limit_rpd: "Limite giornaliero di import AI raggiunto. Riprova più tardi.",
    rate_limit_rpm_tpm: "Troppe richieste in poco tempo. Riprova tra qualche istante.",
    rate_limit: "Troppe richieste verso il servizio AI. Riprova tra qualche minuto.",
    content_blocked: "Il contenuto del menu non può essere elaborato.",
    // Invariato rispetto alla versione inline precedente (apostrofo ASCII voluto).
    max_tokens: "Il menu e' troppo lungo per essere elaborato in una volta. Riprova con meno pagine.",
    upstream_unavailable: "Servizio AI temporaneamente non disponibile. Riprova.",
    bad_response: "Errore nell'analisi del menu"
};

const STATUS: Record<GeminiFailureCode, number> = {
    rate_limit_rpd: 429,
    rate_limit_rpm_tpm: 429,
    rate_limit: 429,
    content_blocked: 422,
    max_tokens: 422,
    upstream_unavailable: 502,
    bad_response: 500
};

function build(code: GeminiFailureCode, retryAfterSeconds?: number): ClassifiedFailure {
    const out: ClassifiedFailure = { httpStatus: STATUS[code], code, messageIt: MESSAGES[code] };
    if (retryAfterSeconds !== undefined) out.retryAfterSeconds = retryAfterSeconds;
    return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

// Estrae l'array error.details[] difensivamente dal corpo errore Gemini.
function extractDetails(body: unknown): unknown[] {
    if (!isRecord(body)) return [];
    const error = body.error;
    if (!isRecord(error)) return [];
    return Array.isArray(error.details) ? error.details : [];
}

function detailType(detail: unknown): string {
    if (!isRecord(detail)) return "";
    return typeof detail["@type"] === "string" ? (detail["@type"] as string) : "";
}

// quotaId dalla prima QuotaFailure.violations[]. null se shape non corrisponde.
function extractQuotaId(details: unknown[]): string | null {
    for (const d of details) {
        if (!detailType(d).endsWith("QuotaFailure")) continue;
        if (!isRecord(d) || !Array.isArray(d.violations)) continue;
        for (const v of d.violations) {
            if (isRecord(v) && typeof v.quotaId === "string") return v.quotaId;
        }
    }
    return null;
}

// retryDelay (es. "14s") dalla RetryInfo → secondi interi. undefined se assente.
function extractRetryAfter(details: unknown[]): number | undefined {
    for (const d of details) {
        if (!detailType(d).endsWith("RetryInfo")) continue;
        if (!isRecord(d) || typeof d.retryDelay !== "string") continue;
        const m = d.retryDelay.match(/(\d+(?:\.\d+)?)/);
        if (m) return Math.round(Number(m[1]));
    }
    return undefined;
}

function classifyRateLimit(body: unknown): ClassifiedFailure {
    const details = extractDetails(body);
    const quotaId = extractQuotaId(details);
    const retryAfterSeconds = extractRetryAfter(details);

    if (quotaId && /PerDay/i.test(quotaId)) return build("rate_limit_rpd", retryAfterSeconds);
    if (quotaId && /PerMinute/i.test(quotaId)) return build("rate_limit_rpm_tpm", retryAfterSeconds);
    return build("rate_limit", retryAfterSeconds);
}

export function classifyGeminiFailure(input: GeminiFailureInput): ClassifiedFailure {
    // 1. Errore di rete / fetch fallito: precede qualunque finishReason stantio.
    if (input.isNetworkError) return build("upstream_unavailable");

    // 2. Errore HTTP da Gemini.
    const status = input.geminiHttpStatus;
    if (status !== undefined && status !== 200) {
        if (status === 429) return classifyRateLimit(input.geminiErrorBody);
        if (status === 400) return build("bad_response");
        return build("upstream_unavailable"); // 5xx upstream e altri
    }

    // 3. finishReason anomalo su risposta 200.
    if (input.finishReason === "MAX_TOKENS") return build("max_tokens");
    if (input.finishReason && input.finishReason !== "STOP") return build("content_blocked");

    // 4. Default: risposta vuota / JSON non parsabile / categorie mancanti.
    return build("bad_response");
}
