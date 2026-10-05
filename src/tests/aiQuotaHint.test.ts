import { describe, it, expect } from "vitest";
import { aiQuotaHint } from "@/utils/aiUsage";
import type { AiUsageCycle, AiUsageStatus } from "@/types/aiUsage";

function usage(status: AiUsageStatus, percent: number | null = 50): AiUsageCycle {
    return {
        eligible: status !== "not_eligible",
        status,
        percent,
        quotaNanosUsd: null,
        totalCostNanosUsd: null,
        resetAt: "2026-11-01T00:00:00Z",
        windowStart: null,
        windowEnd: null,
        breakdown: []
    };
}

describe("aiQuotaHint", () => {
    it("niente riga finché lo stato non è caricato o la quota è ok", () => {
        expect(aiQuotaHint(null)).toBeNull();
        expect(aiQuotaHint(undefined)).toBeNull();
        expect(aiQuotaHint(usage("ok"))).toBeNull();
    });

    it("quasi esaurita: avviso, bottone attivo", () => {
        expect(aiQuotaHint(usage("warning", 84.6))).toEqual({
            blocked: false,
            message: "AI di questo mese quasi esaurita (85% usata)."
        });
        expect(aiQuotaHint(usage("warning", null))?.message).toBe("AI di questo mese quasi esaurita.");
    });

    it("esaurita: bottone spento con la data di ripartenza", () => {
        const hint = aiQuotaHint(usage("blocked", 100));
        expect(hint?.blocked).toBe(true);
        expect(hint?.message).toMatch(/^Hai esaurito l'AI di questo mese\. Riparte il 1 novembre 2026\.$/);
    });

    it("senza abbonamento attivo: bottone spento", () => {
        expect(aiQuotaHint(usage("not_eligible"))).toEqual({
            blocked: true,
            message: "L'AI è disponibile con un abbonamento attivo."
        });
    });
});
