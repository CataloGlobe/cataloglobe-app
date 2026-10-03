import { describe, expect, it } from "vitest";
import { realtimeTopic } from "@/utils/realtimeTopic";

describe("realtimeTopic", () => {
    it("non ripete un nome, anche nello stesso millisecondo", () => {
        const names = Array.from({ length: 50 }, () => realtimeTopic("tables-live-abc"));
        expect(new Set(names).size).toBe(50);
    });

    it("tiene il prefisso, che dice di chi è il canale", () => {
        expect(realtimeTopic("seatings-xyz")).toMatch(/^seatings-xyz-\d+$/);
    });
});
