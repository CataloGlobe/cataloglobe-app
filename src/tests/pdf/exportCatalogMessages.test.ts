// Logica dell'avviso copertura allergeni nel drawer di export.
// I testi sono in revisione legale: qui si asserisce QUANDO c'è un messaggio e
// la forma singolare/plurale, non le frasi intere — altrimenti la revisione
// romperebbe i test senza che nulla sia regredito.
import { describe, it, expect } from "vitest";

import {
    buildAllergenCoverageMessage,
    pdfDataCacheKey
} from "@/pages/Operativita/Attivita/tabs/exportCatalogMessages";
import { ALLERGEN_COVERAGE_THRESHOLD } from "@/services/pdf/allergenEuNumbers";

function message(productsWithAllergens: number, productsTotal: number): string | null {
    return buildAllergenCoverageMessage({ productsTotal, productsWithAllergens });
}

describe("buildAllergenCoverageMessage — quando avvisare", () => {
    it("catalogo senza prodotti stampabili: nessun avviso (niente da compilare)", () => {
        expect(message(0, 0)).toBeNull();
    });

    it("copertura sopra soglia: nessun avviso", () => {
        expect(message(9, 10)).toBeNull();
    });

    it("copertura esattamente alla soglia: nessun avviso", () => {
        const total = 10;
        expect(ALLERGEN_COVERAGE_THRESHOLD).toBe(0.5); // il caso "metà" è quello sotto
        expect(message(total * ALLERGEN_COVERAGE_THRESHOLD, total)).toBeNull();
    });

    it("copertura sotto soglia: avviso presente", () => {
        expect(message(3, 10)).not.toBeNull();
    });

    it("copertura zero su catalogo non vuoto: avviso presente", () => {
        expect(message(0, 52)).not.toBeNull();
    });

    it("copertura zero e copertura parziale danno messaggi diversi", () => {
        expect(message(0, 52)).not.toBe(message(1, 52));
    });
});

describe("buildAllergenCoverageMessage — numeri e accordo", () => {
    it("un solo prodotto coperto: singolare su sostantivo e verbo", () => {
        const text = message(1, 52) ?? "";
        expect(text).toContain("1 prodotto su 52");
        expect(text).toContain("ha");
        expect(text).not.toContain("prodotti");
        expect(text).not.toContain("hanno");
    });

    it("più prodotti coperti: plurale su sostantivo e verbo", () => {
        const text = message(3, 52) ?? "";
        expect(text).toContain("3 prodotti su 52");
        expect(text).toContain("hanno");
    });

    it("totale 1 e nessuno coperto: usa il messaggio senza numeri", () => {
        // productsWithAllergens 0 → frase dedicata, nessun "0 prodotti su 1".
        const text = message(0, 1) ?? "";
        expect(text).not.toContain("0");
        expect(text).not.toContain("su 1");
    });

    it("totale 1 coperto su 1 è sopra soglia: nessun avviso", () => {
        expect(message(1, 1)).toBeNull();
    });
});

describe("pdfDataCacheKey", () => {
    it("distingue lo stile: payload dello stesso catalogo su stili diversi non collidono", () => {
        expect(pdfDataCacheKey("cat", "style-a")).not.toBe(pdfDataCacheKey("cat", "style-b"));
    });

    it("stile assente resta una chiave valida e stabile", () => {
        expect(pdfDataCacheKey("cat", "")).toBe(pdfDataCacheKey("cat", ""));
        expect(pdfDataCacheKey("cat", "")).not.toBe(pdfDataCacheKey("cat", "style-a"));
    });
});
