import { describe, it, expect } from "vitest";
import { classifyGeminiFailure } from "../../../supabase/functions/_shared/geminiFailure";

// Real-shape 429 body (Gemini RESOURCE_EXHAUSTED). quotaId discriminates RPD vs RPM/TPM.
const quotaBody = (quotaId: string, retryDelay?: string) => ({
    error: {
        code: 429,
        message: "You exceeded your current quota.",
        status: "RESOURCE_EXHAUSTED",
        details: [
            {
                "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                violations: [{ quotaMetric: "m", quotaId, quotaDimensions: { model: "gemini-3.5-flash" } }]
            },
            ...(retryDelay
                ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }]
                : [])
        ]
    }
});

describe("classifyGeminiFailure", () => {
    it("429 daily quota (PerDay) -> rate_limit_rpd, 429", () => {
        const r = classifyGeminiFailure({
            geminiHttpStatus: 429,
            geminiErrorBody: quotaBody("GenerateRequestsPerDayPerProjectPerModel-FreeTier")
        });
        expect(r.httpStatus).toBe(429);
        expect(r.code).toBe("rate_limit_rpd");
        expect(r.messageIt).toMatch(/giornalier/i);
    });

    it("429 per-minute quota (PerMinute) -> rate_limit_rpm_tpm, 429", () => {
        const r = classifyGeminiFailure({
            geminiHttpStatus: 429,
            geminiErrorBody: quotaBody("GenerateRequestsPerMinutePerProjectPerModel-FreeTier")
        });
        expect(r.httpStatus).toBe(429);
        expect(r.code).toBe("rate_limit_rpm_tpm");
    });

    it("429 with RetryInfo retryDelay '14s' -> retryAfterSeconds 14", () => {
        const r = classifyGeminiFailure({
            geminiHttpStatus: 429,
            geminiErrorBody: quotaBody("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "14s")
        });
        expect(r.retryAfterSeconds).toBe(14);
    });

    it("429 with unparsable body -> generic rate_limit fallback, still 429", () => {
        const r = classifyGeminiFailure({ geminiHttpStatus: 429, geminiErrorBody: "not json" });
        expect(r.httpStatus).toBe(429);
        expect(r.code).toBe("rate_limit");
        expect(r.retryAfterSeconds).toBeUndefined();
    });

    it("finishReason SAFETY -> content_blocked, 422", () => {
        const r = classifyGeminiFailure({ finishReason: "SAFETY" });
        expect(r.httpStatus).toBe(422);
        expect(r.code).toBe("content_blocked");
    });

    it("finishReason RECITATION -> content_blocked, 422", () => {
        const r = classifyGeminiFailure({ finishReason: "RECITATION" });
        expect(r.code).toBe("content_blocked");
        expect(r.httpStatus).toBe(422);
    });

    it("finishReason MAX_TOKENS -> max_tokens, 422, message preserved", () => {
        const r = classifyGeminiFailure({ finishReason: "MAX_TOKENS" });
        expect(r.httpStatus).toBe(422);
        expect(r.code).toBe("max_tokens");
        expect(r.messageIt).toBe(
            "Il menu e' troppo lungo per essere elaborato in una volta. Riprova con meno pagine."
        );
    });

    it("network error -> upstream_unavailable, 502", () => {
        const r = classifyGeminiFailure({ isNetworkError: true });
        expect(r.httpStatus).toBe(502);
        expect(r.code).toBe("upstream_unavailable");
    });

    it("Gemini HTTP 400 -> bad_response, 500", () => {
        const r = classifyGeminiFailure({ geminiHttpStatus: 400, geminiErrorBody: { error: { code: 400 } } });
        expect(r.httpStatus).toBe(500);
        expect(r.code).toBe("bad_response");
    });

    it("Gemini HTTP 503 (other upstream) -> upstream_unavailable, 502", () => {
        const r = classifyGeminiFailure({ geminiHttpStatus: 503 });
        expect(r.httpStatus).toBe(502);
        expect(r.code).toBe("upstream_unavailable");
    });

    it("no signal (empty/parse failure, finishReason STOP) -> bad_response, 500", () => {
        expect(classifyGeminiFailure({ finishReason: "STOP" }).code).toBe("bad_response");
        expect(classifyGeminiFailure({}).code).toBe("bad_response");
        expect(classifyGeminiFailure({}).httpStatus).toBe(500);
    });

    it("network error takes precedence over a stale finishReason", () => {
        const r = classifyGeminiFailure({ isNetworkError: true, finishReason: "MAX_TOKENS" });
        expect(r.code).toBe("upstream_unavailable");
    });
});
