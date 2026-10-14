import { describe, expect, it } from "vitest";
import type { Scontro } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { Tunnel } from "@/pages/Dashboard/Crea/creaModel";
import { copreWait, hAltri, hCopreText, hCoperte, hDiff, hDiverse, hEsito, hKeys, hNuove, hSet, hVal, nascosto, nTutteSedi, sedePerWait } from "@/pages/Dashboard/Crea/creaSedePer";

const sc = (ids: string[], con: string, quando: string, vince = true): Scontro => ({ sedi: ids, ids, con, quando, vince, pari: false });
const T = (p: Partial<Tunnel>): Tunnel => ({ kind: "menu", onda: "on", ...p }) as Tunnel;
const SC = [sc(["a", "b"], "Carta", "a pranzo"), sc(["a"], "Colazioni", "la mattina"), sc(["c"], "Perso", "la sera", false)];

describe("sede per sede: insieme o al posto", () => {
    it("per sede, tutti gli altri che la bozza incontra, anche dove oggi vincono loro (D196)", () => {
        const m = hAltri(SC);
        expect(m.get("a")).toEqual([{ con: "Carta", quando: "a pranzo", copre: false }, { con: "Colazioni", quando: "la mattina", copre: false }]);
        expect(m.get("b")).toEqual([{ con: "Carta", quando: "a pranzo", copre: false }]);
        expect(m.get("c")).toEqual([{ con: "Perso", quando: "la sera", copre: true }]);
        expect(hCoperte(m)).toEqual(["c"]);
    });
    it("lo stesso altro in due momenti sta in una riga sola", () => {
        expect(hAltri([sc(["a"], "Carta", "a pranzo"), sc(["a"], "Carta", "a cena")]).get("a")).toEqual([{ con: "Carta", quando: "a pranzo, a cena", copre: false }]);
    });
    it("senza risposta sopra non c'è valore; con la risposta ogni sede la segue", () => {
        expect(hVal(T({}), "a", "Carta")).toBeNull();
        expect(hVal(T({ insieme: true }), "a", "Carta")).toBe("ins");
        expect(hVal(T({ insieme: false }), "a", "Carta")).toBe("pos");
    });
    it("una voce cambiata fa la sede diversa; rimessa come sopra, torna uguale", () => {
        const t = T({ insieme: true }), m = hAltri(SC);
        hSet(t, "a", "Colazioni", "pos");
        expect(hDiff(t, "a", m.get("a")!)).toBe(true);
        expect(hDiff(t, "b", m.get("b")!)).toBe(false);
        expect(hDiverse(t, m)).toBe(1);
        expect(hEsito(t, "a", m.get("a")!)).toEqual({ ins: ["Carta"], pos: ["Colazioni"], solo: [] });
        hSet(t, "a", "Colazioni", "ins");
        expect(t.hm).toEqual({});
        expect(hDiverse(t, m)).toBe(0);
    });
    it("una sede diversa aspetta il database nuovo; tutte uguali no", () => {
        const t = T({ insieme: true }), m = hAltri(SC);
        expect(sedePerWait(t, m)).toBe("");
        hSet(t, "b", "Carta", "pos");
        expect(sedePerWait(t, m)).toBe("Scelte diverse fra le sedi: si salva col database nuovo");
        expect(sedePerWait({ ...t, onda: "off" }, m)).toBe("");
    });
    it("tutte e due, tutte e tre, tutte le N", () => {
        expect([2, 3, 7].map(nTutteSedi)).toEqual(["tutte e due le sedi", "tutte e tre le sedi", "tutte le 7 sedi"]);
    });
    it("dove oggi vince l'altro: «insieme» lo lascia solo, «al posto» aspetta il database nuovo", () => {
        const m = hAltri(SC), c = m.get("c")!;
        const ins = T({ insieme: true }), pos = T({ insieme: false });
        expect(hEsito(ins, "c", c)).toEqual({ ins: [], pos: [], solo: ["Perso"] });
        expect(hCopreText(ins, c[0], "ins")).toBe("«Perso» sta al posto degli altri: qui, in quelle ore, il tuo non si vede.");
        expect(hCopreText(T({ kind: "stile", insieme: true }), c[0], "ins")).toBe("Qui, in quelle ore, resta lo stile «Perso».");
        expect(hCopreText(pos, c[0], "pos")).toBe("Al posto di «Perso», che oggi qui vince: si salva col database nuovo.");
        expect(hCopreText(pos, m.get("a")![0], "pos")).toBe("");
        const names = new Map([["c", "Comasina"]]);
        expect(copreWait(ins, m, names)).toBe("");
        expect(copreWait(pos, m, names)).toBe("Al posto di «Perso» a Comasina: si salva col database nuovo");
        expect(copreWait({ ...pos, onda: "off" }, m, names)).toBe("");
        // al posto di tutti, ma «Insieme» dove vince l'altro: è quello che succede oggi, si salva
        hSet(pos, "c", "Perso", "ins");
        expect(copreWait(pos, m, names)).toBe("");
        expect(sedePerWait(pos, m)).toBe("");
    });
    it("«In una frase»: le sedi dove non si vede perché resta un altro", () => {
        const sedi = [
            { id: "a", name: "Varedo", mins: 60, days: 1, cov: [], by: [], incroci: 0 },
            { id: "c", name: "Comasina", mins: 0, days: 0, cov: [], by: ["Perso"], incroci: 1 }
        ];
        expect(nascosto(T({ insieme: true }), sedi)).toEqual({ sedi: ["Comasina"], by: ["Perso"] });
        expect(nascosto(T({ insieme: false }), sedi)).toBeNull();
        expect(nascosto(T({}), sedi)).toEqual({ sedi: ["Comasina"], by: ["Perso"] });
    });
    it("in modifica: le sedi con un incrocio che alla partenza non c'era", () => {
        const base = hKeys(hAltri([sc(["a"], "Carta", "a pranzo")]));
        expect(base).toEqual(["a|Carta"]);
        expect(hNuove(hAltri(SC), base)).toEqual(["a", "b", "c"]);
        expect(hNuove(hAltri([sc(["a"], "Carta", "a pranzo"), sc(["c"], "Perso", "la sera", false)]), base)).toEqual(["c"]);
        expect(hNuove(hAltri([sc(["a"], "Carta", "a cena")]), base)).toEqual([]);
    });
});
