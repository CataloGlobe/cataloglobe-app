import { describe, it, expect, vi } from "vitest";
import { isRetryable, runWithRetry, TimeoutError, type RetryOptions } from "../../context/authRetry";

describe("isRetryable", () => {
    it("returns true for TimeoutError", () => {
        expect(isRetryable(new TimeoutError())).toBe(true);
    });

    it("returns true for fetch TypeError", () => {
        const e = new TypeError("Failed to fetch");
        expect(isRetryable(e)).toBe(true);
    });

    it("returns true for AuthRetryableFetchError (supabase-js)", () => {
        const e: Error & { name: string } = new Error("Service unavailable");
        e.name = "AuthRetryableFetchError";
        expect(isRetryable(e)).toBe(true);
    });

    it("returns true for 'network' wording on TypeError", () => {
        const e = new TypeError("network error");
        expect(isRetryable(e)).toBe(true);
    });

    it("returns true for retryable HTTP status set", () => {
        for (const status of [408, 425, 429, 502, 503, 504]) {
            expect(isRetryable({ status })).toBe(true);
        }
    });

    it("returns false for non-retryable HTTP status", () => {
        for (const status of [400, 401, 403, 404, 409, 500]) {
            expect(isRetryable({ status })).toBe(false);
        }
    });

    it("returns false for any PostgrestError PGRST* code (RLS/parsing)", () => {
        expect(isRetryable({ code: "PGRST116", message: "no row" })).toBe(false);
        expect(isRetryable({ code: "PGRST301", message: "RLS" })).toBe(false);
    });

    it("returns false for a generic Error", () => {
        expect(isRetryable(new Error("boom"))).toBe(false);
    });
});

describe("runWithRetry", () => {
    function makeOpts(overrides: Partial<RetryOptions> = {}): RetryOptions {
        return {
            schedule: [0, 800],
            perAttemptTimeoutMs: 100,
            totalBudgetMs: 14_000,
            startedAt: Date.now(),
            jitterMs: 0,
            sleep: vi.fn(async () => {}),
            ...overrides
        };
    }

    it("1st attempt success → no delay added, attempts=1", async () => {
        const opts = makeOpts();
        const factory = vi.fn(async () => "ok");
        const res = await runWithRetry(factory, opts);

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.value).toBe("ok");
            expect(res.attempts).toBe(1);
        }
        expect(factory).toHaveBeenCalledTimes(1);
        expect(opts.sleep).not.toHaveBeenCalled();
    });

    it("transient (timeout) then success → 1 retry, no error", async () => {
        const opts = makeOpts();
        let n = 0;
        const factory = vi.fn(async () => {
            n++;
            if (n === 1) throw new TimeoutError();
            return "ok";
        });
        const res = await runWithRetry(factory, opts);

        expect(res.ok).toBe(true);
        if (res.ok) expect(res.attempts).toBe(2);
        expect(factory).toHaveBeenCalledTimes(2);
        expect(opts.sleep).toHaveBeenCalledTimes(1);
        expect(opts.sleep).toHaveBeenCalledWith(800);
    });

    it("all timeouts → ok=false (check failed), attempts=schedule.length", async () => {
        const opts = makeOpts();
        const factory = vi.fn(async () => {
            throw new TimeoutError();
        });
        const res = await runWithRetry(factory, opts);

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.attempts).toBe(2);
            expect(res.budgetExhausted).toBe(false);
            expect(res.error).toBeInstanceOf(TimeoutError);
        }
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it("non-retryable PGRST* error → immediate fail, no retry", async () => {
        const opts = makeOpts();
        const err = { code: "PGRST116", message: "RLS denied" };
        const factory = vi.fn(async () => {
            throw err;
        });
        const res = await runWithRetry(factory, opts);

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.attempts).toBe(1);
            expect(res.budgetExhausted).toBe(false);
            expect(res.error).toBe(err);
        }
        expect(factory).toHaveBeenCalledTimes(1);
        expect(opts.sleep).not.toHaveBeenCalled();
    });

    it("getUser-like factory: AuthRetryableFetchError on 1st attempt → retry, NOT no-session", async () => {
        // Simula AuthProvider factory: const { data, error } = await getUser();
        // if (error) throw error; → primo errore retryable, secondo success.
        const opts = makeOpts();
        let n = 0;
        const factory = vi.fn(async (): Promise<string | null> => {
            n++;
            if (n === 1) {
                const e: Error & { name: string; status?: number } = new Error("503");
                e.name = "AuthRetryableFetchError";
                e.status = 503;
                throw e;
            }
            return "user-123";
        });
        const res = await runWithRetry<string | null>(factory, opts);

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.value).toBe("user-123"); // userId, NOT null (no-session)
            expect(res.attempts).toBe(2);
        }
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it("budget exhausted before any attempt → ok=false, budgetExhausted=true, attempts=0", async () => {
        // startedAt nel passato così che elapsed > budget al primo check
        const opts = makeOpts({
            startedAt: Date.now() - 20_000,
            totalBudgetMs: 14_000
        });
        const factory = vi.fn(async () => "should-not-run");
        const res = await runWithRetry(factory, opts);

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.attempts).toBe(0);
            expect(res.budgetExhausted).toBe(true);
        }
        expect(factory).not.toHaveBeenCalled();
        expect(opts.sleep).not.toHaveBeenCalled();
    });
});
