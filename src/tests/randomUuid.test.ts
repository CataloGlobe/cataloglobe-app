import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuid } from "@/utils/randomUuid";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("randomUuid", () => {
    it("usa crypto.randomUUID quando c'è", () => {
        expect(randomUuid()).toMatch(UUID_V4);
    });

    it("senza randomUUID (http, iOS vecchi) ripiega su getRandomValues", () => {
        const real = globalThis.crypto;
        const getRandomValues = vi.fn(<T extends ArrayBufferView>(a: T) => real.getRandomValues(a));
        vi.stubGlobal("crypto", { getRandomValues });
        const id = randomUuid();
        expect(id).toMatch(UUID_V4);
        expect(getRandomValues).toHaveBeenCalledOnce();
    });

    it("senza crypto ripiega su Date.now + Math.random, sempre in forma UUID v4", () => {
        vi.stubGlobal("crypto", undefined);
        const ids = new Set(Array.from({ length: 50 }, () => randomUuid()));
        for (const id of ids) expect(id).toMatch(UUID_V4);
        expect(ids.size).toBe(50);
    });
});
