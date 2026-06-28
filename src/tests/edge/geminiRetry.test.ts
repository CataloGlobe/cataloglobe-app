import { describe, it, expect } from "vitest";
import {
    MAX_ATTEMPTS,
    BASE_BACKOFF_SECONDS,
    MAX_BACKOFF_SECONDS,
    RETRYABLE_CODES,
    isRetryable,
    computeBackoffSeconds
} from "../../../supabase/functions/_shared/geminiRetry";
import type { GeminiFailureCode } from "../../../supabase/functions/_shared/geminiFailure";

describe("geminiRetry constants", () => {
    it("bounds attempts and backoff", () => {
        expect(MAX_ATTEMPTS).toBe(3);
        expect(BASE_BACKOFF_SECONDS).toBe(1);
        expect(MAX_BACKOFF_SECONDS).toBe(6);
    });

    it("retryable set is exactly the two transient causes", () => {
        expect([...RETRYABLE_CODES].sort()).toEqual(["rate_limit_rpm_tpm", "upstream_unavailable"]);
    });
});

describe("isRetryable", () => {
    it("true only for transient causes", () => {
        expect(isRetryable("upstream_unavailable")).toBe(true);
        expect(isRetryable("rate_limit_rpm_tpm")).toBe(true);
    });

    it("false for RPD wall and deterministic failures", () => {
        const notRetryable: GeminiFailureCode[] = [
            "rate_limit_rpd",
            "rate_limit",
            "content_blocked",
            "max_tokens",
            "bad_response"
        ];
        for (const c of notRetryable) expect(isRetryable(c)).toBe(false);
    });
});

describe("computeBackoffSeconds", () => {
    it("exponential progression without retryAfter", () => {
        expect(computeBackoffSeconds(1)).toBe(1); // 1 * 2^0
        expect(computeBackoffSeconds(2)).toBe(2); // 1 * 2^1
        expect(computeBackoffSeconds(3)).toBe(4); // 1 * 2^2
    });

    it("caps exponential growth at MAX_BACKOFF_SECONDS", () => {
        expect(computeBackoffSeconds(4)).toBe(6); // 2^3 = 8 -> capped to 6
        expect(computeBackoffSeconds(10)).toBe(6);
    });

    it("honours a short retryAfter", () => {
        expect(computeBackoffSeconds(1, 3)).toBe(3);
        expect(computeBackoffSeconds(2, 0)).toBe(0);
    });

    it("accepts retryAfter exactly at the cap", () => {
        expect(computeBackoffSeconds(1, MAX_BACKOFF_SECONDS)).toBe(6);
    });

    it("returns null when retryAfter exceeds the cap (do not hold the edge open)", () => {
        expect(computeBackoffSeconds(1, MAX_BACKOFF_SECONDS + 1)).toBeNull();
        expect(computeBackoffSeconds(1, 30)).toBeNull();
    });
});
