import { describe, it, expect } from "vitest";

import {
    buildIngredientVisibilityRows,
    bulkConfirmCopy,
    bulkSuccessMessage,
    mixedSummary,
    type CatalogProductLike
} from "@/pages/Operativita/Attivita/components/ActivityVisibility/ingredientVisibility";

/**
 * Le parole della vista Ingredienti, uscite dal componente (lotto coda,
 * Disponibilità): il misto a parole, conferma e toast dell'azione in blocco.
 */

function product(id: string, state: CatalogProductLike["visibility_state"]): CatalogProductLike {
    return { product_id: id, name: `Prodotto ${id}`, category_name: "Panini", visibility_state: state };
}

function rowFor(states: CatalogProductLike["visibility_state"][]) {
    const products = states.map((s, i) => product(`p${i}`, s));
    const pairs = products.map(p => ({ product_id: p.product_id, ingredient_id: "ing" }));
    return buildIngredientVisibilityRows([{ id: "ing", name: "Pane" }], pairs, products, new Set())[0];
}

describe("mixedSummary", () => {
    it("misto: quanti non seguono la regola, su quanti (V4)", () => {
        expect(mixedSummary(rowFor(["visible", "hidden", "visible"]).counts)).toBe("misto: 1 nascosto su 3");
        expect(mixedSummary(rowFor(["visible", "hidden", "unavailable"]).counts)).toBe(
            "misto: 1 nascosto e 1 non disponibile su 3"
        );
        expect(mixedSummary(rowFor(["hidden", "hidden", "unavailable", "unavailable"]).counts)).toBe(
            "misto: 2 nascosti e 2 non disponibili su 4"
        );
    });
});

describe("bulkConfirmCopy", () => {
    it("nascondere: titolo, bottone e le modifiche a mano sovrascritte", () => {
        const copy = bulkConfirmCopy("hidden", "Pane", 3, 1);
        expect(copy.title).toBe("Nascondere 3 prodotti?");
        expect(copy.confirmLabel).toBe("Nascondi 3 prodotti");
        expect(copy.message).toContain("1 ha già una modifica a mano");
        expect(copy.warn).toBeNull();
    });

    it("rendere visibili: dice «modifiche a mano», non «override», e avvisa", () => {
        const copy = bulkConfirmCopy("visible", "Pane", 2, 2);
        expect(copy.message).not.toMatch(/override/i);
        expect(copy.message).toContain("modifiche a mano");
        expect(copy.warn).toContain("2 prodotti erano stati modificati a mano");
    });
});

describe("bulkSuccessMessage", () => {
    it("singolare e plurale", () => {
        expect(bulkSuccessMessage("hidden", 1)).toBe("1 prodotto nascosto.");
        expect(bulkSuccessMessage("unavailable", 2)).toBe("2 prodotti segnati come non disponibili.");
        expect(bulkSuccessMessage("visible", 2)).toBe("2 prodotti resi visibili.");
    });
});
