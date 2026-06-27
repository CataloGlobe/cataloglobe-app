import { describe, it, expect } from "vitest";
import { partitionBySizeBudget } from "@/pages/Dashboard/Catalogs/AiMenuImport/sizeBudget";
import {
    MAX_IMAGE_SIZE,
    MAX_PDF_SIZE,
    MAX_TOTAL_SIZE
} from "@/pages/Dashboard/Catalogs/AiMenuImport/aiImportLimits";

type TestFile = { size: number; type: string; name: string };

const img = (size: number, name = "i"): TestFile => ({ size, type: "image/jpeg", name });
const pdf = (size: number, name = "p"): TestFile => ({ size, type: "application/pdf", name });

describe("partitionBySizeBudget — characterization of FASE 2 inline logic", () => {
    it("accepts an image at the exact per-file limit", () => {
        const { accepted, rejected } = partitionBySizeBudget([], [img(MAX_IMAGE_SIZE)]);
        expect(accepted).toHaveLength(1);
        expect(rejected).toHaveLength(0);
    });

    it("rejects an image 1 byte over the per-file limit as image_too_large", () => {
        const { accepted, rejected } = partitionBySizeBudget([], [img(MAX_IMAGE_SIZE + 1)]);
        expect(accepted).toHaveLength(0);
        expect(rejected).toEqual([{ file: img(MAX_IMAGE_SIZE + 1), reason: "image_too_large" }]);
    });

    it("accepts a PDF at the exact per-file limit", () => {
        const { accepted, rejected } = partitionBySizeBudget([], [pdf(MAX_PDF_SIZE)]);
        expect(accepted).toHaveLength(1);
        expect(rejected).toHaveLength(0);
    });

    it("rejects a PDF 1 byte over the per-file limit as pdf_too_large", () => {
        const { accepted, rejected } = partitionBySizeBudget([], [pdf(MAX_PDF_SIZE + 1)]);
        expect(accepted).toHaveLength(0);
        expect(rejected).toEqual([{ file: pdf(MAX_PDF_SIZE + 1), reason: "pdf_too_large" }]);
    });

    it("accepts candidates that sum to exactly the aggregate cap", () => {
        const a = img(20 * 1024 * 1024, "a");
        const b = img(10 * 1024 * 1024, "b"); // 20+10 = 30 = MAX_TOTAL_SIZE
        const { accepted, rejected } = partitionBySizeBudget([], [a, b]);
        expect(accepted).toEqual([a, b]);
        expect(rejected).toHaveLength(0);
    });

    it("rejects the candidate that pushes the total 1 byte over as aggregate_exceeded", () => {
        // Both within the per-file image cap (25MB); together 20+10+1B > 30MB total.
        const a = img(20 * 1024 * 1024, "a");
        const b = img(10 * 1024 * 1024 + 1, "b");
        const { accepted, rejected } = partitionBySizeBudget([], [a, b]);
        expect(accepted).toEqual([a]);
        expect(rejected).toEqual([{ file: b, reason: "aggregate_exceeded" }]);
    });

    it("counts existing files against the aggregate budget", () => {
        const existing = [{ size: MAX_TOTAL_SIZE - 5 }];
        const fits = img(5, "fits");
        const over = img(6, "over");
        expect(partitionBySizeBudget(existing, [fits]).accepted).toEqual([fits]);
        const r = partitionBySizeBudget(existing, [over]);
        expect(r.accepted).toHaveLength(0);
        expect(r.rejected).toEqual([{ file: over, reason: "aggregate_exceeded" }]);
    });

    it("uses skip-and-continue: a small file after an aggregate-overflowing one still fits", () => {
        const a = img(20 * 1024 * 1024, "a"); // total 20
        const b = img(20 * 1024 * 1024, "b"); // 20+20=40 > 30 -> rejected, NOT a stop
        const c = img(5 * 1024 * 1024, "c"); // 20+5=25 <= 30 -> accepted
        const { accepted, rejected } = partitionBySizeBudget([], [a, b, c]);
        expect(accepted).toEqual([a, c]);
        expect(rejected).toEqual([{ file: b, reason: "aggregate_exceeded" }]);
    });

    it("preserves input order in accepted", () => {
        const a = img(1, "a");
        const b = pdf(2, "b");
        const c = img(3, "c");
        expect(partitionBySizeBudget([], [a, b, c]).accepted).toEqual([a, b, c]);
    });

    it("returns empty arrays for an empty candidate list", () => {
        expect(partitionBySizeBudget([], [])).toEqual({ accepted: [], rejected: [] });
    });

    it("handles a mix of photos and PDFs with per-type caps", () => {
        const okImg = img(MAX_IMAGE_SIZE, "okImg"); // 25MB ok per-file but...
        const okPdf = pdf(1, "okPdf");
        // 25MB image alone fits aggregate (25 <= 30); pdf of 1 byte: 25MB+1 <= 30 -> ok
        const { accepted, rejected } = partitionBySizeBudget([], [okImg, okPdf]);
        expect(accepted).toEqual([okImg, okPdf]);
        expect(rejected).toHaveLength(0);
    });

    it("per-file rejects do not consume the aggregate budget", () => {
        const tooBig = img(MAX_IMAGE_SIZE + 1, "big"); // rejected per-file (26MB > 25MB cap)
        const small = img(MAX_IMAGE_SIZE, "small"); // 25MB: within per-file, fits aggregate alone
        const { accepted, rejected } = partitionBySizeBudget([], [tooBig, small]);
        expect(accepted).toEqual([small]);
        expect(rejected).toEqual([{ file: tooBig, reason: "image_too_large" }]);
    });
});
