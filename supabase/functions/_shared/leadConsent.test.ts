import { describe, expect, it } from "vitest";
import { CURRENT_CONSENT_VERSIONS as FRONTEND_VERSIONS } from "@/config/consentVersions";
import { CURRENT_CONSENT_VERSIONS } from "./consentVersions.ts";
import { leadConsentText } from "./leadConsent.ts";

describe("leadConsentText", () => {
    it("registra la versione dell'informativa privacy in vigore", () => {
        expect(leadConsentText()).toBe(
            `Informativa privacy versione ${CURRENT_CONSENT_VERSIONS.privacy} (/legal/privacy)`
        );
    });

    it("usa la stessa versione del frontend (fonte unica)", () => {
        expect(FRONTEND_VERSIONS).toBe(CURRENT_CONSENT_VERSIONS);
        expect(leadConsentText()).toContain(FRONTEND_VERSIONS.privacy);
    });
});
