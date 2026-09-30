import { describe, expect, it } from "vitest";
import { CURRENT_CONSENT_VERSIONS as FRONTEND_VERSIONS } from "@/config/consentVersions";
import { CURRENT_CONSENT_VERSIONS, PRIVACY_PUBLISHED_AT } from "./consentVersions.ts";
import { leadConsentText } from "./leadConsent.ts";

describe("leadConsentText", () => {
    it("registra la data del testo pubblicato su /legal/privacy", () => {
        expect(leadConsentText()).toBe(
            `Informativa privacy versione ${PRIVACY_PUBLISHED_AT} (/legal/privacy)`
        );
    });

    it("il testo pubblicato non è più vecchio della versione del consenso", () => {
        expect(PRIVACY_PUBLISHED_AT >= CURRENT_CONSENT_VERSIONS.privacy).toBe(true);
    });

    it("il frontend usa la stessa fonte (niente coppia SYNC)", () => {
        expect(FRONTEND_VERSIONS).toBe(CURRENT_CONSENT_VERSIONS);
    });
});
