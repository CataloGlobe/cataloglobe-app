// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { classifyGeminiFailure, type ClassifiedFailure } from "../_shared/geminiFailure.ts";
import { MAX_ATTEMPTS, isRetryable, computeBackoffSeconds } from "../_shared/geminiRetry.ts";
import { serializeError } from "../_shared/errors.ts";

/* ────────────────────────────── CORS ────────────────────────────── */
// CORS defined inline (no shared helper exists in the repo — same as
// menu-ai-import). Keep identical headers for consistency.

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

/* ────────────────────────────── Helpers ─────────────────────────── */

function jsonOk(data: unknown) {
    return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

function jsonError(error: string, status: number, code?: string, retryAfter?: number) {
    const payload: Record<string, unknown> = { success: false, error };
    if (code) payload.code = code;
    if (retryAfter !== undefined) payload.retry_after = retryAfter;
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

interface FailureContext {
    nameLength: number;
    verticalType: string;
    tenantId: string;
    debug?: string;
}

// Classified-failure response: emits ONE structured log line (code + input
// metadata, never the generated text) and returns the payload with `code` and
// optional `retry_after`. Mirrors menu-ai-import so 429/502/500 stay distinct.
function failureResponse(classified: ClassifiedFailure, ctx: FailureContext) {
    console.error(
        "[product-ai-enrich] failure",
        JSON.stringify({
            code: classified.code,
            http_status: classified.httpStatus,
            name_length: ctx.nameLength,
            vertical_type: ctx.verticalType,
            tenant_id: ctx.tenantId,
            ...(classified.retryAfterSeconds !== undefined
                ? { retry_after_seconds: classified.retryAfterSeconds }
                : {}),
            ...(ctx.debug ? { debug: ctx.debug } : {})
        })
    );
    return jsonError(
        classified.messageIt,
        classified.httpStatus,
        classified.code,
        classified.retryAfterSeconds
    );
}

/* ────────────────────────────── Prompt ──────────────────────────── */

const MAX_NAME_LENGTH = 200;

// Maps the canonical tenant vertical_type to an Italian tone hint for the model.
const VERTICAL_TONE: Record<string, string> = {
    food_beverage: "ristorante / bar (food & beverage)",
    restaurant: "ristorante",
    bar: "bar",
    retail: "negozio retail",
    hotel: "hotel",
    generic: "generico"
};

const SYSTEM_PROMPT = `Sei un copywriter per menu e cataloghi di attività food & beverage e retail.
Genera UNA descrizione breve, in ITALIANO, di massimo 2 frasi (circa 200-280 caratteri) per il prodotto indicato.

## Tono
- Tono invitante e professionale, coerente col tipo di attività indicato.
- Se il tipo di attività manca, usa un tono neutro-invitante.
- Usa la categoria, se fornita, solo come contesto per il tono e l'ambito.

## Vincoli di contenuto (obbligatori)
- Solo testo descrittivo invitante.
- NIENTE prezzi.
- NIENTE claim su allergeni, valori nutrizionali o proprietà dietetiche/salutistiche.
- NIENTE elenchi di ingredienti presentati come certi: non conosci la ricetta reale del prodotto.
- NIENTE markdown, NIENTE emoji, NIENTE virgolette all'interno del testo.

## Output
Rispondi esclusivamente con un oggetto JSON: { "description": "..." }`;

/* ────────────────────────── Response schema ─────────────────────── */
// Structured output (responseMimeType + responseSchema, OpenAPI-subset form),
// same approach as menu-ai-import. Forces a single string field.
const ENRICH_SCHEMA = {
    type: "object",
    properties: {
        description: { type: "string", description: "Italian product description, max 2 sentences" }
    },
    required: ["description"]
};

/* ────────────────────────────── Main ───────────────────────────── */

serve(async (req: Request) => {
    // ── Preflight ─────────────────────────────────────────────────
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonError("Metodo non consentito", 405, "method_not_allowed");
    }

    try {
        // ── Body parsing + validation ─────────────────────────────
        const body = await req.json().catch(() => null);
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        const verticalType = typeof body?.verticalType === "string" ? body.verticalType : "";
        const categoryName = typeof body?.categoryName === "string" ? body.categoryName.trim() : "";
        // tenantId accepted and logged for future cost attribution — unused for now.
        const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";

        if (name.length === 0) {
            return jsonError("Nome prodotto obbligatorio", 400, "invalid_input");
        }
        if (name.length > MAX_NAME_LENGTH) {
            return jsonError("Nome prodotto troppo lungo", 400, "invalid_input");
        }

        const failureCtx: Omit<FailureContext, "debug"> = {
            nameLength: name.length,
            verticalType: verticalType || "none",
            tenantId: tenantId || "none"
        };

        // ── Gemini API key ────────────────────────────────────────
        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiKey) {
            console.error("[product-ai-enrich] GEMINI_API_KEY not configured");
            return jsonError("Servizio AI non configurato", 500, "not_configured");
        }

        // ── Build prompt ──────────────────────────────────────────
        const userLines = [`Nome prodotto: ${name}`];
        if (verticalType) {
            userLines.push(`Tipo di attività: ${VERTICAL_TONE[verticalType] ?? verticalType}`);
        }
        if (categoryName) {
            userLines.push(`Categoria: ${categoryName}`);
        }

        const parts = [
            { text: SYSTEM_PROMPT },
            { text: userLines.join("\n") }
        ];

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

        const startMs = Date.now();

        const geminiRequestInit: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
            body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                    // Short single-paragraph output: a small ceiling is enough.
                    maxOutputTokens: 512,
                    thinkingConfig: { thinkingLevel: "LOW" },
                    responseMimeType: "application/json",
                    responseSchema: ENRICH_SCHEMA
                }
            })
        };

        // ── Gemini call with limited retry on transient failures ──
        // Same delegation pattern as menu-ai-import: retry ONLY transient causes
        // (network/5xx, per-minute rate-limit) via the shared pure helpers.
        let geminiRes: Response;
        let attempt = 1;
        while (true) {
            let classified: ClassifiedFailure;
            let debug: string;
            try {
                const res = await fetch(geminiUrl, geminiRequestInit);
                if (res.ok) {
                    geminiRes = res;
                    break;
                }
                const errText = await res.text();
                let errBody: unknown = errText;
                try {
                    errBody = JSON.parse(errText);
                } catch {
                    // non-JSON body: classifier degrades to a generic code
                }
                classified = classifyGeminiFailure({ geminiHttpStatus: res.status, geminiErrorBody: errBody });
                debug = `HTTP ${res.status}: ${errText.slice(0, 500)}`;
            } catch (networkErr) {
                classified = classifyGeminiFailure({ isNetworkError: true });
                debug = serializeError(networkErr).message;
            }

            const backoff =
                attempt < MAX_ATTEMPTS && isRetryable(classified.code)
                    ? computeBackoffSeconds(attempt, classified.retryAfterSeconds)
                    : null;
            if (backoff === null) {
                return failureResponse(classified, { ...failureCtx, debug });
            }
            console.error(
                "[product-ai-enrich] retry",
                JSON.stringify({ code: classified.code, attempt, backoff_seconds: backoff })
            );
            await new Promise((resolve) => setTimeout(resolve, backoff * 1000));
            attempt++;
        }

        const processingTimeMs = Date.now() - startMs;

        // ── Parse Gemini response ─────────────────────────────────
        const geminiData = await geminiRes.json();

        const candidate = geminiData?.candidates?.[0];
        const finishReason: string | undefined = candidate?.finishReason;

        if (finishReason && finishReason !== "STOP") {
            return failureResponse(classifyGeminiFailure({ finishReason }), {
                ...failureCtx,
                debug: `finishReason=${finishReason}`
            });
        }

        const rawText = candidate?.content?.parts?.[0]?.text;
        if (!rawText) {
            return failureResponse(classifyGeminiFailure({}), {
                ...failureCtx,
                debug: "empty Gemini response"
            });
        }

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(rawText);
        } catch {
            return failureResponse(classifyGeminiFailure({}), {
                ...failureCtx,
                debug: `JSON parse failed. finishReason=${finishReason}. raw=${rawText.slice(0, 300)}`
            });
        }

        const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
        if (description.length === 0) {
            return failureResponse(classifyGeminiFailure({}), {
                ...failureCtx,
                debug: `missing description: ${JSON.stringify(parsed).slice(0, 300)}`
            });
        }

        // ── Build response ────────────────────────────────────────
        return jsonOk({
            description,
            metadata: {
                model_used: "gemini-2.5-flash",
                processing_time_ms: processingTimeMs
            }
        });
    } catch (err) {
        console.error("[product-ai-enrich] Unhandled error:", serializeError(err));
        return jsonError("Errore nella generazione della descrizione", 500, "SERVER_ERROR");
    }
});
