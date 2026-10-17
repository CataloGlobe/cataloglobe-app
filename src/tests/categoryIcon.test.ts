import { describe, expect, it } from "vitest";
import { Beef, CakeSlice, CookingPot, CupSoda, Pizza, Utensils, Wine } from "lucide-react";
import { categoryIcon } from "@/components/PublicCollectionView/CollectionView/categoryIcon";

describe("categoryIcon", () => {
    it("sceglie l'icona dal nome della categoria", () => {
        expect(categoryIcon("Pizze rosse")).toBe(Pizza);
        expect(categoryIcon("Primi piatti")).toBe(CookingPot);
        expect(categoryIcon("SECONDI DI CARNE")).toBe(Beef);
        expect(categoryIcon("Dolci della casa")).toBe(CakeSlice);
        expect(categoryIcon("Bevande")).toBe(CupSoda);
    });

    it("rispetta l'ordine delle regole", () => {
        expect(categoryIcon("Vini e birre")).toBe(Wine);
    });

    it("non confonde parole che contengono la radice", () => {
        expect(categoryIcon("Divino")).toBe(Utensils);
    });

    it("usa le posate quando nessuna parola combacia", () => {
        expect(categoryIcon("Antipasti")).toBe(Utensils);
    });
});
