// La storia senza «Dove» e «Quando» (D191): sta col prodotto o con la sede di cui parla.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));
import { CHOOSE, aboutPlace, aboutShort, asEdit, blocker, changed, firstBlock, newTunnel, qcardText, sentence, stepSummary, steps, type Ctx, type Tunnel } from "@/pages/Dashboard/Crea/creaModel";
import type { DraftLookups, PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";

const ALL = { all: true, activityIds: [], groupIds: [] };
const MULTI: Ctx = { owner: true, multi: true };
const ONE: Ctx = { owner: true, multi: false };
const carbonara: PickProduct = { id: "p1", name: "Carbonara", category: null, listPrice: 12, formats: [] };
const look = (multi: boolean): DraftLookups => ({
    products: new Map([["p1", carbonara]]),
    catalogs: new Map(),
    styles: new Map(),
    featured: new Map(),
    sedi: new Map([["porto", "Porto"], ["lido", "Lido"]]),
    groups: new Map(),
    multi
});
const L = look(true), L1 = look(false);
const st = (over: Partial<Tunnel> = {}): Tunnel => ({ ...newTunnel("storia", ALL), title: "Il riso", ...over });

describe("la storia: di cosa parla", () => {
    it("ferma «Avanti» finché non c'è la cosa: il tipo, poi il prodotto o la sede", () => {
        expect(blocker(st(), "tema", MULTI)).toBe("Scegli di cosa parla");
        expect(blocker(st({ about: "prod" }), "tema", MULTI)).toBe("Scegli il prodotto");
        expect(blocker(st({ about: "prod", linked: "p1" }), "tema", MULTI)).toBe("");
        expect(blocker(st({ about: "loc" }), "tema", MULTI)).toBe("Scegli la sede");
        expect(blocker(st({ about: "loc", sede: "porto" }), "tema", MULTI)).toBe("");
        // con una sede sola il locale è quello
        expect(blocker(st({ about: "loc" }), "tema", ONE)).toBe("");
    });

    it("in breve e dove si vede", () => {
        expect(aboutShort(st(), L)).toBe("Da scegliere");
        expect(aboutShort(st({ about: "prod" }), L)).toBe("Un prodotto, da scegliere");
        expect(aboutShort(st({ about: "prod", linked: "p1" }), L)).toBe("Il prodotto «Carbonara»");
        expect(aboutShort(st({ about: "loc" }), L)).toBe("Il locale, sede da scegliere");
        expect(aboutShort(st({ about: "loc", sede: "lido" }), L)).toBe("Il locale · Lido");
        expect(aboutShort(st({ about: "loc" }), L1)).toBe("Il locale");
        expect(aboutPlace(st(), L)).toBe("sotto il menù");
        expect(aboutPlace(st({ about: "prod", linked: "p1" }), L)).toBe("in fondo alla scheda di «Carbonara»");
        expect(aboutPlace(st({ about: "prod" }), L)).toBe("in fondo alla scheda di «…»");
        expect(aboutPlace(st({ about: "loc", sede: "lido" }), L)).toBe("nella pagina del locale di «Lido»");
        expect(aboutPlace(st({ about: "loc" }), L1)).toBe("nella pagina del locale");
        expect(stepSummary(st({ about: "loc", sede: "lido" }), "tema", L, () => "")).toBe("Il locale · Lido");
        expect(qcardText(st({ about: "prod", linked: "p1" }), "tema", L, null)).toEqual(["Carbonara", "In fondo alla sua scheda, quando il cliente lo apre."]);
        expect(qcardText(st({ about: "loc", sede: "lido" }), "tema", L, null)).toEqual(["La pagina del locale", "Lido: sotto il menù, nelle storie."]);
    });
});

describe("la storia: in onda?", () => {
    it("niente «Dove» e «Quando»: un passo solo, che chiede la scelta", () => {
        expect(steps(st(), MULTI)).not.toContain("dove");
        expect(steps(st(), MULTI)).not.toContain("quando");
        expect(blocker(st(), "onda", MULTI)).toBe(CHOOSE);
        expect(blocker(st({ onda: "off" }), "onda", MULTI)).toBe("");
        expect(blocker(st({ onda: "on" }), "onda", MULTI)).toBe("");
        // chi non gestisce il Calendario tiene sempre pronto: il passo non c'è
        expect(steps(st(), { owner: false, multi: true })).toEqual(["serve", "tema", "racconto", "blocchi", "controlla"]);
    });

    it("il riassunto e la frase di «Controlla»", () => {
        const prod = st({ about: "prod", linked: "p1", onda: "on" }), loc = st({ about: "loc", sede: "lido", onda: "on" });
        expect(stepSummary(prod, "onda", L, () => "")).toBe("Sì, si vede in fondo alla scheda di «Carbonara»");
        expect(stepSummary(st({ onda: "off" }), "onda", L, () => "")).toBe("No, per ora la tengo pronta");
        expect(stepSummary(st(), "onda", L, () => "")).toBe("Da scegliere");
        expect(sentence(prod, L)).toBe("Dove e quando «Carbonara» è nel menù: la storia «Il riso» compare in fondo alla scheda di «Carbonara».");
        expect(sentence(loc, L)).toBe("Sempre, solo per Lido: la storia «Il riso» compare nella pagina del locale di «Lido».");
        expect(sentence(st({ about: "loc", onda: "on" }), L1)).toBe("Sempre: la storia «Il riso» compare nella pagina del locale.");
        expect(sentence(st({ about: "loc", onda: "off" }), L)).toBe("La storia «Il riso» è pronta ma spenta: nessun cliente la vede finché non la metti in onda.");
        expect(qcardText(prod, "onda", L, null)).toEqual(["In onda", "Si vede in fondo alla scheda di «Carbonara»."]);
    });

    it("il primo passo che manca, da «Controlla»", () => {
        expect(firstBlock(st(), MULTI)).toEqual({ i: 1, why: "Scegli di cosa parla" });
        expect(firstBlock(st({ about: "prod", linked: "p1" }), MULTI)).toEqual({ i: 4, why: CHOOSE });
        expect(firstBlock(st({ about: "prod", linked: "p1", onda: "on" }), MULTI)).toBeNull();
    });
});

describe("la storia: modificarla", () => {
    const edit = (over: Partial<Tunnel>, live = true) => asEdit(st(over), "s1", { id: null, count: 0, live });

    it("i passi: di cosa parla, il racconto, i blocchi, in onda", () => {
        expect(steps(edit({ about: "loc" }), MULTI)).toEqual(["modifica", "tema", "racconto", "blocchi", "onda", "controlla"]);
    });

    it("una storia di tutte le sedi resta com'è finché non la si tocca", () => {
        const t = edit({ about: "loc", sede: "" });
        expect(blocker(t, "tema", MULTI)).toBe("");
        expect(changed(t, "tema")).toBe(false);
        // toccata, chiede la cosa nuova per intero
        expect(blocker({ ...t, about: "prod" }, "tema", MULTI)).toBe("Scegli il prodotto");
        expect(changed({ ...t, about: "prod", linked: "p1" }, "tema")).toBe(true);
    });

    it("cambiare il prodotto è cambiare «Di cosa parla», non «Il racconto»", () => {
        const t = { ...edit({ about: "prod", linked: "p1" }), linked: "p2" };
        expect(changed(t, "tema")).toBe(true);
        expect(changed(t, "racconto")).toBe(false);
        expect(changed({ ...t, linked: "p1", onda: "off" as const }, "onda")).toBe(true);
    });
});
