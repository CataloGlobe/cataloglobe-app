import { describe, expect, it } from "vitest";
import { chooseToolbarLayout } from "@/hooks/useCompactToolbar";

// Le misure di Programmazione (F5): tab 611, azioni 661 · 537 · 457, gap 12.
const PROGRAMMAZIONE = { gap: 12, leading: 611, actions: [661, 537, 457], stack: true };

describe("chooseToolbarLayout", () => {
    it("una pagina senza versioni strette: riga o barra compatta, come prima", () => {
        expect(chooseToolbarLayout({ available: 900, gap: 12, leading: 300, actions: [400], stack: false })).toEqual({ mode: "row", step: 0 });
        expect(chooseToolbarLayout({ available: 700, gap: 12, leading: 300, actions: [400], stack: false })).toEqual({ mode: "compact", step: 0 });
        expect(chooseToolbarLayout({ available: 400, gap: 12, leading: null, actions: [400], stack: false })).toEqual({ mode: "row", step: 0 });
        expect(chooseToolbarLayout({ available: 400, gap: 12, leading: null, actions: [], stack: false })).toEqual({ mode: "row", step: 0 });
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

    it("la barra compatta quando neanche le tab stanno da sole, o senza due righe", () => {
        expect(chooseToolbarLayout({ ...PROGRAMMAZIONE, available: 600 })).toEqual({ mode: "compact", step: 0 });
        expect(chooseToolbarLayout({ ...PROGRAMMAZIONE, available: 972, stack: false })).toEqual({ mode: "compact", step: 0 });
    });

    it("un pixel di tolleranza sugli arrotondamenti", () => {
        expect(chooseToolbarLayout({ available: 711, gap: 0, leading: 300, actions: [412], stack: false }).mode).toBe("row");
        expect(chooseToolbarLayout({ available: 710, gap: 0, leading: 300, actions: [412], stack: false }).mode).toBe("compact");
    });
});
