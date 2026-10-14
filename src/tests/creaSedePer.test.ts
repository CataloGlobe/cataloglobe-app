import { describe, expect, it } from "vitest";
import type { Scontro } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { Tunnel } from "@/pages/Dashboard/Crea/creaModel";
import { hAltri, hDiff, hDiverse, hEsito, hSet, hVal, nTutteSedi, sedePerWait } from "@/pages/Dashboard/Crea/creaSedePer";

const sc = (ids: string[], con: string, quando: string, vince = true): Scontro => ({ sedi: ids, ids, con, quando, vince, pari: false });
const T = (p: Partial<Tunnel>): Tunnel => ({ kind: "menu", onda: "on", ...p }) as Tunnel;
const SC = [sc(["a", "b"], "Carta", "a pranzo"), sc(["a"], "Colazioni", "la mattina"), sc(["c"], "Perso", "la sera", false)];

describe("sede per sede: insieme o al posto", () => {
    it("per sede, solo gli altri che la bozza incontra e vince", () => {
        const m = hAltri(SC);
        expect(m.get("a")).toEqual([{ con: "Carta", quando: "a pranzo" }, { con: "Colazioni", quando: "la mattina" }]);
        expect(m.get("b")).toEqual([{ con: "Carta", quando: "a pranzo" }]);
        expect(m.has("c")).toBe(false);
    });
    it("lo stesso altro in due momenti sta in una riga sola", () => {
        expect(hAltri([sc(["a"], "Carta", "a pranzo"), sc(["a"], "Carta", "a cena")]).get("a")).toEqual([{ con: "Carta", quando: "a pranzo, a cena" }]);
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
        expect(hEsito(t, "a", m.get("a")!)).toEqual({ ins: ["Carta"], pos: ["Colazioni"] });
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
});
