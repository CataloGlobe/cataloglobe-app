import { describe, expect, it } from "vitest";
import { COOKIE_CONSENT_VERSION } from "@/config/clarity";
import {
    clarityCookieDeletions,
    isConsentCurrent,
    parseStoredConsent,
    serializeConsent,
    shouldLoadClarity,
    shouldShowBanner,
    type StoredConsent
} from "@/pages/CampaignLanding/cookieConsent";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const PROD = "cataloglobe.com";

function consent(choice: StoredConsent["choice"], decidedAt = NOW, version = COOKIE_CONSENT_VERSION): StoredConsent {
    return { version, choice, decidedAt: decidedAt.toISOString() };
}

function load(hostname: string, pathname: string, c: StoredConsent | null, now = NOW) {
    return shouldLoadClarity({ hostname, pathname, consent: c, now });
}

describe("nessuna scelta", () => {
    it("mostra il banner e non carica Clarity", () => {
        expect(shouldShowBanner(null, NOW)).toBe(true);
        expect(load(PROD, "/", null)).toBe(false);
    });
});

describe("accetta / rifiuta", () => {
    it("accetta su produzione carica Clarity su / e /b, banner chiuso", () => {
        const c = consent("accepted");
        expect(shouldShowBanner(c, NOW)).toBe(false);
        expect(load(PROD, "/", c)).toBe(true);
        expect(load(PROD, "/b", c)).toBe(true);
    });

    it("rifiuta chiude il banner e non carica Clarity", () => {
        const c = consent("rejected");
        expect(shouldShowBanner(c, NOW)).toBe(false);
        expect(load(PROD, "/", c)).toBe(false);
        expect(load(PROD, "/b", c)).toBe(false);
    });

    it("la scelta serializzata si rilegge uguale, con versione e data", () => {
        const parsed = parseStoredConsent(serializeConsent("accepted", NOW));
        expect(parsed).toEqual({ version: COOKIE_CONSENT_VERSION, choice: "accepted", decidedAt: NOW.toISOString() });
    });
});

describe("scadenza a 6 mesi", () => {
    const decided = new Date("2026-04-02T10:00:00.000Z");

    it("valida fino al giorno prima dei 6 mesi", () => {
        const c = consent("accepted", decided);
        const dayBefore = new Date("2026-10-01T10:00:00.000Z");
        expect(isConsentCurrent(c, dayBefore)).toBe(true);
        expect(shouldShowBanner(c, dayBefore)).toBe(false);
        expect(load(PROD, "/", c, dayBefore)).toBe(true);
    });

    it("scaduta il giorno dopo: banner di nuovo, Clarity no", () => {
        const c = consent("accepted", decided);
        const dayAfter = new Date("2026-10-03T10:00:00.000Z");
        expect(isConsentCurrent(c, dayAfter)).toBe(false);
        expect(shouldShowBanner(c, dayAfter)).toBe(true);
        expect(load(PROD, "/", c, dayAfter)).toBe(false);
    });

    it("anche un rifiuto scade e ripropone il banner", () => {
        const c = consent("rejected", decided);
        expect(shouldShowBanner(c, new Date("2026-10-03T10:00:00.000Z"))).toBe(true);
    });
});

describe("cambio versione", () => {
    it("una scelta di un'altra versione non vale: banner sì, Clarity no", () => {
        const c = consent("accepted", NOW, COOKIE_CONSENT_VERSION - 1);
        expect(shouldShowBanner(c, NOW)).toBe(true);
        expect(load(PROD, "/", c)).toBe(false);
    });
});

describe("hostname e pagine fuori produzione", () => {
    const accepted = consent("accepted");

    it.each([
        "localhost",
        "127.0.0.1",
        "www.cataloglobe.com",
        "staging.cataloglobe.com",
        "cataloglobe-git-staging-cataloglobe.vercel.app",
        "cataloglobe.com.evil.example"
    ])("%s: mai Clarity, anche con consenso", (hostname) => {
        expect(load(hostname, "/", accepted)).toBe(false);
        expect(load(hostname, "/b", accepted)).toBe(false);
    });

    it.each(["/trattoria-da-mario", "/legal/privacy", "/login", "/business/abc/overview", "/b/", "/landing-dev"])(
        "%s: mai Clarity su produzione",
        (pathname) => {
            expect(load(PROD, pathname, accepted)).toBe(false);
        }
    );
});

describe("parseStoredConsent", () => {
    it.each([
        null,
        "",
        "{non json",
        "null",
        "42",
        JSON.stringify({ version: "1", choice: "accepted", decidedAt: NOW.toISOString() }),
        JSON.stringify({ version: 1, choice: "maybe", decidedAt: NOW.toISOString() }),
        JSON.stringify({ version: 1, choice: "accepted", decidedAt: "ieri" }),
        JSON.stringify({ version: 1, choice: "accepted" })
    ])("valore non valido %s → nessuna scelta", (raw) => {
        expect(parseStoredConsent(raw)).toBeNull();
    });
});

describe("clarityCookieDeletions", () => {
    it("cancella _clck e _clsk sul dominio corrente e su .cataloglobe.com", () => {
        const deletions = clarityCookieDeletions("cataloglobe.com");
        for (const name of ["_clck", "_clsk"]) {
            expect(deletions).toContain(`${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`);
            expect(deletions).toContain(
                `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.cataloglobe.com`
            );
        }
        expect(deletions.some((d) => d.includes("domain=.com"))).toBe(false);
    });
});
