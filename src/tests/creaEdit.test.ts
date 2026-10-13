import { beforeEach, describe, expect, it, vi } from "vitest";

// Il «Riprova» in modifica (review #388, punto 2): i servizi che scrive saveSezioni, finti.
// `fail`: la chiamata `on` fallisce una volta, dopo `skip` riuscite
const { calls, fail, fake } = vi.hoisted(() => {
    const calls: unknown[][] = [];
    const fail = { on: "", skip: 0 };
    const fake =
        (name: string, out: (...a: unknown[]) => unknown = () => undefined) =>
        (...a: unknown[]) => {
            calls.push([name, ...a]);
            if (fail.on === name && fail.skip-- <= 0) {
                fail.on = "";
                return Promise.reject(new Error(name + " non riuscito"));
            }
            return Promise.resolve(out(...a));
        };
    return { calls, fail, fake };
});
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/supabase/catalogs", async orig => ({ ...(await orig<object>()), addProductToCategory: fake("addProductToCategory"), createCategory: fake("createCategory", () => ({ id: "c-new" })), updateCatalog: fake("updateCatalog") }));
vi.mock("@/services/supabase/products", async orig => ({ ...(await orig<object>()), createProduct: fake("createProduct", (_t, p) => ({ id: "p-" + (p as { name: string }).name })) }));
vi.mock("@/services/supabase/styles", async orig => ({ ...(await orig<object>()), updateStyle: fake("updateStyle") }));
vi.mock("@/services/supabase/productOptions", async orig => ({ ...(await orig<object>()), createPrimaryPriceFormat: fake("createPrimaryPriceFormat") }));
import { asEdit, asInside, rebase, blocker, changed, changedSteps, firstBlock, isDirty, lit, newTunnel, stepFrom, stepLabel, steps, strays, tunnelTitle, type Tunnel } from "@/pages/Dashboard/Crea/creaModel";
import { DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { styleConfig, styleTokens } from "@/pages/Dashboard/Crea/creaStyle";
import { saveEdit, type EditCtx } from "@/pages/Dashboard/Crea/creaEdit";
import type { Dish } from "@/pages/Dashboard/Crea/creaModel";

// Modificare una cosa già creata nel tunnel (D140): il passo 0, i passi viola e
// grigi, «Avanti» solo fra quelli scelti, si salva solo quello che è cambiato.

const ALL = { all: true, activityIds: [], groupIds: [] };
const OWNER = { owner: true, multi: true };

function menu(rule: string | null = "r1"): Tunnel {
    const t = newTunnel("menu", ALL);
    t.menuType = "classico";
    t.name = "Pranzo";
    t.sections = [{ key: "a", id: "c1", sort: 0, name: "Primi", dishes: [{ key: "b", linkId: "l1", sort: 0, productId: "p1", name: "Risotto", price: 12 }], subs: [] }];
    return asEdit(t, "m1", { id: rule, count: rule ? 1 : 0 });
}
const upd = (t: Tunnel, fn: (x: Tunnel) => void) => {
    const n = structuredClone(t);
    fn(n);
    return n;
};

describe("modifica nel tunnel: i passi", () => {
    it("il passo 0, poi solo i passi che cambiano la cosa, poi Controlla", () => {
        expect(steps(menu(), OWNER)).toEqual(["modifica", "parti", "sezioni", "dove", "controlla"]);
        expect(stepLabel(menu(), "parti")).toBe("Il nome");
        expect(tunnelTitle(menu())).toBe("Modifica il menù · Pranzo");
    });

    it("il «Dove e quando» c'è solo se nel Calendario ha una voce sola, e solo per chi lo gestisce", () => {
        expect(steps(menu(null), OWNER)).toEqual(["modifica", "parti", "sezioni", "controlla"]);
        expect(steps(menu(), { owner: false, multi: true })).toEqual(["modifica", "parti", "sezioni", "controlla"]);
        expect(steps(menu(), { owner: true, multi: false })).toContain("quando");
    });

    it("appena aperto non c'è niente da perdere e niente da salvare", () => {
        const t = menu();
        expect(isDirty(t)).toBe(false);
        expect(changedSteps(t, OWNER)).toEqual([]);
        expect(blocker(t, "modifica", OWNER)).toBe("Scegli almeno una cosa");
    });
});

describe("modifica nel tunnel: viola e grigi", () => {
    it("«Avanti» e «Indietro» si fermano solo sui passi scelti", () => {
        const t = upd(menu(), x => void x.edit!.picked.push("sezioni"));
        expect(lit(t, "sezioni")).toBe(true);
        expect(lit(t, "parti")).toBe(false);
        expect(stepFrom(t, OWNER, 0, 1)).toBe(2);
        expect(stepFrom(t, OWNER, 2, 1)).toBe(4);
        expect(stepFrom(t, OWNER, 4, -1)).toBe(2);
        expect(stepFrom(t, OWNER, 2, -1)).toBe(0);
    });

    it("un passo grigio in cui cambi qualcosa diventa viola, e Controlla chiede di guardarlo", () => {
        const t = upd(upd(menu(), x => void x.edit!.picked.push("sezioni")), x => void (x.name = "Pranzo veloce"));
        expect(changed(t, "parti")).toBe(true);
        expect(lit(t, "parti")).toBe(true);
        expect(strays(t, OWNER)).toEqual(["parti"]);
        expect(stepFrom(t, OWNER, 0, 1)).toBe(1);
        expect(isDirty(t)).toBe(true);
    });

    it("dal clic sulla riga si è già dentro: un passo alla volta finché non scegli niente", () => {
        const t = asInside(menu());
        expect(t.i).toBe(1);
        expect(stepFrom(t, OWNER, 1, 1)).toBe(2);
        expect(stepFrom(t, OWNER, 2, -1)).toBe(1);
        expect(lit(upd(t, x => void (x.name = "Altro")), "parti")).toBe(true);
        expect(stepFrom(upd(t, x => void x.edit!.picked.push("sezioni")), OWNER, 0, 1)).toBe(2);
    });

    it("rimettere com'era non conta come modifica", () => {
        const t = upd(upd(menu(), x => void (x.name = "Altro")), x => void (x.name = "Pranzo "));
        expect(changed(t, "parti")).toBe(false);
    });

    it("togliere un piatto o aggiungerne uno cambia «Sezioni e piatti»", () => {
        expect(changed(upd(menu(), x => void x.sections[0].dishes.pop()), "sezioni")).toBe(true);
        expect(changed(upd(menu(), x => void x.sections[0].dishes.push({ key: "n", productId: "p2", name: "Lasagne", price: 10 })), "sezioni")).toBe(true);
    });

    it("rinominare, riordinare o mettere una categoria dentro un'altra cambia «Categorie e piatti»", () => {
        const two = upd(menu(), x => {
            x.sections.push({ key: "c", id: "c2", sort: 10, name: "Dolci", dishes: [], subs: [] });
            x.edit!.orig.sections = structuredClone(x.sections);
        });
        expect(changed(two, "sezioni")).toBe(false);
        expect(changed(upd(two, x => void (x.sections[1].name = "Dessert")), "sezioni")).toBe(true);
        expect(changed(upd(two, x => void x.sections.reverse()), "sezioni")).toBe(true);
        expect(changed(upd(two, x => void x.sections[0].subs.push(x.sections.pop()!)), "sezioni")).toBe(true);
    });

    it("ferma il salvataggio solo quello che manca in un passo cambiato", () => {
        // un menù senza piatti si può rinominare: le sezioni non le ha toccate
        const empty = upd(menu(), x => void (x.edit!.orig.sections = x.sections = []));
        expect(firstBlock(upd(empty, x => void (x.name = "Cena")), OWNER)).toBeNull();
        expect(firstBlock(upd(menu(), x => void (x.name = " ")), OWNER)).toEqual({ i: 1, why: "Manca il nome del menù" });
    });
});

describe("modifica nel tunnel: quello che il Salva non potrebbe scrivere (review #388)", () => {
    it("lo stesso piatto due volte nello stesso ramo ferma il passo, con i nomi", () => {
        const twice = upd(menu(), x => void x.sections[0].dishes.push({ key: "n", productId: "p1", name: "Risotto", price: 12 }));
        expect(blocker(twice, "sezioni", OWNER)).toBe("«Risotto» è due volte in «Primi»: toglilo una volta");
        const below = upd(menu(), x => void x.sections[0].subs.push({ key: "s", name: "Di mare", dishes: [{ key: "n", productId: "p1", name: "Risotto", price: 12 }], subs: [] }));
        expect(blocker(below, "sezioni", OWNER)).toBe("«Risotto» è sia in «Primi» sia in «Di mare», che le sta dentro: toglilo da una delle due");
        const apart = upd(menu(), x => void x.sections.push({ key: "s", name: "Di mare", dishes: [{ key: "n", productId: "p1", name: "Risotto", price: 12 }], subs: [] }));
        expect(blocker(apart, "sezioni", OWNER)).toBe("");
    });
    it("una variante lasciata a metà ferma il passo invece di sparire salvando", () => {
        const t = upd(menu(), x => void x.sections[0].dishes.push({ key: "n", productId: null, name: "Pizza", price: null, formats: [{ name: "Intera", price: 9 }, { name: "", price: 5 }] }));
        expect(blocker(t, "sezioni", OWNER)).toBe("«Pizza»: una variante è senza nome o senza prezzo");
    });
    it("dopo un salvataggio fermo a metà il confronto riparte da quello che c'è nel database", () => {
        // il nome era già scritto, la categoria nuova anche, il suo piatto no
        const draft = upd(menu(), x => {
            x.name = "Cena";
            x.sections.push({ key: "c", name: "Dolci", dishes: [{ key: "d", productId: "p9", name: "Tiramisù", price: 6 }], subs: [] });
        });
        const db = upd(menu(), x => {
            x.name = "Cena";
            x.sections.push({ key: "zz", id: "c2", sort: 10, name: "Dolci", dishes: [], subs: [] });
            x.edit!.orig = { ...structuredClone(x), edit: null };
        });
        const again = rebase(draft, db);
        expect(changed(again, "nome")).toBe(false);
        expect(changed(again, "sezioni")).toBe(true);
        expect(again.sections[1]).toMatchObject({ id: "c2", sort: 10 });
        expect(again.sections[1].dishes[0].linkId).toBeUndefined();
        expect(draft.sections[1].id).toBeUndefined();
    });
});

describe("modifica nel tunnel: lo stile", () => {
    it("le scelte non toccate lasciano i token com'erano; solo l'aspetto cambiato si salva", () => {
        const base = structuredClone(DEFAULT_STYLE_TOKENS);
        base.card.productStyle = "compact";
        base.card.image.mode = "hide";
        const t = asEdit({ ...newTunnel("stile", ALL), name: "Sera", look: structuredClone(base) }, "st1", { id: null, count: 0 });
        expect(styleTokens(t)).toEqual(base);
        expect(changed(t, "aspetto")).toBe(false);
        t.look.appearance.borderRadius = base.appearance.borderRadius === "none" ? "soft" : "none";
        expect(changed(t, "aspetto")).toBe(true);
        expect(changed(t, "nome")).toBe(false);
    });

    const sera = () => asEdit({ ...newTunnel("stile", ALL), name: "Sera", look: structuredClone(DEFAULT_STYLE_TOKENS) }, "st1", { id: null, count: 0 });
    const saved = async (t: Tunnel) => {
        calls.length = 0;
        await saveEdit(t, { tenantId: "T", L: {}, names: {}, blockFiles: {}, done: new Map() } as unknown as EditCtx);
        return calls.filter(c => c[0] === "updateStyle");
    };

    it("il solo nome cambia il nome e non fa una versione nuova (review #443)", async () => {
        const up = await saved(upd(sera(), x => void (x.name = "Sera d'estate")));
        expect(up).toHaveLength(1);
        expect(up[0].slice(1, 4)).toEqual(["st1", "Sera d'estate", undefined]);
    });

    it("«Torna a questa» e poi Salva: la versione di prima diventa una versione nuova, il nome resta (review #443)", async () => {
        const before = structuredClone(DEFAULT_STYLE_TOKENS);
        before.appearance.borderRadius = DEFAULT_STYLE_TOKENS.appearance.borderRadius === "none" ? "soft" : "none";
        // quello che fa il bottone in StileAspetto: l'aspetto della versione prende il posto di quello di adesso
        const t = upd(sera(), x => void (x.look = structuredClone(before)));
        const up = await saved(t);
        expect(up).toHaveLength(1);
        expect(up[0][1]).toBe("st1");
        expect(up[0][2]).toBeUndefined();
        expect(up[0][3]).toEqual(styleConfig(t));
        expect(styleTokens(t).appearance.borderRadius).toBe(before.appearance.borderRadius);
    });
});

describe("modifica nel tunnel: «Riprova» dopo un piatto nuovo fermo a metà (review #388.2)", () => {
    beforeEach(() => {
        calls.length = 0;
        Object.assign(fail, { on: "", skip: 0 });
    });
    const withDish = (d: Dish) => upd(menu(), x => void x.sections[0].dishes.push(d));
    const ctx = (done: Map<string, unknown>) => ({ tenantId: "T", L: {}, names: {}, blockFiles: {}, done }) as unknown as EditCtx;
    const made = () => calls.filter(c => c[0] === "createProduct").length;

    it("il collegamento non riesce: «Riprova» collega il prodotto già nato, non ne crea un secondo", async () => {
        const t = withDish({ key: "n", productId: null, name: "Carbonara", price: 11 });
        const done = new Map<string, unknown>();
        fail.on = "addProductToCategory";
        await expect(saveEdit(t, ctx(done))).rejects.toThrow();
        await saveEdit(t, ctx(done));
        expect(made()).toBe(1);
        const links = calls.filter(c => c[0] === "addProductToCategory");
        expect(links).toHaveLength(2);
        expect(links[1][4]).toBe(links[0][4]);
    });

    it("un formato non riesce: «Riprova» rifà solo quel formato, sullo stesso prodotto", async () => {
        const t = withDish({ key: "n", productId: null, name: "Pizza", price: null, formats: [{ name: "Piccola", price: 7 }, { name: "Grande", price: 10 }] });
        const done = new Map<string, unknown>();
        Object.assign(fail, { on: "createPrimaryPriceFormat", skip: 1 });
        await expect(saveEdit(t, ctx(done))).rejects.toThrow();
        await saveEdit(t, ctx(done));
        expect(made()).toBe(1);
        const formats = calls.filter(c => c[0] === "createPrimaryPriceFormat");
        expect(formats.map(c => c[3])).toEqual(["Piccola", "Grande", "Grande"]);
        expect(new Set(formats.map(c => c[1])).size).toBe(1);
        expect(calls.filter(c => c[0] === "addProductToCategory")).toHaveLength(1);
    });

    it("due piatti nuovi, il secondo collegamento non riesce: «Riprova» non ricollega il primo", async () => {
        const t = upd(menu(), x => void x.sections[0].dishes.push({ key: "n1", productId: null, name: "Carbonara", price: 11 }, { key: "n2", productId: null, name: "Gricia", price: 10 }));
        const done = new Map<string, unknown>();
        Object.assign(fail, { on: "addProductToCategory", skip: 1 });
        await expect(saveEdit(t, ctx(done))).rejects.toThrow();
        await saveEdit(t, ctx(done));
        expect(calls.filter(c => c[0] === "addProductToCategory").map(c => c[4])).toEqual(["p-Carbonara", "p-Gricia", "p-Gricia"]);
    });

    it("categoria nuova con un piatto che non riesce: «Riprova» non crea una seconda categoria", async () => {
        const t = upd(menu(), x => void x.sections.push({ key: "s2", name: "Secondi", dishes: [{ key: "n", productId: null, name: "Saltimbocca", price: 15 }], subs: [] }));
        const done = new Map<string, unknown>();
        fail.on = "addProductToCategory";
        await expect(saveEdit(t, ctx(done))).rejects.toThrow();
        await saveEdit(t, ctx(done));
        expect(calls.filter(c => c[0] === "createCategory")).toHaveLength(1);
        const links = calls.filter(c => c[0] === "addProductToCategory");
        expect(links.map(c => c[3])).toEqual(["c-new", "c-new"]);
    });
});
