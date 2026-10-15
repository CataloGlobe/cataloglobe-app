import { describe, expect, it } from "vitest";
import type { SedeEff } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { effChips, effLab, effSum } from "@/pages/Dashboard/Crea/creaEffetto";

const sede = (id: string, p: Partial<SedeEff> = {}): SedeEff => ({ id, name: id, mins: 600, days: 5, cov: [], by: [], incroci: 0, ...p });

describe("«Cosa cambia nel calendario»: cosa succede in una sede", () => {
    it("fuori dalla settimana, o coperto da un altro", () => {
        expect(effLab(sede("a", { mins: 0, days: 0 }), "menu", false)).toEqual({ lab: "Questa settimana non c'è", ico: "off" });
        expect(effLab(sede("a", { mins: 0, days: 0, by: ["Pranzo"] }), "menu", false).lab).toBe("Questa settimana non va mai in onda: lo copre «Pranzo»");
        expect(effLab(sede("a", { mins: 0, days: 0, by: ["Pranzo", "Cena"] }), "menu", false).lab).toBe("Questa settimana non va mai in onda: lo coprono «Pranzo» e «Cena»");
    });
    it("non incrocia nessuno: la parola segue il tipo", () => {
        expect(effLab(sede("a"), "menu", false).lab).toBe("Non incrocia altri menù");
        expect(effLab(sede("a"), "stile", false).lab).toBe("Non incrocia altri stili");
        expect(effLab(sede("a"), "evid", false).lab).toBe("Non incrocia altri contenuti");
    });
    it("prende il posto, oppure sta insieme", () => {
        const x = sede("a", { cov: ["Pranzo", "Cena"] });
        expect(effLab(x, "menu", false)).toEqual({ lab: "Prende il posto di «Pranzo» e «Cena»", ico: "posto" });
        expect(effLab(x, "menu", true).lab).toBe("Insieme a «Pranzo» e «Cena»: il cliente sceglie");
        expect(effLab(x, "stile", true).lab).toBe("Lascia «Pranzo» e «Cena»");
        expect(effLab(x, "evid", true).lab).toBe("Insieme a «Pranzo» e «Cena»");
    });
});

describe("«Cosa cambia nel calendario»: le sedi per esito", () => {
    it("le sedi con lo stesso esito stanno insieme, le più numerose prima, quelle ferme in fondo", () => {
        const r = effSum([sede("a", { mins: 0, days: 0 }), sede("b", { cov: ["Pranzo"] }), sede("c"), sede("d")], "menu", false);
        expect(r.on).toBe(3);
        expect(r.same).toBe(true);
        expect(r.mins).toBe(600);
        expect(r.groups.map(g => [g.lab, g.ids])).toEqual([
            ["Non incrocia altri menù", ["c", "d"]],
            ["Prende il posto di «Pranzo»", ["b"]],
            ["Questa settimana non c'è", ["a"]]
        ]);
        expect(r.groups.every(g => g.hrs === "")).toBe(true);
    });
    it("ore diverse fra le sedi: ogni gruppo dice le sue", () => {
        const r = effSum([sede("a"), sede("b", { mins: 120, days: 1 })], "stile", false);
        expect(r.same).toBe(false);
        expect(r.groups.map(g => g.hrs)).toEqual(["5 giorni, 10 ore", "1 giorno, 2 ore"]);
    });
    it("nessuna sede in onda", () => {
        const r = effSum([sede("a", { mins: 0, days: 0 })], "evid", false);
        expect(r.on).toBe(0);
        expect(r.same).toBe(false);
    });
});

describe("le sedi di un gruppo", () => {
    it("fino a quattro tutte, oltre tre e «+N»", () => {
        expect(effChips(["a", "b", "c", "d"], false)).toEqual({ ids: ["a", "b", "c", "d"], more: 0 });
        expect(effChips(["a", "b", "c", "d", "e"], false)).toEqual({ ids: ["a", "b", "c"], more: 2 });
        expect(effChips(["a", "b", "c", "d", "e"], true).ids).toHaveLength(5);
    });
    it("con la risposta sede per sede: dove oggi vince l'altro dice cosa porta la scelta (D196)", () => {
        const c = sede("c", { mins: 0, days: 0, by: ["Catalogo"] });
        expect(effLab(c, "menu", () => "ins")).toEqual({ lab: "Non si vede: lì resta «Catalogo», al posto degli altri", ico: "off" });
        expect(effLab(c, "stile", () => "ins")).toEqual({ lab: "Lascia «Catalogo»: lì resta il suo stile", ico: "insieme" });
        expect(effLab(sede("d", { by: ["Catalogo"] }), "stile", () => "ins").lab).toBe("Lascia «Catalogo»");
        expect(effLab(c, "menu", () => "pos")).toEqual({ lab: "Prende il posto di «Catalogo»: si salva col database nuovo", ico: "posto" });
        const mix = sede("a", { cov: ["Pranzo"], by: ["Catalogo"] });
        expect(effLab(mix, "menu", (_, con) => (con === "Pranzo" ? "ins" : "pos")).lab).toBe("Insieme a «Pranzo»: il cliente sceglie · prende il posto di «Catalogo»: si salva col database nuovo");
    });
    it("«In onda in N di M sedi»: conta anche dove andrà in onda col database nuovo", () => {
        const r = effSum([sede("a"), sede("c", { mins: 0, days: 0, by: ["Catalogo"] })], "menu", () => "ins");
        expect([r.on, r.tot]).toEqual([1, 2]);
        expect(effSum([sede("a"), sede("c", { mins: 0, days: 0, by: ["Catalogo"] })], "menu", () => "pos").on).toBe(2);
    });
});


describe("«Cosa cambia nel calendario» in modifica: «Prima: …» e le sedi dove non cambia niente", () => {
    it("le sedi uguali a prima vanno a parte, le altre dicono com'era", () => {
        const prima = { sedi: [sede("a"), sede("b"), sede("c", { cov: ["Pranzo"] })], val: false as const };
        const r = effSum([sede("a"), sede("b", { cov: ["Pranzo"] }), sede("c", { cov: ["Pranzo"] }), sede("d")], "menu", false, prima);
        expect(r.unchanged).toEqual(["a", "c"]);
        expect(r.groups.map(g => [g.lab, g.prima, g.ids])).toEqual([
            ["Prende il posto di «Pranzo»", "non incrocia altri menù", ["b"]],
            ["Non incrocia altri menù", "non c'era", ["d"]]
        ]);
        expect(r.on).toBe(4);
    });
    it("stesso esito ma prima diverso: due gruppi", () => {
        const prima = { sedi: [sede("a"), sede("b", { mins: 0, days: 0 })], val: false as const };
        const r = effSum([sede("a", { cov: ["Cena"] }), sede("b", { cov: ["Cena"] })], "menu", false, prima);
        expect(r.groups.map(g => g.prima)).toEqual(["non incrocia altri menù", "non c'era"]);
    });
    it("spenta prima e spenta adesso: non cambia niente", () => {
        const off = sede("a", { mins: 0, days: 0 });
        expect(effSum([off], "menu", false, { sedi: [off], val: false }).unchanged).toEqual(["a"]);
    });
    it("senza `prima` (creando) nessuna sede va a parte", () => {
        expect(effSum([sede("a")], "menu", false).unchanged).toEqual([]);
        expect(effSum([sede("a")], "menu", false).groups[0].prima).toBeUndefined();
    });
});
