import { describe, expect, it } from "vitest";
import type { Appearance, AppearanceActivity } from "@/utils/ruleAppearance";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { leadOf, matchesOnAir, onAirOf, sortVetrina, storieLead } from "@/pages/Dashboard/Vetrina/vetrinaModel";

const rule = { time_mode: "always", applyToAll: false } as unknown as LayoutRule;
const SEDI: AppearanceActivity[] = [
    { id: "a", name: "Centro", status: "active" },
    { id: "b", name: "Porto", status: "active" },
    { id: "c", name: "Lago", status: "active" }
];
const live = (...ids: string[]): Appearance => ({
    summary: "liveNow",
    seats: ids.map(id => ({ activityId: id, name: SEDI.find(s => s.id === id)!.name, reason: "live" as const, rule, overriddenBy: null })),
    rules: [{ rule, status: "active" as never, isLive: true, slot: null, activityIds: ids }]
});
const assigned: Appearance = {
    summary: "assigned",
    seats: [],
    rules: [{ rule, status: "active" as never, isLive: true, slot: null, activityIds: ["a", "b"] }]
};
const none: Appearance = { summary: "unassigned", seats: [], rules: [] };
const WORDS = { none: "nessun menù", lead: "Adesso in onda:" };

describe("Menù e vetrina: la riga «In onda»", () => {
    it("adesso, con il quando e il dove", () => {
        expect(onAirOf(live("a", "b"), SEDI)).toEqual({ state: "now", when: "sempre", where: "2 sedi" });
        expect(onAirOf(live("a", "b", "c"), SEDI).where).toBe("tutte le sedi");
        expect(onAirOf(live("a"), SEDI).where).toBe("Centro");
    });
    it("con una sede sola il dove non si dice", () => {
        expect(onAirOf(live("a"), SEDI.slice(0, 1))).toEqual({ state: "now", when: "sempre", where: null });
    });
    it("in onda in altri momenti, o niente", () => {
        expect(onAirOf(assigned, SEDI)).toEqual({ state: "on", when: "sempre", where: "2 sedi" });
        expect(onAirOf(none, SEDI).state).toBe("off");
        expect(onAirOf(null, SEDI).state).toBe("off");
    });
    it("i filtri", () => {
        expect(matchesOnAir("on", onAirOf(assigned, SEDI))).toBe(true);
        expect(matchesOnAir("off", onAirOf(assigned, SEDI))).toBe(false);
        expect(matchesOnAir("off", onAirOf(none, SEDI))).toBe(true);
    });
});

describe("Menù e vetrina: la frase in cima", () => {
    const text = (parts: ReturnType<typeof leadOf>) =>
        parts.map(p => ("text" in p ? p.text : "name" in p ? `[${p.name}]` : "down" in p ? `{${p.down}}` : `*${p.strong}*`)).join("");

    it("con più sedi: chi, dove, e chi non mostra niente", () => {
        const parts = leadOf(
            [
                { name: "Cena", appearance: live("a", "b") },
                { name: "Pranzo", appearance: assigned }
            ],
            SEDI,
            WORDS,
            "nessun menù"
        );
        expect(text(parts)).toBe("Adesso in onda: [Cena] a Centro e Porto. {Lago} non mostra nessun menù.");
    });
    it("in tutte le sedi", () => {
        expect(text(leadOf([{ name: "Cena", appearance: live("a", "b", "c") }], SEDI, WORDS, "nessun menù"))).toBe(
            "Adesso in onda: [Cena] in tutte le sedi."
        );
    });
    it("con una sede sola", () => {
        const one = SEDI.slice(0, 1);
        expect(text(leadOf([{ name: "Cena", appearance: live("a") }, { name: "Vini", appearance: live("a") }], one, WORDS))).toBe(
            "Adesso i clienti vedono [Cena] e [Vini]."
        );
    });
    it("niente in onda", () => {
        expect(text(leadOf([{ name: "Cena", appearance: none }], SEDI, WORDS))).toBe("Adesso nessun menù è in onda.");
    });
});

describe("Menù e vetrina: l'ordine", () => {
    const items = [
        { name: "Bruno", created_at: "2026-10-01", on: "off" },
        { name: "Anna", created_at: "2026-10-03", on: "on" },
        { name: "Carla", created_at: "2026-10-02", on: "now" }
    ] as const;
    const onAir = (item: (typeof items)[number]) => ({ state: item.on, when: null, where: null });
    it("in onda prima, ultimi creati, per nome", () => {
        expect(sortVetrina(items, "onda", onAir).map(i => i.name)).toEqual(["Carla", "Anna", "Bruno"]);
        expect(sortVetrina(items, "recenti", onAir).map(i => i.name)).toEqual(["Anna", "Carla", "Bruno"]);
        expect(sortVetrina(items, "nome", onAir).map(i => i.name)).toEqual(["Anna", "Bruno", "Carla"]);
    });
});

describe("Storie: la frase in cima", () => {
    const text = (parts: ReturnType<typeof storieLead>) => parts.map(p => ("strong" in p ? p.strong : "text" in p ? p.text : "")).join("");

    it("conta le storie in onda e le bozze", () => {
        expect(text(storieLead(2, 1))).toBe("2 storie in onda, una in bozza. Stanno sotto il menù, negli approfondimenti.");
        expect(text(storieLead(1, 3))).toBe("Una storia in onda, 3 in bozza. Stanno sotto il menù, negli approfondimenti.");
        expect(text(storieLead(1, 1, 2))).toBe("Una storia in onda, una in bozza, 2 ferme. Stanno sotto il menù, negli approfondimenti.");
        expect(text(storieLead(0, 0, 1))).toBe("Nessuna storia in onda, una ferma. Stanno sotto il menù, negli approfondimenti.");
    });

    it("senza bozze e senza storie in onda", () => {
        expect(text(storieLead(0, 0))).toBe("Nessuna storia in onda. Stanno sotto il menù, negli approfondimenti.");
        expect(storieLead(3, 0)[0]).toEqual({ strong: "3 storie" });
    });
});
