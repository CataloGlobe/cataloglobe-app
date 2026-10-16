import { describe, expect, it } from "vitest";
import { closeDrawerLayer, isTopDrawer, openDrawerLayer } from "@/components/layout/SystemDrawer/drawerStack";

// Due drawer impilati («Crea ordine» sopra il tavolo, #543): Esc è solo di quello sopra.
describe("pila dei drawer", () => {
    it("Esc è dell'ultimo aperto; chiuso lui, torna a quello sotto", () => {
        const tavolo = openDrawerLayer();
        const ordine = openDrawerLayer();
        expect(isTopDrawer(ordine)).toBe(true);
        expect(isTopDrawer(tavolo)).toBe(false);
        closeDrawerLayer(ordine);
        expect(isTopDrawer(tavolo)).toBe(true);
        closeDrawerLayer(tavolo);
    });

    it("chiudere quello sotto non toglie Esc a quello sopra", () => {
        const a = openDrawerLayer();
        const b = openDrawerLayer();
        closeDrawerLayer(a);
        expect(isTopDrawer(b)).toBe(true);
        closeDrawerLayer(b);
    });
});
