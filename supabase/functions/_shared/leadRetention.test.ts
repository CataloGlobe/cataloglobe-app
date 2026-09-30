import { describe, expect, it } from "vitest";
import { LEAD_KEPT_STATUS, LEAD_RETENTION_MONTHS, leadRetentionCutoff } from "./leadRetention.ts";

describe("leadRetentionCutoff", () => {
    it("12 mesi di calendario prima", () => {
        expect(leadRetentionCutoff(new Date("2026-09-26T03:45:00Z")).toISOString()).toBe("2025-09-26T03:45:00.000Z");
    });

    it("29 febbraio: conserva un giorno in più, mai uno in meno", () => {
        expect(leadRetentionCutoff(new Date("2028-02-29T03:45:00Z")).toISOString()).toBe("2027-03-01T03:45:00.000Z");
    });

    it("costanti dichiarate nell'informativa", () => {
        expect(LEAD_RETENTION_MONTHS).toBe(12);
        expect(LEAD_KEPT_STATUS).toBe("won");
    });
});
