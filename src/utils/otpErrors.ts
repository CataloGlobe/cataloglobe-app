import { FunctionsHttpError } from "@supabase/supabase-js";
import type { OtpErrorCode, VerifyOtpResponse } from "@/types/otp";

/**
 * Classifica l'errore di `supabase.functions.invoke("verify-otp")`.
 *
 * Su risposta non-2xx supabase-js incapsula tutto in `FunctionsHttpError`,
 * il cui `message` è generico ("Edge Function returned a non-2xx status code"):
 * il codice applicativo (`{ error }`) e i tentativi rimasti stanno nel body
 * della Response su `error.context`, e `data` è null. Leggerli dal `message`
 * dava sempre "unknown" («Errore durante la verifica del codice»).
 */
export async function readVerifyOtpError(
    error: unknown
): Promise<{ code: OtpErrorCode; response: VerifyOtpResponse | null }> {
    if (!(error instanceof FunctionsHttpError)) {
        // FunctionsFetchError (rete/CORS), FunctionsRelayError o errore sconosciuto.
        return { code: "unknown", response: null };
    }

    const status = error.context.status;
    type ErrorBody = { error?: unknown; attempts_left?: unknown; max_attempts?: unknown };
    let body: ErrorBody | null = null;
    try {
        body = (await error.context.clone().json()) as ErrorBody;
    } catch {
        // body assente o non JSON: ci basiamo sullo status
    }

    const response: VerifyOtpResponse = {};
    if (typeof body?.attempts_left === "number") response.attempts_left = body.attempts_left;
    if (typeof body?.max_attempts === "number") response.max_attempts = body.max_attempts;

    const appCode = typeof body?.error === "string" ? body.error : null;
    const code: OtpErrorCode =
        status === 401 || appCode === "unauthorized"
            ? "unauthorized"
            : appCode === "invalid_or_expired" || appCode === "invalid_code"
              ? "invalid_or_expired"
              : appCode === "locked"
                ? "locked"
                : appCode === "cooldown"
                  ? "cooldown"
                  : appCode === "rate_limited" || status === 429
                    ? "rate_limited"
                    : "unknown";

    return { code, response };
}
