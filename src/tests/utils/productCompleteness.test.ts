import { describe, expect, it } from "vitest";
import {
    hasConfiguredPrice,
    hasConfiguredEffectivePrice,
    isInAnyCatalog,
    isInAnyCatalogEffective,
    getProductIssues,
    hasAnyIssue
} from "@/utils/productCompleteness";

describe("hasConfiguredPrice", () => {
    it("base_price valorizzato, nessun formato → prezzato", () => {
        expect(hasConfiguredPrice({ basePrice: 12.5 })).toBe(true);
        expect(hasConfiguredPrice({ basePrice: 12.5, pricedFormatsCount: 0 })).toBe(true);
    });

    it("prezzo zero è un prezzo", () => {
        expect(hasConfiguredPrice({ basePrice: 0 })).toBe(true);
    });

    it("base_price NULL ma formati prezzati → prezzato", () => {
        expect(hasConfiguredPrice({ basePrice: null, pricedFormatsCount: 1 })).toBe(true);
        expect(hasConfiguredPrice({ basePrice: null, pricedFormatsCount: 3 })).toBe(true);
    });

    it("base_price NULL e nessun formato prezzato → NON prezzato", () => {
        expect(hasConfiguredPrice({ basePrice: null })).toBe(false);
        expect(hasConfiguredPrice({ basePrice: null, pricedFormatsCount: 0 })).toBe(false);
        expect(hasConfiguredPrice({ basePrice: undefined })).toBe(false);
        expect(hasConfiguredPrice({ basePrice: null, pricedFormatsCount: null })).toBe(false);
    });

    it("gruppo PRIMARY_PRICE presente ma senza valori prezzati → NON prezzato", () => {
        // `pricedFormatsCount` conta i soli formati con prezzo valido: un gruppo
        // esistente ma vuoto (o con soli valori senza prezzo) arriva qui a 0.
        expect(hasConfiguredPrice({ basePrice: null, pricedFormatsCount: 0 })).toBe(false);
    });

    it("NaN non è un prezzo", () => {
        expect(hasConfiguredPrice({ basePrice: Number.NaN })).toBe(false);
    });
});

describe("hasConfiguredEffectivePrice", () => {
    it("variante con prezzo proprio → prezzata a prescindere dal padre", () => {
        expect(
            hasConfiguredEffectivePrice({ basePrice: 4 }, { basePrice: null })
        ).toBe(true);
    });

    it("variante senza prezzo che eredita da padre prezzato → prezzata", () => {
        expect(
            hasConfiguredEffectivePrice({ basePrice: null }, { basePrice: 10 })
        ).toBe(true);
        expect(
            hasConfiguredEffectivePrice(
                { basePrice: null },
                { basePrice: null, pricedFormatsCount: 2 }
            )
        ).toBe(true);
    });

    it("variante senza prezzo e padre senza prezzo → NON prezzata", () => {
        expect(
            hasConfiguredEffectivePrice({ basePrice: null }, { basePrice: null })
        ).toBe(false);
    });

    it("senza padre degrada al predicato semplice", () => {
        expect(hasConfiguredEffectivePrice({ basePrice: null })).toBe(false);
        expect(hasConfiguredEffectivePrice({ basePrice: null }, null)).toBe(false);
        expect(hasConfiguredEffectivePrice({ basePrice: 7 })).toBe(true);
    });
});

describe("isInAnyCatalog", () => {
    it("almeno un menù → dentro", () => {
        expect(isInAnyCatalog({ catalogsCount: 1 })).toBe(true);
        expect(isInAnyCatalog({ catalogsCount: 4 })).toBe(true);
    });

    it("zero, null o assente → fuori", () => {
        expect(isInAnyCatalog({ catalogsCount: 0 })).toBe(false);
        expect(isInAnyCatalog({ catalogsCount: null })).toBe(false);
        expect(isInAnyCatalog({})).toBe(false);
    });
});

describe("isInAnyCatalogEffective", () => {
    it("variante collegata a un menù → dentro, a prescindere dal padre", () => {
        expect(
            isInAnyCatalogEffective({ catalogsCount: 1 }, { catalogsCount: 0 })
        ).toBe(true);
    });

    it("variante non collegata ma padre in catalogo → dentro (si raggiunge dal padre)", () => {
        expect(
            isInAnyCatalogEffective({ catalogsCount: 0 }, { catalogsCount: 2 })
        ).toBe(true);
    });

    it("né la variante né il padre → fuori", () => {
        expect(
            isInAnyCatalogEffective({ catalogsCount: 0 }, { catalogsCount: 0 })
        ).toBe(false);
    });

    it("senza padre degrada al predicato semplice", () => {
        expect(isInAnyCatalogEffective({ catalogsCount: 0 })).toBe(false);
        expect(isInAnyCatalogEffective({ catalogsCount: 0 }, null)).toBe(false);
        expect(isInAnyCatalogEffective({ catalogsCount: 1 })).toBe(true);
    });
});

describe("getProductIssues", () => {
    it("prodotto completo → nessuna mancanza", () => {
        const issues = getProductIssues({ basePrice: 10, catalogsCount: 1 });
        expect(issues).toEqual({ missingPrice: false, outOfCatalog: false });
        expect(hasAnyIssue(issues)).toBe(false);
    });

    it("le due mancanze sono indipendenti", () => {
        expect(getProductIssues({ basePrice: null, catalogsCount: 1 })).toEqual({
            missingPrice: true,
            outOfCatalog: false
        });
        expect(getProductIssues({ basePrice: 10, catalogsCount: 0 })).toEqual({
            missingPrice: false,
            outOfCatalog: true
        });
    });

    it("entrambe insieme (6 prodotti su staging)", () => {
        const issues = getProductIssues({ basePrice: null, catalogsCount: 0 });
        expect(issues).toEqual({ missingPrice: true, outOfCatalog: true });
        expect(hasAnyIssue(issues)).toBe(true);
    });

    it("applica l'ereditarietà a entrambe le domande", () => {
        const parent = { basePrice: 8, catalogsCount: 3 };
        expect(getProductIssues({ basePrice: null, catalogsCount: 0 }, parent)).toEqual({
            missingPrice: false,
            outOfCatalog: false
        });
    });

    it("un padre incompleto non copre la variante", () => {
        const parent = { basePrice: null, catalogsCount: 0 };
        expect(getProductIssues({ basePrice: null, catalogsCount: 0 }, parent)).toEqual({
            missingPrice: true,
            outOfCatalog: true
        });
    });
});
