import { describe, it, expect } from "vitest";
import { minutesUntil, waitingRefetchDelayMs } from "@/services/translation/waiting";
import { waitingRefetchDelay } from "@/hooks/useTranslationCoverage";
import type { TranslationCoverage } from "@/services/supabase/tenantLanguages";

const NOW = Date.parse("2026-10-12T10:00:00Z");
const at = (sec: number) => new Date(NOW + sec * 1000).toISOString();

describe("minutesUntil", () => {
    it("arrotonda per eccesso", () => {
        expect(minutesUntil(at(9 * 60 + 1), NOW)).toBe(10);
        expect(minutesUntil(at(60), NOW)).toBe(1);
    });

    it("mai sotto 1, anche a partenza passata", () => {
        expect(minutesUntil(at(5), NOW)).toBe(1);
        expect(minutesUntil(at(-30), NOW)).toBe(1);
    });
});

describe("waitingRefetchDelayMs", () => {
    it("aspetta la prima lingua in attesa più 5 secondi", () => {
        const states = [
            { state: "waiting", runAfter: at(300) },
            { state: "waiting", runAfter: at(120) },
            { state: "done" }
        ];
        expect(waitingRefetchDelayMs(states, NOW)).toBe(125_000);
    });

    it("mai sotto 5 secondi", () => {
        expect(waitingRefetchDelayMs([{ state: "waiting", runAfter: at(-60) }], NOW)).toBe(5000);
    });

    it("null senza lingue in attesa", () => {
        expect(waitingRefetchDelayMs([{ state: "pending" }], NOW)).toBeNull();
        expect(waitingRefetchDelayMs(null, NOW)).toBeNull();
    });
});

describe("waitingRefetchDelay (copertura)", () => {
    const lang = (waiting: number, next_run_at: string | null) => ({
        total: 10, fresh: 0, stale: 0, pending: 0, waiting, next_run_at, failed: 0, missing: 0, last_updated: null
    });

    it("con soli job in attesa: alla prima partenza più 5 secondi", () => {
        const coverage: TranslationCoverage = { en: lang(2, at(300)), fr: lang(1, at(200)) };
        expect(waitingRefetchDelay(coverage, NOW)).toBe(205_000);
    });

    it("mai sotto il ritmo base di 15 secondi", () => {
        expect(waitingRefetchDelay({ en: lang(1, at(2)) }, NOW)).toBe(15_000);
    });

    it("mai oltre 11 minuti, anche con un orologio storto", () => {
        expect(waitingRefetchDelay({ en: lang(1, at(3600)) }, NOW)).toBe(11 * 60_000);
    });

    it("null senza attese (e con la RPC di prima, senza il campo)", () => {
        expect(waitingRefetchDelay({ en: lang(0, null) }, NOW)).toBeNull();
        const old = { en: { total: 1, fresh: 1, stale: 0, pending: 0, failed: 0, missing: 0, last_updated: null } };
        expect(waitingRefetchDelay(old, NOW)).toBeNull();
    });
});
