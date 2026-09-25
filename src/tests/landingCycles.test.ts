import { describe, expect, it } from "vitest";
import {
    HERO_BEAT_MS,
    HERO_BEATS,
    HERO_REDUCED_BEAT,
    changesFascia,
    heroFrame,
    nextBeat,
    startBeatForHour
} from "@/pages/CampaignLanding/components/sections/Hero/heroCycle";
import { IMPORT_READY_TICK, IMPORT_TICKS, importFrame } from "@/pages/CampaignLanding/components/sections/Import/importCycle";

describe("heroFrame", () => {
    it("fasce: pranzo, pranzo, aperitivo, aperitivo, cena", () => {
        expect([0, 1, 2, 3, 4].map((b) => heroFrame(b).fascia)).toEqual([0, 0, 1, 1, 2]);
    });

    it("prezzo alzato solo nel momento 1, esaurito solo nel momento 3", () => {
        expect(heroFrame(1)).toMatchObject({ fascia: 0, raisedRow: 1, soldOutRow: null });
        expect(heroFrame(3)).toMatchObject({ fascia: 1, raisedRow: null, soldOutRow: 3 });
        for (const b of [0, 2, 4]) expect(heroFrame(b)).toMatchObject({ raisedRow: null, soldOutRow: null });
    });

    it("giro continuo da 11,4 s: dopo la cena torna il pranzo", () => {
        expect(HERO_BEAT_MS.reduce((a, b) => a + b, 0)).toBe(11400);
        expect(nextBeat(HERO_BEATS - 1)).toBe(0);
        expect(heroFrame(HERO_BEATS + 2)).toEqual(heroFrame(2));
    });

    it("il blocco menù esce solo ai cambi di fascia", () => {
        expect([0, 1, 2, 3, 4].map(changesFascia)).toEqual([false, true, false, true, true]);
    });

    it("reduced motion: fermo sull'esaurito", () => {
        expect(heroFrame(HERO_REDUCED_BEAT)).toMatchObject({ beat: 3, soldOutRow: 3 });
    });

    it("parte dalla fascia dell'orario del visitatore", () => {
        expect(heroFrame(startBeatForHour(12)).fascia).toBe(0);
        expect(heroFrame(startBeatForHour(18)).fascia).toBe(1);
        expect(heroFrame(startBeatForHour(21)).fascia).toBe(2);
        expect(heroFrame(startBeatForHour(2)).fascia).toBe(2);
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
