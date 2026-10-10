import { describe, it, expect, beforeEach, vi } from "vitest";
import { forgetLastTenant } from "@/utils/lastTenant";
import { TENANT_KEY } from "@/constants/storageKeys";

describe("ultima attività all'uscita", () => {
    beforeEach(() => {
        // Ambiente node: localStorage finto in memoria.
        const store = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k)
        });
    });

    it("toglie l'attività salvata, così chi entra dopo non la eredita", () => {
        localStorage.setItem(TENANT_KEY, "tenant-di-un-altro");
        localStorage.setItem("altro", "resta");
        forgetLastTenant();
        expect(localStorage.getItem(TENANT_KEY)).toBeNull();
        expect(localStorage.getItem("altro")).toBe("resta");
    });

    it("senza storage non si rompe", () => {
        vi.stubGlobal("localStorage", {
            removeItem: () => {
                throw new Error("bloccato");
            }
        });
        expect(() => forgetLastTenant()).not.toThrow();
    });
});
