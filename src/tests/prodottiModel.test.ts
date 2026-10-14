import { describe, expect, it } from "vitest";
import { prodottiLead, sortProdotti, type ProdottoOrdine } from "@/pages/Dashboard/Vetrina/prodottiModel";

const p = (name: string, groupRank: number, price: number | null, createdAt: string): ProdottoOrdine => ({ name, groupRank, price, createdAt });

const ROWS = [
    p("Tiramisù", 2, 7, "2026-01-03"),
    p("Spritz", 3, null, "2026-01-05"),
    p("Burrata", 0, 13, "2026-01-01"),
    p("Tartare", 0, 16, "2026-01-04"),
    p("Spaghetti", 1, 18, "2026-01-02")
];
const names = (rows: ProdottoOrdine[]) => rows.map(r => r.name);

describe("Prodotti: l'ordine", () => {
    it("per gruppo tiene l'ordine dei gruppi, poi il nome", () => {
        expect(names(sortProdotti(ROWS, "gruppo"))).toEqual(["Burrata", "Tartare", "Spaghetti", "Tiramisù", "Spritz"]);
    });

    it("per prezzo i senza prezzo stanno in fondo nei due versi", () => {
        expect(names(sortProdotti(ROWS, "prezzo-su"))).toEqual(["Tiramisù", "Burrata", "Tartare", "Spaghetti", "Spritz"]);
        expect(names(sortProdotti(ROWS, "prezzo-giu"))).toEqual(["Spaghetti", "Tartare", "Burrata", "Tiramisù", "Spritz"]);
    });

    it("per nome e per ultimi creati", () => {
        expect(names(sortProdotti(ROWS, "nome"))).toEqual(["Burrata", "Spaghetti", "Spritz", "Tartare", "Tiramisù"]);
        expect(names(sortProdotti(ROWS, "recenti"))).toEqual(["Spritz", "Tartare", "Tiramisù", "Spaghetti", "Burrata"]);
    });
});

describe("Prodotti: la frase in cima", () => {
    const text = (parts: ReturnType<typeof prodottiLead>) =>
        parts.map(x => ("text" in x ? x.text : "strong" in x ? `*${x.strong}*` : "down" in x ? `{${x.down}}` : x.name)).join("");

    it("con un prodotto senza prezzo", () => {
        expect(text(prodottiLead(12, 8, 1, "prodotti", "menù"))).toBe("*12 prodotti* in 8 gruppi. {Uno senza prezzo}: nel menù si vede senza cifra.");
    });

    it("con più prodotti senza prezzo e un gruppo solo", () => {
        expect(text(prodottiLead(5, 1, 2, "prodotti", "menù"))).toBe("*5 prodotti* in 1 gruppo. {2 senza prezzo}: nel menù si vedono senza cifra.");
    });

    it("senza gruppi e senza mancanze", () => {
        expect(text(prodottiLead(3, 0, 0, "prodotti", "menù"))).toBe("*3 prodotti*.");
    });
});
