import { describe, it, expect, beforeEach, vi } from "vitest";
import { savePendingRedirect, peekPendingRedirect, clearPendingRedirect } from "@/utils/pendingRedirect";

const DAY = 24 * 60 * 60 * 1000;

describe("pendingRedirect", () => {
    beforeEach(() => {
        // Ambiente node: localStorage finto in memoria.
        const store = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k)
        });
    });

    it("salva e rilegge un percorso interno", () => {
        savePendingRedirect("/invite/abc", 1000);
        expect(peekPendingRedirect(1000 + DAY)).toBe("/invite/abc");
    });

    it("scade dopo due giorni", () => {
        savePendingRedirect("/invite/abc", 1000);
        expect(peekPendingRedirect(1000 + 3 * DAY)).toBeUndefined();
        expect(localStorage.getItem("cg.pendingRedirect")).toBeNull();
    });

    it("rifiuta percorsi esterni", () => {
        savePendingRedirect("https://evil.example/x");
        savePendingRedirect("//evil.example/x");
        expect(peekPendingRedirect()).toBeUndefined();
    });

    it("clear lo toglie", () => {
        savePendingRedirect("/invite/abc");
        clearPendingRedirect();
        expect(peekPendingRedirect()).toBeUndefined();
    });
});
