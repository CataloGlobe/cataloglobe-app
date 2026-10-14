import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DB, NEW_MODEL } from "@/pages/Dashboard/Programming/calendar/calendarFlags";
import { asEdit, changed, newTunnel, skipped, stepSummary, steps, type Tunnel } from "@/pages/Dashboard/Crea/creaModel";
import { ME, hasOrd, ordFirst, ordIds, ordMove, ordRows, ordSummary, ordWait, posTxt, syncOrd, type Others } from "@/pages/Dashboard/Crea/evidOrd";

const ALL = { all: true, activityIds: [], groupIds: [] };
const OTHERS: Others = { a: [{ id: "x", name: "Aperitivo" }, { id: "y", name: "Brunch" }], b: [{ id: "x", name: "Aperitivo" }] };
const evid = () => {
    const t = newTunnel("evid", ALL);
    t.title = "Karaoke";
    t.onda = "on";
    return t;
};
const sede = (id: string) => ({ a: "Centro", b: "Porto", c: "Lago" })[id] ?? id;

describe("in evidenza: «L'ordine» sede per sede (D187)", () => {
    const keep = { evid: NEW_MODEL.evid, ready: DB.ready };
    beforeEach(() => void (NEW_MODEL.evid = true));
    afterEach(() => {
        NEW_MODEL.evid = keep.evid;
        DB.ready = keep.ready;
    });

    it("il passo c'è solo dove c'è già un altro contenuto, dopo Dove e Quando", () => {
        const t = evid();
        expect(ordIds(["a", "b", "c"], OTHERS)).toEqual(["a", "b"]);
        expect(steps(t, { owner: true, multi: true, ordSedi: ["a", "b"] })).toEqual(["contenuto", "dove", "quando", "ordine", "controlla"]);
        expect(steps(t, { owner: true, multi: true, ordSedi: [] })).toEqual(["contenuto", "dove", "quando", "controlla"]);
        expect(steps(t, { owner: false, multi: true, ordSedi: ["a"] })).toEqual(["contenuto", "controlla"]);
        // tenuto pronto, si salta
        t.onda = "off";
        expect(skipped(t, "ordine", { owner: true, multi: true, ordSedi: ["a"] })).toBe(true);
        NEW_MODEL.evid = false;
        expect(hasOrd(evid(), ["a"])).toBe(false);
    });

    it("parte per primo in ogni sede", () => {
        const t = evid();
        syncOrd(t, ["a", "b", "c"], OTHERS);
        expect(t.ord).toEqual({ a: [ME, "x", "y"], b: [ME, "x"] });
        expect(t.ordSame).toBe(true);
        expect(ordSummary(t, sede)).toBe("Per primo in tutte le sedi");
        expect(ordWait(t)).toBe("");
    });

    it("spostato in una sede: l'ordine non è più uguale, e si dice sede per sede", () => {
        const t = evid();
        syncOrd(t, ["a", "b"], OTHERS);
        ordMove(t, "a", 0, 1);
        expect(t.ord.a).toEqual(["x", ME, "y"]);
        expect(t.ordSame).toBe(false);
        expect(posTxt(t.ord.a)).toBe("2° di 3");
        expect(ordSummary(t, sede)).toBe("Centro: 2° di 3 · Porto: per primo");
        expect(stepSummary(t, "ordine", { sedi: new Map([["a", "Centro"], ["b", "Porto"]]) } as never, () => "")).toBe("Centro: 2° di 3 · Porto: per primo");
        ordMove(t, "a", 1, 2);
        expect(posTxt(t.ord.a)).toBe("per ultimo");
        // fuori dai bordi non si muove
        ordMove(t, "a", 2, 3);
        expect(t.ord.a).toEqual(["x", "y", ME]);
    });

    it("cambiate le sedi o i contenuti, l'ordine si rimette in pari senza perdere le scelte", () => {
        const t = evid();
        syncOrd(t, ["a", "b"], OTHERS);
        ordMove(t, "a", 0, 2);
        t.ordOpen = "b";
        syncOrd(t, ["a", "c"], { a: [{ id: "y", name: "Brunch" }, { id: "z", name: "Cena" }] });
        expect(t.ord).toEqual({ a: ["y", ME, "z"] });
        expect(t.ordOpen).toBeNull();
    });

    it("«Sì»: di nuovo per primo dappertutto", () => {
        const t = evid();
        syncOrd(t, ["a", "b"], OTHERS);
        ordMove(t, "a", 0, 2);
        ordFirst(t);
        expect(t.ord.a).toEqual([ME, "x", "y"]);
        expect(t.ordSame).toBe(true);
    });

    it("un ordine diverso aspetta il database nuovo, poi scrive le righe sede per sede", () => {
        const t = evid();
        syncOrd(t, ["a", "b"], OTHERS);
        ordMove(t, "a", 0, 1);
        expect(ordWait(t)).toBe("«L'ordine»: si salva col database nuovo");
        // tenuto pronto non va in nessuna sede: niente da aspettare
        t.onda = "off";
        expect(ordWait(t)).toBe("");
        t.onda = "on";
        DB.ready = true;
        expect(ordWait(t)).toBe("");
        expect(ordRows(t, "new", ["a", "b"])).toEqual([
            { activity_id: "a", featured_content_id: "x", position: 0 },
            { activity_id: "a", featured_content_id: "new", position: 1 },
            { activity_id: "a", featured_content_id: "y", position: 2 },
            { activity_id: "b", featured_content_id: "new", position: 0 },
            { activity_id: "b", featured_content_id: "x", position: 1 }
        ]);
    });

    it("con una sede sola il riassunto è la posizione", () => {
        const t: Tunnel = evid();
        syncOrd(t, ["a"], OTHERS);
        expect(ordSummary(t, sede)).toBe("Per primo");
        ordMove(t, "a", 0, 2);
        expect(ordSummary(t, sede)).toBe("Per ultimo");
    });
    it("in modifica (punto 15): ogni sede parte dal suo ordine salvato, e solo uno spostamento è un cambio", () => {
        const t = asEdit(evid(), "k", { id: "r", count: 1, live: true });
        expect(t.ordSame).toBe(false);
        expect(steps(t, { owner: true, multi: true, ordSedi: ["a"] })).toEqual(["modifica", "contenuto", "dove", "quando", "ordine", "controlla"]);
        // a Centro era secondo, a Porto non c'era: lì parte per primo
        const full: Others = { a: [{ id: "x", name: "Aperitivo" }, { id: "k", name: "Karaoke" }, { id: "y", name: "Brunch" }], b: [{ id: "x", name: "Aperitivo" }] };
        syncOrd(t, ["a", "b"], OTHERS, full);
        expect(t.ord).toEqual({ a: ["x", ME, "y"], b: [ME, "x"] });
        expect(ordSummary(t, sede)).toBe("Centro: 2° di 3 · Porto: per primo");
        expect(changed(t, "ordine")).toBe(false);
        expect(ordWait(t)).toBe("");
        ordMove(t, "a", 1, 0);
        expect(changed(t, "ordine")).toBe(true);
        expect(ordWait(t)).toBe("«L'ordine»: si salva col database nuovo");
        // «Sì, per primo in tutte»: a Porto era già primo, a Centro no
        ordFirst(t);
        syncOrd(t, ["a", "b"], OTHERS, full);
        expect(t.ord).toEqual({ a: [ME, "x", "y"], b: [ME, "x"] });
        expect(changed(t, "ordine")).toBe(true);
    });
});
