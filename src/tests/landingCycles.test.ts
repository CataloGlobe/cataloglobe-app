import { describe, expect, it } from "vitest";
import {
    HERO_LOOP_MS,
    HERO_START_MS,
    HERO_STEP_MS,
    heroEvents,
    heroInitialState,
    heroReducedState,
    heroReducer,
    timelineFill,
    timelineRows,
    trackPosition,
    type HeroState
} from "@/pages/CampaignLanding/components/sections/Hero/heroSequence";
import { HERO } from "@/pages/CampaignLanding/content/landing";
import { IMPORT_READY_TICK, IMPORT_TICKS, importFrame } from "@/pages/CampaignLanding/components/sections/Import/importCycle";

const START = HERO.phone.startClock;

/** Stato a `ms` dall'inizio del giro. */
function heroAt(ms: number): HeroState {
    return heroEvents()
        .filter((e) => e.at <= ms)
        .reduce((s, e) => heroReducer(s, e.event, START), heroInitialState(START));
}

describe("hero: sequenza", () => {
    it("cinque passi da 2,3 s, il primo a 150 ms, giro di 13 s con la pausa finale", () => {
        expect(HERO_START_MS).toBe(150);
        expect(HERO_STEP_MS).toBe(2300);
        expect(HERO_LOOP_MS).toBe(5 * 2300 + 1500);
        expect(heroEvents().every((e) => e.at < HERO_LOOP_MS)).toBe(true);
    });

    it("12:00 pranzo in corso, senza far uscire il menù già in vista", () => {
        const s = heroAt(1000);
        expect(s).toMatchObject({ clock: "12:00", slot: 0, menu: 0, menuOut: false, lives: 0 });
    });

    it("13:10: la modifica entra in lista, poi la linea, poi il telefono (~650 ms)", () => {
        const t = HERO_START_MS + HERO_STEP_MS + 100;
        expect(heroAt(t)).toMatchObject({ clock: "12:00", lives: 1, filled: 0, applied: 0 });
        expect(heroAt(t + 450)).toMatchObject({ clock: "13:10", filled: 1, applied: 0 });
        expect(heroAt(t + 650)).toMatchObject({ applied: 1, menu: 0 });
    });

    it("18:00 aperitivo: il menù esce (160 ms) e rientra quello nuovo", () => {
        const t0 = HERO_START_MS + 2 * HERO_STEP_MS;
        expect(heroAt(t0 + 450)).toMatchObject({ slot: 1, menu: 0, menuOut: true });
        expect(heroAt(t0 + 620)).toMatchObject({ menu: 1, menuOut: false });
    });

    it("fine giornata: cena, due modifiche al volo in lista", () => {
        expect(heroAt(HERO_LOOP_MS - 1)).toMatchObject({ clock: "20:00", slot: 2, menu: 2, lives: 2, applied: 2 });
    });

    it("reset: si riparte da 11:58, lista vuota", () => {
        expect(heroReducer(heroAt(HERO_LOOP_MS - 1), { type: "reset" }, START)).toEqual(heroInitialState(START));
    });

    it("reduced motion: aperitivo, bruschette esaurite", () => {
        const s = heroReducedState(START);
        expect(s).toMatchObject({ slot: 1, menu: 1, applied: 2, last: { kind: "live", live: 1 } });
        const sold = HERO.schedule.live[1];
        expect(sold.kind).toBe("sold");
        const dishes = HERO.phone.menus[sold.menu].cats.flatMap((c) => c.dishes);
        expect(dishes[sold.row].name).toBe("Bruschette miste");
    });

    it("la modifica di prezzo punta all'Insalata di mare (16 → 17 €)", () => {
        const up = HERO.schedule.live[0];
        const dishes = HERO.phone.menus[up.menu].cats.flatMap((c) => c.dishes);
        expect(dishes[up.row]).toMatchObject({ name: "Insalata di mare", price: 16 });
        expect(up.kind === "price" && up.to).toBe(17);
    });
});

describe("hero: programmazione", () => {
    it("le modifiche al volo stanno dopo la fascia in cui avvengono", () => {
        expect(timelineRows(2).map((r) => (r.kind === "slot" ? `s${r.slot}` : `l${r.live}`))).toEqual(["s0", "l0", "s1", "l1", "s2"]);
    });

    it("linea viola fino all'ultima riga accesa (righe 44, modifiche 50)", () => {
        expect(timelineFill({ slot: -1, lives: 0, filled: 0 })).toBe(0);
        expect(timelineFill({ slot: 0, lives: 1, filled: 0 })).toBe(0);
        expect(timelineFill({ slot: 0, lives: 1, filled: 1 })).toBe(47);
        expect(timelineFill({ slot: 1, lives: 1, filled: 1 })).toBe(94);
        expect(timelineFill({ slot: 2, lives: 2, filled: 2 })).toBe(188);
    });

    it("linea orizzontale: fasce a 0 / 60 / 100 %, modifiche alla loro ora", () => {
        expect(["12:00", "18:00", "20:00"].map(trackPosition)).toEqual([0, 60, 100]);
        expect(trackPosition("13:10")).toBeCloseTo(11.667, 2);
        expect(trackPosition("19:25")).toBeCloseTo(88.333, 2);
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
