import { describe, it, expect } from "vitest";
import { buildSubscriptionSupportMailto } from "@/pages/Business/supportMailto";

describe("buildSubscriptionSupportMailto", () => {
    const href = buildSubscriptionSupportMailto({
        supportEmail: "support@example.com",
        tenantId: "5b37c952-1add-4196-aab3-9775d98a9c32",
        tenantName: "Trattoria & Co"
    });

    it("targets the support address with the company in the subject", () => {
        expect(href.startsWith("mailto:support@example.com?subject=")).toBe(true);
        const subject = new URLSearchParams(href.split("?")[1]).get("subject");
        expect(subject).toBe("Abbonamento CataloGlobe — Trattoria & Co");
    });

    it("carries the tenant id in the body so support can find the row", () => {
        const body = new URLSearchParams(href.split("?")[1]).get("body") ?? "";
        expect(body).toContain("Riferimento azienda: 5b37c952-1add-4196-aab3-9775d98a9c32");
        expect(body).toContain("«Trattoria & Co»");
    });
});
