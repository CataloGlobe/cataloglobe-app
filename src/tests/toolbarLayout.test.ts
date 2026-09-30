import { describe, expect, it } from "vitest";
import { chooseToolbarLayout } from "@/hooks/useCompactToolbar";

// Le misure di Programmazione (F5): tab 611, azioni 661 · 537 · 457, gap 12.
const PROGRAMMAZIONE = { gap: 12, leading: 611, actions: [661, 537, 457], stack: true };

describe("chooseToolbarLayout", () => {
    it("una pagina senza versioni strette: riga, due righe, poi barra compatta", () => {
        expect(chooseToolbarLayout({ available: 900, gap: 12, leading: 300, actions: [400], stack: true })).toEqual({ mode: "row", step: 0 });
        expect(chooseToolbarLayout({ available: 700, gap: 12, leading: 300, actions: [400], stack: true })).toEqual({ mode: "stacked", step: 0 });
        expect(chooseToolbarLayout({ available: 350, gap: 12, leading: 300, actions: [400], stack: true })).toEqual({ mode: "compact", step: 0 });
        expect(chooseToolbarLayout({ available: 400, gap: 12, leading: null, actions: [400], stack: true })).toEqual({ mode: "row", step: 0 });
        expect(chooseToolbarLayout({ available: 400, gap: 12, leading: null, actions: [], stack: true })).toEqual({ mode: "row", step: 0 });
    });

    it("senza tab non ci sono due righe: le azioni troppo larghe vanno in barra compatta", () => {
        expect(chooseToolbarLayout({ available: 343, gap: 12, leading: null, actions: [459], stack: true })).toEqual({ mode: "compact", step: 0 });
    });

    it("prima la versione più comoda che sta in riga", () => {
        expect(chooseToolbarLayout({ ...PROGRAMMAZIONE, available: 1284 })).toEqual({ mode: "row", step: 0 });
        expect(chooseToolbarLayout({ ...PROGRAMMAZIONE, available: 1160 })).toEqual({ mode: "row", step: 1 });
        expect(chooseToolbarLayout({ ...PROGRAMMAZIONE, available: 1080 })).toEqual({ mode: "row", step: 2 });
    });

    it("poi due righe, con le azioni più comode che stanno da sole", () => {
        expect(chooseToolbarLayout({ ...PROGRAMMAZIONE, available: 972 })).toEqual({ mode: "stacked", step: 0 });
        expect(chooseToolbarLayout({ ...PROGRAMMAZIONE, available: 645 })).toEqual({ mode: "stacked", step: 1 });
    });

    it("la barra compatta quando neanche le tab stanno da sole", () => {
        expect(chooseToolbarLayout({ ...PROGRAMMAZIONE, available: 600 })).toEqual({ mode: "compact", step: 0 });
    });

    it("sotto 768 (stack spento) niente due righe: dalla riga si passa alla barra compatta", () => {
        // Comande a 375: tab 199 e azioni 305 starebbero da sole su 343.
        expect(chooseToolbarLayout({ available: 343, gap: 12, leading: 199, actions: [305], stack: false })).toEqual({ mode: "compact", step: 0 });
        expect(chooseToolbarLayout({ ...PROGRAMMAZIONE, available: 972, stack: false })).toEqual({ mode: "compact", step: 0 });
        expect(chooseToolbarLayout({ ...PROGRAMMAZIONE, available: 1160, stack: false })).toEqual({ mode: "row", step: 1 });
    });

    it("un pixel di tolleranza sugli arrotondamenti", () => {
        expect(chooseToolbarLayout({ available: 711, gap: 0, leading: 300, actions: [412], stack: true }).mode).toBe("row");
        expect(chooseToolbarLayout({ available: 710, gap: 0, leading: 300, actions: [412], stack: true }).mode).toBe("stacked");
        expect(chooseToolbarLayout({ available: 299, gap: 0, leading: 300, actions: [412], stack: true }).mode).toBe("compact");
    });
});
