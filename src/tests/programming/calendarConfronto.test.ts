import { describe, expect, it } from "vitest";
import { confrontoGiorno, cosaCambia, maggioranza, programmaDi, unisci, type Pezzo } from "@/pages/Dashboard/Programming/calendar/calendarConfronto";

const h = (x: number) => x * 60;
const menu = (label: string, a: number, b: number): Pezzo => ({ k: "menu", label, first: label, from: h(a), to: h(b) });
const stile = (label: string, a: number, b: number): Pezzo => ({ k: "style", label, first: label, from: h(a), to: h(b) });

const solito = [menu("Alla carta", 8, 12), menu("Pranzo", 12, 15), menu("Alla carta", 15, 24), stile("Sakura", 8, 24)];

describe("più sedi nel Calendario: il confronto (D150, E)", () => {
    it("due tratti vicini con la stessa cosa sono un pezzo solo", () => {
        expect(unisci([menu("Pranzo", 12, 13), menu("Pranzo", 13, 15), menu("Alla carta", 15, 24)])).toEqual([menu("Pranzo", 12, 15), menu("Alla carta", 15, 24)]);
    });

    it("dice a parole cosa cambia: in più, in meno, a un'altra ora", () => {
        expect(cosaCambia([...solito, menu("Aperitivo", 18, 21)], solito)).toBe("+ Aperitivo 18–21");
        expect(cosaCambia([menu("Alla carta", 8, 24), stile("Sakura", 8, 24)], solito)).toMatch(/senza Pranzo/);
        const corto = [menu("Alla carta", 8, 12), menu("Pranzo", 12, 14), menu("Alla carta", 14, 24), stile("Sakura", 8, 24)];
        expect(cosaCambia(corto, solito)).toContain("Pranzo 12–14 invece di 12–15");
        expect(cosaCambia([menu("Brunch", 10.5, 14)], [])).toBe("+ Brunch 10:30–14");
    });

    it("con una sede guardata: le uguali sono un numero, le diverse si raggruppano per programma", () => {
        const base = programmaDi(solito);
        const aperitivo = programmaDi([...solito, menu("Aperitivo", 18, 21)]);
        const r = confrontoGiorno(base, [
            ["a", base],
            ["b", aperitivo],
            ["c", aperitivo],
            ["d", programmaDi([stile("Sakura", 8, 24)])]
        ]);
        expect(r.same).toBe(1);
        expect(r.diffs.map(d => d.ids)).toEqual([["b", "c"], ["d"]]);
        expect(r.diffs[0].what).toBe("+ Aperitivo 18–21");
    });

    it("con tutte le sedi: il riferimento è quello che fa la maggior parte", () => {
        const base = programmaDi(solito);
        const altro = programmaDi([stile("Sakura", 8, 24)]);
        const r = maggioranza([
            ["x", altro],
            ["a", base],
            ["b", base]
        ])!;
        expect(r.baseIds).toEqual(["a", "b"]);
        expect(r.diffs).toHaveLength(1);
        expect(r.diffs[0].ids).toEqual(["x"]);
        expect(maggioranza([])).toBeNull();
    });
});
