import { describe, expect, it } from "vitest";
import { deriveComandaPrintStates } from "@/pages/Dashboard/Orders/hooks/comandaPrintState";
import type { ComandaPrintJobRow } from "@/types/orders";

function job(id: string, order_id: string, status: ComandaPrintJobRow["status"]): ComandaPrintJobRow {
    return { id, order_id, status };
}

describe("deriveComandaPrintStates", () => {
    it("nessun job → nessuno stato", () => {
        expect(deriveComandaPrintStates([]).size).toBe(0);
    });

    it("done → 'done', failed → 'failed'", () => {
        const m = deriveComandaPrintStates([job("j1", "o1", "done"), job("j2", "o2", "failed")]);
        expect(m.get("o1")).toBe("done");
        expect(m.get("o2")).toBe("failed");
    });

    it("pending/processing non producono stato (nessun 'appeso' derivato)", () => {
        const m = deriveComandaPrintStates([
            job("j1", "o1", "pending"),
            job("j2", "o2", "processing")
        ]);
        expect(m.has("o1")).toBe(false);
        expect(m.has("o2")).toBe(false);
    });

    it("piu' job per ordine: vince il peggiore, failed > done, in qualsiasi ordine", () => {
        expect(
            deriveComandaPrintStates([job("j1", "o1", "done"), job("j2", "o1", "failed")]).get("o1")
        ).toBe("failed");
        expect(
            deriveComandaPrintStates([job("j1", "o1", "failed"), job("j2", "o1", "done")]).get("o1")
        ).toBe("failed");
    });

    it("done + pending sulla stessa ordine → done (una stampa e' uscita)", () => {
        const m = deriveComandaPrintStates([job("j1", "o1", "done"), job("j2", "o1", "pending")]);
        expect(m.get("o1")).toBe("done");
    });

    it("accetta i values di una Map (uso nell'hook)", () => {
        const store = new Map<string, ComandaPrintJobRow>();
        store.set("j1", job("j1", "o1", "done"));
        expect(deriveComandaPrintStates(store.values()).get("o1")).toBe("done");
    });
});
