import { describe, it, expect, vi } from "vitest";

// Sia il resolver sia il service ingredienti importano il client Supabase al
// top-level (`export const supabase = ...`), che lancia senza env. Le funzioni
// sotto test sono pure → stub del modulo client (stesso pattern di
// src/tests/scheduling/activityVisibilityOverrides.test.ts).
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));

// `vitest.config.ts` configura solo l'alias `@`, non `@services`. La catena
// ingredients.ts → translations.ts usa `@services/publicCatalog/...`, che in
// test non risolve: stub del modulo (non serve al codice sotto test, che è
// puro). Vedi memory/feedback_vitest_aliases.md.
vi.mock("@services/publicCatalog/revalidatePublicCatalog", () => ({
    revalidatePublicCatalogForTenant: () => Promise.resolve()
}));

import {
    sortIngredientRows,
    type RawIngredientRow
} from "@/services/supabase/resolveActivityCatalogs";
import { buildProductIngredientsPayload } from "@/services/supabase/ingredients";

function row(name: string, sortOrder: number | null): RawIngredientRow {
    return { sort_order: sortOrder, ingredient: { id: `id-${name}`, name } };
}

describe("sortIngredientRows — ordine degli ingredienti nel payload pubblico", () => {
    it("ordina per sort_order crescente", () => {
        const rows = [row("Pomodoro", 2), row("Basilico", 0), row("Mozzarella", 1)];
        expect(sortIngredientRows(rows).map(r => r.ingredient?.name)).toEqual([
            "Basilico",
            "Mozzarella",
            "Pomodoro"
        ]);
    });

    it("non muta l'array in ingresso", () => {
        const rows = [row("Pomodoro", 1), row("Basilico", 0)];
        sortIngredientRows(rows);
        expect(rows.map(r => r.ingredient?.name)).toEqual(["Pomodoro", "Basilico"]);
    });

    it("a parità di sort_order conserva l'ordine del DB (sort stabile)", () => {
        const rows = [row("Sale", 0), row("Pepe", 0), row("Olio", 0)];
        expect(sortIngredientRows(rows).map(r => r.ingredient?.name)).toEqual([
            "Sale",
            "Pepe",
            "Olio"
        ]);
    });

    it("tratta sort_order assente come 0 — le righe pre-migration restano in testa", () => {
        const rows = [row("Nuovo", 3), row("Legacy", null)];
        expect(sortIngredientRows(rows).map(r => r.ingredient?.name)).toEqual([
            "Legacy",
            "Nuovo"
        ]);
    });

    it("regge l'array vuoto", () => {
        expect(sortIngredientRows([])).toEqual([]);
    });
});

describe("buildProductIngredientsPayload — payload jsonb della RPC", () => {
    it("assegna sort_order dalla posizione nell'array", () => {
        expect(buildProductIngredientsPayload(["a", "b", "c"])).toEqual([
            { ingredient_id: "a", sort_order: 0 },
            { ingredient_id: "b", sort_order: 1 },
            { ingredient_id: "c", sort_order: 2 }
        ]);
    });

    it("riflette il riordino: stessi id, sort_order diversi", () => {
        expect(buildProductIngredientsPayload(["c", "a", "b"])).toEqual([
            { ingredient_id: "c", sort_order: 0 },
            { ingredient_id: "a", sort_order: 1 },
            { ingredient_id: "b", sort_order: 2 }
        ]);
    });

    it("array vuoto → payload vuoto (svuota i legami del prodotto)", () => {
        expect(buildProductIngredientsPayload([])).toEqual([]);
    });

    it("round-trip: il payload riordinato rimappato dal resolver torna nell'ordine scelto", () => {
        const chosen = ["olio", "sale", "pepe"];
        const rows: RawIngredientRow[] = buildProductIngredientsPayload(chosen)
            .map(item => ({
                sort_order: item.sort_order,
                ingredient: { id: item.ingredient_id, name: item.ingredient_id }
            }))
            // il DB non garantisce l'ordine di ritorno del join
            .reverse();

        expect(sortIngredientRows(rows).map(r => r.ingredient?.id)).toEqual(chosen);
    });
});
