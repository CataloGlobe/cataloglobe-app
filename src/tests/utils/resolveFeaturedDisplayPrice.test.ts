import { describe, it, expect } from "vitest";
import { resolveFeaturedDisplayPrice } from "@/utils/resolveFeaturedDisplayPrice";

/**
 * Replica della vecchia logica bacata di FeaturedContentDetail.tsx
 * (is_from_price sempre true quando esiste un gruppo con almeno un valore
 * prezzato, indipendentemente da 1 o 2+ formati). Usata SOLO qui per
 * confrontare vecchio vs nuovo comportamento sul VALORE — non è codice di
 * produzione.
 */
function oldBuggyFeaturedPriceLogic(p: {
    is_from_price: boolean;
    fromPrice: number | null;
    base_price: number | null;
}): number {
    return p.is_from_price ? (p.fromPrice ?? 0) : (p.base_price ?? 0);
}

describe("resolveFeaturedDisplayPrice", () => {
    it("featured a formato singolo (base_price null, 1 valore prezzato) → mostra il formato", () => {
        const p = { fromPrice: 7, base_price: null };
        expect(resolveFeaturedDisplayPrice(p)).toBe(7);
    });

    it("featured a prezzo unico (base_price valorizzato, nessun gruppo) → mostra base_price", () => {
        const p = { fromPrice: null, base_price: 8 };
        expect(resolveFeaturedDisplayPrice(p)).toBe(8);
    });

    it("featured multi-formato (2+ valori, dato reale 'Chicken McNuggets') → mostra il minimo", () => {
        const p = { fromPrice: 3.5, base_price: null };
        expect(resolveFeaturedDisplayPrice(p)).toBe(3.5);
    });

    it("caso teorico critico: base_price E gruppo formato insieme (mai osservato nei dati) → il gruppo vince, coerente con la convenzione del resolver (#1/#2/#4)", () => {
        const p = { fromPrice: 4, base_price: 10 };
        expect(resolveFeaturedDisplayPrice(p)).toBe(4);
    });

    it("nessun prezzo (base_price null, nessun gruppo) → null", () => {
        const p = { fromPrice: null, base_price: null };
        expect(resolveFeaturedDisplayPrice(p)).toBeNull();
    });

    // ── Confronto vecchio vs nuovo — rete di sicurezza ──────────────────────
    // Il bug di is_from_price (#6) era SOLO nell'etichetta ("da X" vs secco),
    // mai nel valore numerico: quando fromPrice esiste, sia la vecchia logica
    // bacata (is_from_price sempre true se il gruppo ha valori) sia la nuova
    // lo scelgono comunque. Questi test lo dimostrano invece di darlo per
    // assunto.
    describe("confronto valore vecchio vs nuovo — nessuna divergenza attesa", () => {
        it("formato singolo: vecchio e nuovo producono lo stesso numero", () => {
            const p = { is_from_price: true /* bug: sempre true col gruppo */, fromPrice: 7, base_price: null };
            expect(oldBuggyFeaturedPriceLogic(p)).toBe(resolveFeaturedDisplayPrice(p));
        });

        it("prezzo unico: vecchio e nuovo producono lo stesso numero", () => {
            const p = { is_from_price: false, fromPrice: null, base_price: 8 };
            expect(oldBuggyFeaturedPriceLogic(p)).toBe(resolveFeaturedDisplayPrice(p));
        });

        it("multi-formato: vecchio e nuovo producono lo stesso numero", () => {
            const p = { is_from_price: true, fromPrice: 3.5, base_price: null };
            expect(oldBuggyFeaturedPriceLogic(p)).toBe(resolveFeaturedDisplayPrice(p));
        });

        it("caso teorico critico: vecchio e nuovo producono lo stesso numero", () => {
            const p = { is_from_price: true /* bug: sempre true col gruppo */, fromPrice: 4, base_price: 10 };
            expect(oldBuggyFeaturedPriceLogic(p)).toBe(resolveFeaturedDisplayPrice(p));
        });
    });
});
