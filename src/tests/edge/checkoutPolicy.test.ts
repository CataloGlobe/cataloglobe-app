import { describe, it, expect } from "vitest";
import {
    DEFAULT_TRIAL_PERIOD_DAYS,
    checkPromoCodeLimits,
    MAX_TRIAL_PERIOD_DAYS,
    resolvePromoTrialDays,
    resolveReturnUrl
} from "../../../supabase/functions/_shared/checkoutPolicy";

describe("resolvePromoTrialDays", () => {
    it("senza trial_days resta la prova di sempre (30 giorni)", () => {
        expect(resolvePromoTrialDays(null)).toBe(DEFAULT_TRIAL_PERIOD_DAYS);
        expect(resolvePromoTrialDays({})).toBe(DEFAULT_TRIAL_PERIOD_DAYS);
        expect(resolvePromoTrialDays({ trial_days: "  " })).toBe(DEFAULT_TRIAL_PERIOD_DAYS);
        expect(DEFAULT_TRIAL_PERIOD_DAYS).toBe(30);
    });

    it("usa i giorni del codice: 6 mesi = 180", () => {
        expect(resolvePromoTrialDays({ trial_days: "180" })).toBe(180);
        expect(resolvePromoTrialDays({ trial_days: " 90 " })).toBe(90);
        expect(resolvePromoTrialDays({ trial_days: "1" })).toBe(1);
    });

    it("rifiuta valori non validi o sopra il tetto, mai un ripiego silenzioso", () => {
        expect(MAX_TRIAL_PERIOD_DAYS).toBe(180);
        for (const bad of ["181", "365", "0", "-30", "30.5", "6 mesi", "1e2", "0x10"]) {
            expect(resolvePromoTrialDays({ trial_days: bad })).toBeNull();
        }
    });
});

describe("resolveReturnUrl", () => {
    const origins = ["http://localhost:5173", "https://staging.cataloglobe.com", "https://cataloglobe.com"];

    it("accetta un URL assoluto su un'origine dell'app", () => {
        expect(resolveReturnUrl("https://cataloglobe.com/business/t1/subscription?session=success", origins)).toBe(
            "https://cataloglobe.com/business/t1/subscription?session=success"
        );
        expect(resolveReturnUrl("http://localhost:5173/workspace", origins)).toBe("http://localhost:5173/workspace");
    });

    it("rifiuta origini esterne o somiglianti (open redirect)", () => {
        for (const bad of [
            "https://evil.example/phish",
            "https://cataloglobe.com.evil.example/",
            "https://evil.example@cataloglobe.com/",
            "https://user:pass@cataloglobe.com/",
            "http://cataloglobe.com/",
            "//evil.example/",
            "javascript:alert(1)",
            "/workspace"
        ]) {
            expect(resolveReturnUrl(bad, origins)).toBeNull();
        }
    });

    it("rifiuta un valore mancante", () => {
        expect(resolveReturnUrl(undefined, origins)).toBeNull();
        expect(resolveReturnUrl("", origins)).toBeNull();
    });
});

describe("checkPromoCodeLimits", () => {
    const NOW = 1_800_000_000;
    const base = { active: true, expires_at: null, max_redemptions: null, times_redeemed: 0, coupon: { valid: true } };

    it("un codice attivo senza limiti passa", () => {
        expect(checkPromoCodeLimits(base, NOW)).toBeNull();
        expect(checkPromoCodeLimits({ ...base, coupon: null }, NOW, 5)).toBeNull();
    });

    it("codice o coupon spenti: non valido", () => {
        expect(checkPromoCodeLimits({ ...base, active: false }, NOW)).toBe("promo_code_invalid");
        expect(checkPromoCodeLimits({ ...base, coupon: { valid: false } }, NOW)).toBe("promo_code_invalid");
    });

    it("scaduto sul codice o sul coupon, anche nel secondo esatto", () => {
        expect(checkPromoCodeLimits({ ...base, expires_at: NOW - 1 }, NOW)).toBe("promo_code_expired");
        expect(checkPromoCodeLimits({ ...base, expires_at: NOW }, NOW)).toBe("promo_code_expired");
        expect(checkPromoCodeLimits({ ...base, coupon: { valid: true, redeem_by: NOW - 60 } }, NOW)).toBe("promo_code_expired");
        expect(checkPromoCodeLimits({ ...base, expires_at: NOW + 60 }, NOW)).toBeNull();
    });

    it("limite d'uso del codice, contando anche le prove senza carta", () => {
        expect(checkPromoCodeLimits({ ...base, max_redemptions: 1, times_redeemed: 1 }, NOW)).toBe("promo_code_used_up");
        // Codice di prova senza carta: Stripe non lo conta mai, contiamo noi.
        expect(checkPromoCodeLimits({ ...base, max_redemptions: 1 }, NOW, 1)).toBe("promo_code_used_up");
        expect(checkPromoCodeLimits({ ...base, max_redemptions: 2 }, NOW, 1)).toBeNull();
    });

    it("limite d'uso del coupon", () => {
        const coupon = { valid: true, max_redemptions: 3, times_redeemed: 2 };
        expect(checkPromoCodeLimits({ ...base, coupon }, NOW)).toBeNull();
        expect(checkPromoCodeLimits({ ...base, coupon }, NOW, 1)).toBe("promo_code_used_up");
    });
});
