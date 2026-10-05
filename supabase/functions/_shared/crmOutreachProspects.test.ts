import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
    OUTREACH_EXCLUSION_LABEL,
    isLargeChain,
    normalizeOutreachEmail,
    outreachExclusion,
    outreachStartScore,
    type OutreachExclusion,
    type OutreachProspectSignals
} from "./crmOutreachProspects";

const base: OutreachProspectSignals = {
    email: "info@locale.it",
    phone_e164: null,
    instagram: null,
    website: null,
    email_check: "da_verificare",
    rating: null,
    reviews_count: null,
    has_online_menu: null,
    locations_count: null
};

const free = { suppressed: false, alreadyLead: false, alreadyClient: false };

describe("normalizeOutreachEmail", () => {
    it("minuscole e senza spazi, vuota = null", () => {
        expect(normalizeOutreachEmail("  Info@Locale.IT ")).toBe("info@locale.it");
        expect(normalizeOutreachEmail("   ")).toBeNull();
        expect(normalizeOutreachEmail(null)).toBeNull();
    });
});

describe("outreachStartScore", () => {
    it("parte da 40 senza segnali", () => {
        expect(outreachStartScore(base)).toBe(40);
    });

    it("locale vivo, senza menù online e mail valida sale in alto", () => {
        expect(
            outreachStartScore({ ...base, reviews_count: 320, rating: 4.5, has_online_menu: false, website: "x", email_check: "valida" })
        ).toBe(90);
    });

    it("la piccola catena prende un punto in più, ma da sola non arriva in cima", () => {
        const chain = outreachStartScore({ ...base, locations_count: 2 });
        expect(chain).toBe(50);
        expect(chain).toBeLessThan(outreachStartScore({ ...base, reviews_count: 60, rating: 4.4 }));
        expect(outreachStartScore({ ...base, locations_count: 8 })).toBe(40);
    });

    it("mail rischiosa scende; mail non valida senza altri recapiti vale 0", () => {
        expect(outreachStartScore({ ...base, email_check: "rischiosa" })).toBe(25);
        expect(outreachStartScore({ ...base, email_check: "non_valida" })).toBe(0);
        expect(outreachStartScore({ ...base, email_check: "non_valida", instagram: "locale" })).toBe(40);
    });

    it("resta tra 0 e 100", () => {
        const s = outreachStartScore({
            ...base,
            reviews_count: 9999,
            rating: 5,
            has_online_menu: false,
            locations_count: 2,
            website: "x",
            email_check: "valida"
        });
        expect(s).toBeLessThanOrEqual(100);
    });
});

describe("outreachExclusion", () => {
    it("la lista stop vince su tutto", () => {
        expect(outreachExclusion({ ...base, locations_count: 10 }, { suppressed: true, alreadyLead: true, alreadyClient: true })).toBe(
            "lista_stop"
        );
    });

    it("già cliente prima di già lead", () => {
        expect(outreachExclusion(base, { ...free, alreadyLead: true, alreadyClient: true })).toBe("gia_cliente");
        expect(outreachExclusion(base, { ...free, alreadyLead: true })).toBe("gia_lead");
    });

    it("catena grande da 3 sedi in su: all'inizio solo una o due sedi", () => {
        expect(isLargeChain(2)).toBe(false);
        expect(isLargeChain(3)).toBe(true);
        expect(outreachExclusion({ ...base, locations_count: 2 }, free)).toBeNull();
        expect(outreachExclusion({ ...base, locations_count: 3 }, free)).toBe("catena_grande");
    });

    it("senza recapiti validi non si contatta", () => {
        expect(outreachExclusion({ ...base, email_check: "non_valida" }, free)).toBe("non_valida");
        expect(outreachExclusion({ ...base, email: null, phone_e164: "+393331234567" }, free)).toBeNull();
    });

    it("i motivi coincidono con il CHECK della migrazione", () => {
        const sql = readFileSync("supabase/migrations/20261006110000_crm_outreach_prospects.sql", "utf8");
        for (const reason of Object.keys(OUTREACH_EXCLUSION_LABEL) as OutreachExclusion[]) {
            expect(sql).toContain(`'${reason}'`);
        }
    });
});
