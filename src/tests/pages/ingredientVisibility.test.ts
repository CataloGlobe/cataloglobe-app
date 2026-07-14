import { describe, it, expect } from "vitest";

import {
    buildIngredientVisibilityRows,
    filterIngredientRows,
    buildBulkConfirmData,
    type CatalogProductLike,
    type ProductIngredientPair
} from "@/pages/Operativita/Attivita/components/ActivityVisibilityDrawer/ingredientVisibility";

function product(
    id: string,
    state: CatalogProductLike["visibility_state"],
    category = "Primi piatti"
): CatalogProductLike {
    return { product_id: id, name: `Prodotto ${id}`, category_name: category, visibility_state: state };
}

const ING = [
    { id: "ing-pomodoro", name: "Pomodoro" },
    { id: "ing-guanciale", name: "Guanciale" },
    { id: "ing-tartufo", name: "Tartufo nero" },
    { id: "ing-zafferano", name: "Zafferano" }
];

function pairsOf(ingredientId: string, productIds: string[]): ProductIngredientPair[] {
    return productIds.map(pid => ({ product_id: pid, ingredient_id: ingredientId }));
}

describe("buildIngredientVisibilityRows — aggregazione per ingrediente", () => {
    it("calcola conteggi e stato aggregato per i 4 casi (uniformi + misto)", () => {
        const products = [
            product("p1", "visible"),
            product("p2", "visible"),
            product("p3", "hidden"),
            product("p4", "unavailable"),
            product("p5", "hidden")
        ];
        const pairs = [
            ...pairsOf("ing-pomodoro", ["p1", "p2"]), // tutti visibili
            ...pairsOf("ing-guanciale", ["p1", "p3", "p4"]), // misto
            ...pairsOf("ing-tartufo", ["p3", "p5"]) // tutti nascosti
        ];

        const rows = buildIngredientVisibilityRows(ING, pairs, products, new Set());

        const pomodoro = rows.find(r => r.ingredient_id === "ing-pomodoro");
        expect(pomodoro?.counts).toEqual({ visible: 2, hidden: 0, unavailable: 0 });
        expect(pomodoro?.aggregate).toBe("all_visible");

        const guanciale = rows.find(r => r.ingredient_id === "ing-guanciale");
        expect(guanciale?.counts).toEqual({ visible: 1, hidden: 1, unavailable: 1 });
        expect(guanciale?.aggregate).toBe("mixed");

        const tartufo = rows.find(r => r.ingredient_id === "ing-tartufo");
        expect(tartufo?.aggregate).toBe("all_hidden");
    });

    it("aggregate 'all_unavailable' quando tutti i collegati sono non disponibili", () => {
        const rows = buildIngredientVisibilityRows(
            ING,
            pairsOf("ing-pomodoro", ["p1", "p2"]),
            [product("p1", "unavailable"), product("p2", "unavailable")],
            new Set()
        );
        expect(rows.find(r => r.ingredient_id === "ing-pomodoro")?.aggregate).toBe("all_unavailable");
    });

    it("ingrediente senza prodotti nel catalogo → counts 0 e aggregate 'none'", () => {
        const rows = buildIngredientVisibilityRows(ING, [], [product("p1", "visible")], new Set());
        const zafferano = rows.find(r => r.ingredient_id === "ing-zafferano");
        expect(zafferano?.productIds).toEqual([]);
        expect(zafferano?.aggregate).toBe("none");
        expect(zafferano?.counts).toEqual({ visible: 0, hidden: 0, unavailable: 0 });
    });

    it("coppie verso prodotti NON nel catalogo attivo vengono ignorate", () => {
        const rows = buildIngredientVisibilityRows(
            ING,
            pairsOf("ing-pomodoro", ["p1", "p-fuori-catalogo"]),
            [product("p1", "visible")],
            new Set()
        );
        const pomodoro = rows.find(r => r.ingredient_id === "ing-pomodoro");
        expect(pomodoro?.productIds).toEqual(["p1"]);
        expect(pomodoro?.aggregate).toBe("all_visible");
    });

    it("prodotto presente in più categorie del catalogo contato una volta sola", () => {
        const rows = buildIngredientVisibilityRows(
            ING,
            pairsOf("ing-pomodoro", ["p1"]),
            [product("p1", "visible", "Pizze"), product("p1", "visible", "Primi piatti")],
            new Set()
        );
        const pomodoro = rows.find(r => r.ingredient_id === "ing-pomodoro");
        expect(pomodoro?.counts.visible).toBe(1);
        expect(pomodoro?.productIds).toEqual(["p1"]);
    });

    it("hasOverride true se almeno un prodotto collegato ha override manuale", () => {
        const products = [product("p1", "visible"), product("p2", "hidden")];
        const rows = buildIngredientVisibilityRows(
            ING,
            [...pairsOf("ing-pomodoro", ["p1"]), ...pairsOf("ing-guanciale", ["p1", "p2"])],
            products,
            new Set(["p2"])
        );
        expect(rows.find(r => r.ingredient_id === "ing-pomodoro")?.hasOverride).toBe(false);
        expect(rows.find(r => r.ingredient_id === "ing-guanciale")?.hasOverride).toBe(true);
    });

    it("preserva l'ordine di input degli ingredienti (già ordinati per nome dal service)", () => {
        const rows = buildIngredientVisibilityRows(ING, [], [], new Set());
        expect(rows.map(r => r.ingredient_id)).toEqual(ING.map(i => i.id));
    });
});

describe("filterIngredientRows — filtri aggregati + ricerca", () => {
    const products = [
        product("p1", "visible"),
        product("p2", "hidden"),
        product("p3", "unavailable")
    ];
    const rows = buildIngredientVisibilityRows(
        ING,
        [
            ...pairsOf("ing-pomodoro", ["p1"]), // all_visible
            ...pairsOf("ing-guanciale", ["p1", "p2", "p3"]), // mixed (con hidden e unavailable)
            ...pairsOf("ing-tartufo", ["p2"]) // all_hidden
        ],
        products,
        new Set()
    );

    it("'all' non filtra nulla", () => {
        expect(filterIngredientRows(rows, "all", "")).toHaveLength(4);
    });

    it("'with_hidden' = almeno un prodotto nascosto (include i misti)", () => {
        const out = filterIngredientRows(rows, "with_hidden", "");
        expect(out.map(r => r.ingredient_id).sort()).toEqual(["ing-guanciale", "ing-tartufo"]);
    });

    it("'with_unavailable' = almeno un prodotto non disponibile", () => {
        const out = filterIngredientRows(rows, "with_unavailable", "");
        expect(out.map(r => r.ingredient_id)).toEqual(["ing-guanciale"]);
    });

    it("ricerca case-insensitive sul nome, combinata col filtro", () => {
        expect(filterIngredientRows(rows, "all", "TARTU").map(r => r.ingredient_id)).toEqual([
            "ing-tartufo"
        ]);
        expect(filterIngredientRows(rows, "with_hidden", "guan").map(r => r.ingredient_id)).toEqual([
            "ing-guanciale"
        ]);
        expect(filterIngredientRows(rows, "with_unavailable", "tartu")).toHaveLength(0);
    });
});

describe("buildBulkConfirmData — dati per la ConfirmDialog", () => {
    const products = [
        product("p1", "visible", "Pizze"),
        product("p2", "hidden", "Pizze"),
        product("p3", "unavailable", "Primi piatti"),
        product("p4", "visible", "Primi piatti")
    ];
    const overridden = new Set(["p2", "p3"]);

    it("target 'hidden': overwrittenCount = override esistenti con stato diverso dal target", () => {
        const data = buildBulkConfirmData(["p1", "p2", "p3", "p4"], products, overridden, "hidden");
        expect(data.total).toBe(4);
        // p2 è già hidden (override ma stesso stato) → non conta come sovrascritto.
        // p3 è unavailable con override → sovrascritto.
        expect(data.overwrittenCount).toBe(1);
    });

    it("target 'visible': overwrittenCount = tutti gli override esistenti; preview ordinata override-first con stato attuale come caption", () => {
        const data = buildBulkConfirmData(["p1", "p2", "p3", "p4"], products, overridden, "visible");
        expect(data.overwrittenCount).toBe(2);
        // Override manuali in testa alla preview.
        expect(data.preview.slice(0, 2).map(i => i.product_id).sort()).toEqual(["p2", "p3"]);
        const p2 = data.preview.find(i => i.product_id === "p2");
        expect(p2?.caption).toBe("Nascosto manualmente");
        const p3 = data.preview.find(i => i.product_id === "p3");
        expect(p3?.caption).toBe("Non disponibile");
    });

    it("target 'hidden'/'unavailable': caption = categoria, ordine catalogo", () => {
        const data = buildBulkConfirmData(["p1", "p2"], products, overridden, "unavailable");
        expect(data.preview.map(i => i.product_id)).toEqual(["p1", "p2"]);
        expect(data.preview[0]?.caption).toBe("Pizze");
    });

    it("prodotti duplicati (multi-categoria) compaiono una volta sola nella preview", () => {
        const dup = [...products, product("p1", "visible", "Secondi")];
        const data = buildBulkConfirmData(["p1"], dup, new Set(), "hidden");
        expect(data.total).toBe(1);
        expect(data.preview).toHaveLength(1);
    });
});
