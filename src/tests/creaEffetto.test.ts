import { describe, expect, it } from "vitest";
import type { SedeEff } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { effChips, effLab, effSum } from "@/pages/Dashboard/Crea/creaEffetto";

const sede = (id: string, p: Partial<SedeEff> = {}): SedeEff => ({ id, name: id, mins: 600, days: 5, cov: [], by: [], incroci: 0, ...p });

describe("«Cosa cambia nel calendario»: cosa succede in una sede", () => {
    it("fuori dalla settimana, o coperto da un altro", () => {
        expect(effLab(sede("a", { mins: 0, days: 0 }), "menu", false)).toEqual({ lab: "Questa settimana non c'è", ico: "off" });
        expect(effLab(sede("a", { mins: 0, days: 0, by: ["Pranzo"] }), "menu", false).lab).toBe("Questa settimana non va mai in onda: lo copre «Pranzo»");
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
        expect(effLab(c, "stile", () => "ins").lab).toBe("Lascia «Catalogo»: lì resta il suo stile");
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

