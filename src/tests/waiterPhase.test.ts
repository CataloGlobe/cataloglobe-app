import { describe, expect, it } from "vitest";
import { msToNextWaiterPhase, waiterPhase } from "@components/PublicCollectionView/AssistanceActions/waiterPhase";

const CALLED = "2026-10-14T12:00:00.000Z";
const at = (s: number) => Date.parse(CALLED) + s * 1000;

describe("waiterPhase", () => {
    it("senza chiamata è idle", () => {
        expect(waiterPhase(null, at(0))).toBe("idle");
        expect(msToNextWaiterPhase(null, at(0))).toBeNull();
    });

    it("nel primo minuto è called, poi recall fino a 10 minuti, poi idle", () => {
        expect(waiterPhase(CALLED, at(0))).toBe("called");
        expect(waiterPhase(CALLED, at(59.9))).toBe("called");
        expect(waiterPhase(CALLED, at(60))).toBe("recall");
        expect(waiterPhase(CALLED, at(599))).toBe("recall");
        expect(waiterPhase(CALLED, at(600))).toBe("idle");
    });

    it("un orologio del telefono un po' indietro resta called", () => {
        expect(waiterPhase(CALLED, at(-5))).toBe("called");
    });

    it("dice quando cambia fase", () => {
        expect(msToNextWaiterPhase(CALLED, at(10))).toBe(50_000);
        expect(msToNextWaiterPhase(CALLED, at(60))).toBe(540_000);
        expect(msToNextWaiterPhase(CALLED, at(600))).toBeNull();
    });

    it("una data illeggibile vale come nessuna chiamata", () => {
        expect(waiterPhase("boh", at(0))).toBe("idle");
        expect(msToNextWaiterPhase("boh", at(0))).toBeNull();
    });
});
