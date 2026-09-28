import { describe, expect, it } from "vitest";
import { countEmptyCategories } from "@/utils/catalogEmptyCategories";

const cat = (id: string, parent: string | null = null) => ({ id, parent_category_id: parent });

describe("countEmptyCategories", () => {
    it("conta le categorie senza prodotti, né propri né sotto", () => {
        const categories = [cat("antipasti"), cat("vini"), cat("bianchi", "vini"), cat("dessert")];
        expect(countEmptyCategories(categories, ["antipasti", "bianchi"])).toBe(1);
    });

    it("un genitore con prodotti solo nelle figlie non è vuoto; una figlia vuota sì", () => {
        const categories = [cat("vini"), cat("bianchi", "vini"), cat("fruttati", "bianchi"), cat("rossi", "vini")];
        expect(countEmptyCategories(categories, ["fruttati"])).toBe(1);
    });

    it("nessuna categoria, nessun vuoto", () => {
        expect(countEmptyCategories([], [])).toBe(0);
    });
});
