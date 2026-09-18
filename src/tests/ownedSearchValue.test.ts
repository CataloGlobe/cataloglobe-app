import { describe, expect, it } from "vitest";

import { reconcileOwnedValue } from "@/components/ui/ToolbarSearch/ownedSearchValue";

// FASE 5.2c — il campo di ricerca in testata riceve il proprio `value` dal
// context un render dopo la battuta. Questa è la parte pura del rimedio:
// distinguere l'eco in ritardo di ciò che abbiamo emesso (da ignorare) da
// un cambio arrivato davvero da fuori (da applicare). La battitura vera
// non si simula qui: la prova è sul browser.

describe("reconcileOwnedValue", () => {
    it("l'eco della propria emissione non è un reset: si scarta e la coda avanza", () => {
        // Emessi `a`, `ab`; il context restituisce `a` (in ritardo di una battuta).
        expect(reconcileOwnedValue(["a", "ab"], "a")).toEqual({ pending: ["ab"], external: null });
        expect(reconcileOwnedValue(["ab"], "ab")).toEqual({ pending: [], external: null });
    });

    it("React può saltare render intermedi: l'eco riconosciuta può non essere la testa", () => {
        expect(reconcileOwnedValue(["a", "ab", "abc"], "abc")).toEqual({ pending: [], external: null });
    });

    it("lo stesso testo emesso due volte (cancella e riscrivi) si riconosce nell'ordine giusto", () => {
        expect(reconcileOwnedValue(["a", "ab", "a"], "a")).toEqual({ pending: ["ab", "a"], external: null });
        expect(reconcileOwnedValue(["ab", "a"], "ab")).toEqual({ pending: ["a"], external: null });
        expect(reconcileOwnedValue(["a"], "a")).toEqual({ pending: [], external: null });
    });

    it("un valore mai emesso viene da fuori: si applica e la coda non vale più", () => {
        expect(reconcileOwnedValue(["ab"], "")).toEqual({ pending: [], external: "" });
        expect(reconcileOwnedValue([], "Rossi")).toEqual({ pending: [], external: "Rossi" });
    });

    it("l'azzeramento dalla X è una nostra emissione, non un reset", () => {
        expect(reconcileOwnedValue(["ab", ""], "")).toEqual({ pending: [], external: null });
    });
});
