// «Avanti» porta a ciò che manca: per ogni blocco del tunnel, l'elemento da segnare.
import { describe, expect, it } from "vitest";
import { badSel } from "@/pages/Dashboard/Crea/creaBad";
import { CHOOSE, blocker, newTunnel, type Ctx } from "@/pages/Dashboard/Crea/creaModel";

const ALL = { all: true, activityIds: [], groupIds: [] };
const c: Ctx = { owner: true, multi: true };
const at = (k: string) => `[data-bad="${k}"]`;

describe("badSel", () => {
    it("il nome, poi la cosa da copiare", () => {
        const t = newTunnel("menu", ALL);
        expect(badSel("parti", blocker(t, "parti", c), t)).toBe(at("name"));
        t.name = "Pranzo";
        t.source = "copia";
        expect(badSel("parti", blocker(t, "parti", c), t)).toBe(at("copy"));
        const st = newTunnel("stile", ALL);
        expect(badSel("nome", blocker(st, "nome", c), st)).toBe(at("name"));
    });

    it("le categorie, o l'import aperto", () => {
        const t = newTunnel("menu", ALL);
        expect(badSel("sezioni", blocker(t, "sezioni", c), t)).toBe(at("secs"));
        t.impOpen = true;
        expect(badSel("sezioni", blocker(t, "sezioni", c), t)).toBe(at("imp"));
    });

    it("in evidenza: il campo che manca", () => {
        const t = newTunnel("evid", ALL);
        expect(badSel("contenuto", blocker(t, "contenuto", c), t)).toBe(at("title"));
        t.title = "Pizza del giorno";
        t.cta = true;
        t.ctaText = "";
        expect(badSel("contenuto", blocker(t, "contenuto", c), t)).toBe(at("cta"));
        t.ctaText = "Prenota";
        t.ctaLink = "prenota.it";
        expect(badSel("contenuto", blocker(t, "contenuto", c), t)).toBe(at("link"));
        t.cta = false;
        t.evType = "bundle";
        expect(badSel("contenuto", blocker(t, "contenuto", c), t)).toBe(at("dishes"));
        t.dishes = ["p1"];
        expect(badSel("contenuto", blocker(t, "contenuto", c), t)).toBe(at("price"));
    });

    it("dove e quando: la domanda, le sedi, la scelta, le ore", () => {
        const t = newTunnel("menu", ALL);
        expect(blocker(t, "dove", c)).toBe(CHOOSE);
        expect(badSel("dove", CHOOSE, t)).toBe(at("ask"));
        t.onda = "on";
        t.where = { all: false, activityIds: [], groupIds: [] };
        expect(badSel("dove", blocker(t, "dove", c), t)).toBe(`[data-sbox],${at("sedi")}`);
        t.where = ALL;
        expect(badSel("quando", blocker(t, "quando", { ...c, clash: true }), t)).toBe(at("insieme"));
        t.insieme = true;
        t.qmode = "momenti";
        t.when = { days: [] };
        const why = blocker(t, "quando", c);
        expect(why).not.toBe("");
        expect(badSel("quando", why, t)).toBe(at("ore"));
    });

    it("gli altri passi: il loro pezzo, o il modulo intero", () => {
        const t = newTunnel("storia", ALL);
        expect(badSel("modifica", "Scegli almeno una cosa", t)).toBe(at("whats"));
        expect(badSel("racconto", blocker(t, "racconto", c), t)).toBe(at("title"));
        // la storia: di cosa parla, quale prodotto, quale sede, in onda o no
        expect(badSel("tema", blocker(t, "tema", c), t)).toBe(at("about"));
        expect(badSel("tema", blocker({ ...t, about: "prod" }, "tema", c), t)).toBe(at("prodlist"));
        expect(badSel("tema", blocker({ ...t, about: "loc" }, "tema", c), t)).toBe(at("sedelist"));
        expect(badSel("onda", blocker(t, "onda", c), t)).toBe(at("ask"));
        expect(badSel("controlla", "", t)).toBe("");
    });
});
