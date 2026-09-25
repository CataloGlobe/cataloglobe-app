import { describe, expect, it } from "vitest";
import {
    HERO_CYCLE_TICKS,
    HERO_REDUCED_TICK,
    HERO_TICKS_PER_BEAT,
    heroFrame,
    startTickForHour
} from "@/pages/CampaignLanding/components/sections/Hero/heroCycle";
import { IMPORT_READY_TICK, IMPORT_TICKS, importFrame } from "@/pages/CampaignLanding/components/sections/Import/importCycle";

describe("heroFrame", () => {
    it("cambio di fascia: fascia nuova già al tick 0 del momento", () => {
        expect(heroFrame(0)).toMatchObject({ beat: 0, fascia: 0 });
        expect(heroFrame(2 * HERO_TICKS_PER_BEAT)).toMatchObject({ beat: 2, fascia: 1 });
        expect(heroFrame(4 * HERO_TICKS_PER_BEAT)).toMatchObject({ beat: 4, fascia: 2 });
    });

    it("prezzo aggiornato: la barra cambia al tick 0, la riga al tick 1", () => {
        expect(heroFrame(HERO_TICKS_PER_BEAT)).toMatchObject({ beat: 1, fascia: 0, raisedRow: null });
        expect(heroFrame(HERO_TICKS_PER_BEAT + 1)).toMatchObject({ beat: 1, raisedRow: 1 });
    });

    it("esaurito: la riga 4 dell'aperitivo si spegne dal tick 1", () => {
        expect(heroFrame(3 * HERO_TICKS_PER_BEAT).soldOutRow).toBeNull();
        expect(heroFrame(3 * HERO_TICKS_PER_BEAT + 1)).toMatchObject({ fascia: 1, soldOutRow: 3 });
    });

    it("dopo un giro completo torna allo stesso fotogramma", () => {
        for (const start of [0, 24, 48]) expect(heroFrame(start + HERO_CYCLE_TICKS)).toEqual(heroFrame(start));
    });

    it("reduced motion: fermo sull'esaurito già applicato", () => {
        expect(heroFrame(HERO_REDUCED_TICK)).toMatchObject({ beat: 3, soldOutRow: 3 });
    });

    it("parte dalla fascia dell'orario del visitatore", () => {
        expect(heroFrame(startTickForHour(12)).fascia).toBe(0);
        expect(heroFrame(startTickForHour(18)).fascia).toBe(1);
        expect(heroFrame(startTickForHour(21)).fascia).toBe(2);
        expect(heroFrame(startTickForHour(2)).fascia).toBe(2);
    });
});

describe("importFrame", () => {
    it("legge un piatto ogni due tick dal tick 4, fino a 4", () => {
        expect([3, 4, 5, 6, 8, 10, 11].map((t) => importFrame(t).read)).toEqual([0, 1, 1, 2, 3, 4, 4]);
    });

    it("mirino, lampo, scansione e pronto nei tick giusti", () => {
        expect(importFrame(1)).toMatchObject({ frameOn: true, flash: false, scanOn: false });
        expect(importFrame(2).flash).toBe(true);
        expect(importFrame(3).scanOn).toBe(true);
        expect(importFrame(12)).toMatchObject({ ready: true, pop: true, highlight: false });
        expect(importFrame(IMPORT_READY_TICK)).toMatchObject({ ready: true, pop: false, read: 4 });
        expect(importFrame(IMPORT_TICKS - 1).ready).toBe(true);
    });
});
