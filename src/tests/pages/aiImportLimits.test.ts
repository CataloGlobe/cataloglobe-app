import { describe, it, expect } from "vitest";
import {
    MAX_IMAGE_SIZE,
    MAX_PDF_SIZE,
    MAX_TOTAL_SIZE
} from "@/pages/Dashboard/Catalogs/AiMenuImport/aiImportLimits";

const MB = 1024 * 1024;

describe("aiImportLimits — single source of truth for AI import size caps", () => {
    it("exposes the exact per-type and aggregate caps", () => {
        expect(MAX_IMAGE_SIZE).toBe(25 * MB);
        expect(MAX_PDF_SIZE).toBe(20 * MB);
        expect(MAX_TOTAL_SIZE).toBe(30 * MB);
    });

    it("keeps every cap an integer number of MiB", () => {
        expect(MAX_IMAGE_SIZE % MB).toBe(0);
        expect(MAX_PDF_SIZE % MB).toBe(0);
        expect(MAX_TOTAL_SIZE % MB).toBe(0);
    });

    it("keeps the aggregate cap below the sum of two max-size files (forces real aggregation)", () => {
        // A single oversized photo can pass the per-file gate yet two of them
        // must trip the aggregate cap — guards the decision that the total cap
        // is the binding constraint, not just per-file.
        expect(MAX_TOTAL_SIZE).toBeLessThan(MAX_IMAGE_SIZE * 2);
    });
});
