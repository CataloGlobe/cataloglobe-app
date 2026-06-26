import { describe, it, expect } from "vitest";
import {
    MAX_DECODED_PAYLOAD_BYTES,
    estimateDecodedBytes,
    exceedsPayloadBudget
} from "../../../supabase/functions/_shared/aiImportPayloadSize";

describe("aiImportPayloadSize — characterization of FASE 2 inline edge guard", () => {
    it("estimates 0 bytes for an empty list", () => {
        expect(estimateDecodedBytes([])).toBe(0);
    });

    it("estimates decoded bytes as 0.75x the base64 length, summed", () => {
        expect(estimateDecodedBytes([{ data: "x".repeat(100) }])).toBe(75);
        expect(
            estimateDecodedBytes([{ data: "x".repeat(100) }, { data: "y".repeat(200) }])
        ).toBe(225);
    });

    it("exposes the 35 MiB threshold", () => {
        expect(MAX_DECODED_PAYLOAD_BYTES).toBe(35 * 1024 * 1024);
    });

    it("is false at the exact threshold and true 1 unit over", () => {
        // 100 base64 chars -> 75 estimated bytes
        const images = [{ data: "x".repeat(100) }];
        expect(exceedsPayloadBudget(images, 75)).toBe(false);
        expect(exceedsPayloadBudget(images, 74)).toBe(true);
    });

    it("defaults to MAX_DECODED_PAYLOAD_BYTES when no max is given", () => {
        expect(exceedsPayloadBudget([{ data: "x".repeat(10) }])).toBe(false);
    });

    it("stays consistent between estimateDecodedBytes and exceedsPayloadBudget", () => {
        const images = [{ data: "a".repeat(1000) }, { data: "b".repeat(500) }];
        const estimate = estimateDecodedBytes(images);
        expect(exceedsPayloadBudget(images, estimate)).toBe(false);
        expect(exceedsPayloadBudget(images, estimate - 1)).toBe(true);
    });
});
