import { beforeEach, describe, expect, it, vi } from "vitest";

// Il «Riprova» in modifica (review #388, punto 2): i servizi che scrive saveSezioni, finti.
// `fail`: la chiamata `on` fallisce una volta, dopo `skip` riuscite
const { calls, fail, fake, cal } = vi.hoisted(() => {
    const calls: unknown[][] = [];
    // le voci del Calendario della cosa (anche spente): `shared` = la regola ha altri contenuti
    const cal = { entries: [{ ruleId: "r1", rule: { featured_contents: [] as unknown[] } }] };
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
    return { calls, fail, fake, cal };
});
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/supabase/catalogs", async orig => ({ ...(await orig<object>()), addProductToCategory: fake("addProductToCategory"), createCategory: fake("createCategory", () => ({ id: "c-new" })), updateCatalog: fake("updateCatalog") }));
vi.mock("@/services/supabase/products", async orig => ({ ...(await orig<object>()), createProduct: fake("createProduct", (_t, p) => ({ id: "p-" + (p as { name: string }).name })) }));
vi.mock("@/services/supabase/styles", async orig => ({ ...(await orig<object>()), updateStyle: fake("updateStyle") }));
vi.mock("@/services/supabase/productOptions", async orig => ({ ...(await orig<object>()), createPrimaryPriceFormat: fake("createPrimaryPriceFormat") }));
// la regola del Calendario di saveQuando: una voce sola, «r1»
vi.mock("@/services/supabase/layoutScheduling", async orig => ({ ...(await orig<object>()), listLayoutRules: fake("listLayoutRules", () => []), updateScheduleEnabled: fake("updateScheduleEnabled") }));
vi.mock("@/pages/Dashboard/Crea/creaLoad", async orig => ({ ...(await orig<object>()), allEntriesOf: () => cal.entries }));
vi.mock("@/services/supabase/featuredScheduling", async orig => ({ ...(await orig<object>()), createFeaturedRuleDraft: fake("createFeaturedRuleDraft", () => "r-new"), updateFeaturedRule: fake("updateFeaturedRule") }));
vi.mock("@/services/supabase/stories", async orig => ({ ...(await orig<object>()), updateStory: fake("updateStory") }));
vi.mock("@/pages/Dashboard/Programming/calendar/calendarDraft", async orig => ({ ...(await orig<object>()), draftFromEntry: () => ({ when: {}, where: { all: true, activityIds: [], groupIds: [] }, per: null }) }));
vi.mock("@/pages/Dashboard/Programming/calendar/calendarSave", async orig => ({ ...(await orig<object>()), saveDraft: fake("saveDraft"), dropDraft: fake("dropDraft") }));
vi.mock("@/services/supabase/featuredContents", async orig => ({
    ...(await orig<object>()),
    updateFeaturedContent: fake("updateFeaturedContent"),
    listFeaturedContentProducts: fake("listFeaturedContentProducts", () => []),
    syncFeaturedContentProducts: fake("syncFeaturedContentProducts"),
    updateFeaturedContentProductNote: fake("updateFeaturedContentProductNote"),
    updateFeaturedContentProductsSortOrder: fake("updateFeaturedContentProductsSortOrder")
}));
import { asEdit, asInside, asMetti, offLater, ondaChange, sentence, rebase, blocker, changed, changedSteps, firstBlock, isDirty, lit, newTunnel, stepFrom, stepLabel, steps, strays, tunnelTitle, type Tunnel } from "@/pages/Dashboard/Crea/creaModel";
import type { DraftLookups } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
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
    t.name = "Pranzo";
    t.sections = [{ key: "a", id: "c1", sort: 0, name: "Primi", dishes: [{ key: "b", linkId: "l1", sort: 0, productId: "p1", name: "Risotto", price: 12 }], subs: [] }];
    return asEdit(t, "m1", { id: rule, count: rule ? 1 : 0, live: !!rule });
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

    it("il «Dove e quando» c'è con una voce sola o nessuna (lo si mette in onda), e solo per chi gestisce il Calendario", () => {
        // D189: senza voce si può metterlo in onda dal tunnel
        expect(steps(menu(null), OWNER)).toEqual(["modifica", "parti", "sezioni", "dove", "controlla"]);
        expect(steps({ ...menu(), edit: { ...menu().edit!, rules: 2 } }, OWNER)).toEqual(["modifica", "parti", "sezioni", "controlla"]);
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

describe("modifica nel tunnel: in onda o pronto (D189)", () => {
    const L = { multi: true, activities: new Map(), groups: new Map() } as unknown as DraftLookups;

    it("la scelta parte da com'è adesso", () => {
        expect(menu().onda).toBe("on");
        expect(menu(null).onda).toBe("off");
        expect(blocker(menu(null), "dove", OWNER)).toBe("");
    });

    it("cambiare idea è cambiare il «Dove e quando»; spento, sedi e orari non contano", () => {
        expect(changed(upd(menu(), x => void (x.onda = "off")), "dove")).toBe(true);
        const off = upd(menu(null), x => void (x.where = { all: false, activityIds: ["a"], groupIds: [] }));
        expect(changed(off, "dove")).toBe(false);
        expect(changed(upd(menu(null), x => void (x.onda = "on")), "dove")).toBe(true);
    });

    it("spegnerlo: la frase dice che esce da tutte le sedi, «Le tue modifiche» com'era e com'è", () => {
        const t = upd(menu(), x => void (x.onda = "off"));
        expect(sentence(t, L)).toBe("Il menù «Pranzo» esce da tutte le sedi: da quando salvi nessun cliente lo vede.");
        expect(ondaChange(t, "dove", L)).toEqual(["Prima: in onda, Tutte le sedi · Sempre, tutto il giorno", "Adesso: no, per ora lo tengo pronto"]);
        expect(ondaChange(upd(menu(null), x => void (x.onda = "on")), "dove", L)[0]).toBe("Prima: non in onda");
    });

    it("lo stile in onda non si spegne: la sua voce è quella del menù", () => {
        const st = asEdit({ ...newTunnel("stile", ALL), name: "Sera" }, "st1", { id: "r1", count: 1, live: true });
        expect(offLater(st)).toBe(true);
        expect(offLater(menu())).toBe(false);
        expect(offLater(asEdit({ ...newTunnel("stile", ALL), name: "Sera" }, "st1", { id: null, count: 0, live: false }))).toBe(false);
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
        const t = asEdit({ ...newTunnel("stile", ALL), name: "Sera", look: structuredClone(base) }, "st1", { id: null, count: 0, live: false });
        expect(styleTokens(t)).toEqual(base);
        expect(changed(t, "aspetto")).toBe(false);
        t.look.appearance.borderRadius = base.appearance.borderRadius === "none" ? "soft" : "none";
        expect(changed(t, "aspetto")).toBe(true);
        expect(changed(t, "nome")).toBe(false);
    });

    const sera = () => asEdit({ ...newTunnel("stile", ALL), name: "Sera", look: structuredClone(DEFAULT_STYLE_TOKENS) }, "st1", { id: null, count: 0, live: false });
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

describe("modifica nel tunnel: i piatti del contenuto in evidenza (D187)", () => {
    function evid(evType: Tunnel["evType"], fn: (x: Tunnel) => void = () => {}): Tunnel {
        const t = { ...newTunnel("evid", ALL), title: "Pranzo veloce" };
        t.evType = evType;
        fn(t);
        return asEdit(t, "e1", { id: "r1", count: 1, live: true });
    }
    const promo = () => evid("promo", x => void ((x.dishes = ["p1", "p2"]), (x.notes = { p1: "-20%" })));
    const bundle = () => evid("bundle", x => void ((x.dishes = ["p1", "p2"]), (x.bundle = "24,50")));

    it("cambiare piatti, note o prezzo unico è cambiare «Il contenuto», e Controlla lo mostra", () => {
        expect(changed(upd(promo(), x => void x.dishes.pop()), "contenuto")).toBe(true);
        expect(changed(upd(promo(), x => void (x.notes.p1 = "-30%")), "contenuto")).toBe(true);
        expect(changed(upd(bundle(), x => void (x.bundle = "22")), "contenuto")).toBe(true);
        expect(changed(upd(bundle(), x => void (x.showOrig = false)), "contenuto")).toBe(true);
        expect(changed(upd(evid("annuncio"), x => void ((x.evType = "promo"), (x.dishes = ["p1"]))), "contenuto")).toBe(true);
        const t = upd(upd(promo(), x => void x.edit!.picked.push("dove")), x => void (x.notes.p2 = "nuovo"));
        expect(changedSteps(t, OWNER)).toEqual(["contenuto"]);
        expect(strays(t, OWNER)).toEqual(["contenuto"]);
        expect(isDirty(t)).toBe(true);
    });

    it("cambiare il tipo tiene l'aspetto che c'era: il salvataggio non tocca layout_style (review #444)", async () => {
        const t = upd(evid("annuncio"), x => void ((x.evType = "promo"), (x.dishes = ["p1"])));
        calls.length = 0;
        await saveEdit(t, { tenantId: "T", L: {}, names: {}, blockFiles: {}, done: new Map() } as unknown as EditCtx);
        const type = calls.find(c => c[0] === "updateFeaturedContent" && "content_type" in (c[3] as object));
        expect(type?.[3]).toMatchObject({ content_type: "promo" });
        expect(type?.[3]).not.toHaveProperty("layout_style");
    });

    it("toccati solo i piatti, scattano i controlli del contenuto", () => {
        expect(firstBlock(upd(bundle(), x => void (x.bundle = "")), OWNER)).toEqual({ i: 1, why: "Manca il prezzo unico" });
        expect(firstBlock(upd(promo(), x => void (x.dishes = [])), OWNER)).toEqual({ i: 1, why: "Aggiungi almeno un piatto" });
        expect(firstBlock(upd(promo(), x => void (x.notes.p1 = "")), OWNER)).toBeNull();
    });
});

describe("modifica nel tunnel: «Riprova» dopo un piatto nuovo fermo a metà (review #388.2)", () => {
    beforeEach(() => {
        calls.length = 0;
        Object.assign(fail, { on: "", skip: 0 });
    });
    const withDish = (d: Dish) => upd(menu(), x => void x.sections[0].dishes.push(d));
    const ctx = (done: Map<string, unknown>) => ({ tenantId: "T", L: {}, names: {}, blockFiles: {}, done, owner: true }) as unknown as EditCtx;
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

describe("modifica nel tunnel: il menù, le ore per sede e l'import aperto", () => {
    beforeEach(() => {
        calls.length = 0;
        Object.assign(fail, { on: "", skip: 0 });
    });
    const ctx = () => ({ tenantId: "T", L: {}, names: {}, blockFiles: {}, done: new Map(), owner: true }) as unknown as EditCtx;

    it("salvando il «Dove e quando», le ore diverse per sede scelte nel tunnel arrivano al Calendario", async () => {
        const per = { s1: { days: [1, 2] }, s2: { days: [6, 0] } } as unknown as Tunnel["per"];
        const t = upd(menu(), x => {
            x.where = { all: false, activityIds: ["s1", "s2"], groupIds: [] };
            x.per = structuredClone(per);
        });
        await saveEdit(t, ctx());
        const saved = calls.filter(c => c[0] === "saveDraft");
        expect(saved).toHaveLength(1);
        expect((saved[0][1] as { per: unknown }).per).toEqual(per);
    });

    it("con un import da foto ancora aperto, «Avanti» e il salvataggio si fermano anche se non è cambiato altro", () => {
        const t = upd(menu(), x => void (x.impOpen = true));
        expect(changed(t, "sezioni")).toBe(false);
        expect(firstBlock(t, OWNER)).toEqual({ i: 2, why: "Hai un import aperto: aggiungi i piatti o butta via l'import" });
        expect(firstBlock(menu(), OWNER)).toBeNull();
    });
});

describe("modifica nel tunnel: salvare «in onda» o «pronto» (D189)", () => {
    beforeEach(() => {
        calls.length = 0;
        Object.assign(fail, { on: "", skip: 0 });
        cal.entries = [{ ruleId: "r1", rule: { featured_contents: [] } }];
    });
    const ctx = (owner = true) => ({ tenantId: "T", L: { multi: true }, names: {}, blockFiles: {}, done: new Map(), owner, pair: "sty" }) as unknown as EditCtx;
    const names = () => calls.map(c => c[0]);
    const evid = (rule: string | null, live: boolean) => asEdit({ ...newTunnel("evid", ALL), name: "Aperitivo" }, "e1", { id: rule, count: rule ? 1 : 0, live });
    const storia = (live: boolean) => asEdit({ ...newTunnel("storia", ALL), name: "Il forno" }, "s1", { id: null, count: 0, live });

    it("spegnere un menù in onda: la sua voce si spegne e resta nel Calendario, niente si cancella", async () => {
        await saveEdit(upd(menu(), x => void (x.onda = "off")), ctx());
        expect(calls.find(c => c[0] === "updateScheduleEnabled")).toEqual(["updateScheduleEnabled", "r1", false]);
        expect(names()).not.toContain("saveDraft");
        expect(names()).not.toContain("dropDraft");
    });

    it("rimettere in onda un menù con la voce spenta: si riscrive quella voce (che si riaccende)", async () => {
        const t = upd(menu(), x => void (x.onda = "on"));
        t.edit!.orig.onda = "off";
        const saved = await saveEdit(t, ctx());
        expect(names().filter(n => n === "saveDraft")).toHaveLength(1);
        expect(names()).not.toContain("updateScheduleEnabled");
        expect(saved.live).toBe(true);
    });

    it("mettere in onda un menù senza voce: ne nasce una, col suo stile", async () => {
        cal.entries = [];
        await saveEdit(upd(menu(null), x => void (x.onda = "on")), ctx());
        const d = calls.find(c => c[0] === "saveDraft")!;
        expect((d[1] as { thing: string }).thing).toBe("m1");
        expect((d[1] as { mode: string; rule: unknown }).mode).toBe("add");
        expect((d[1] as { rule: unknown }).rule ?? null).toBeNull();
    });

    it("in evidenza spento in una regola tutta sua: si spegne quella regola", async () => {
        cal.entries = [{ ruleId: "r1", rule: { featured_contents: [{}] } }];
        await saveEdit(upd(evid("r1", true), x => void (x.onda = "off")), ctx());
        expect(calls.find(c => c[0] === "updateScheduleEnabled")).toEqual(["updateScheduleEnabled", "r1", false]);
    });

    it("in evidenza spento in una regola con altri contenuti: ne fa una sua spenta ed esce dall'altra", async () => {
        cal.entries = [{ ruleId: "r1", rule: { featured_contents: [{}, {}] } }];
        await saveEdit(upd(evid("r1", true), x => void (x.onda = "off")), ctx());
        const rule = calls.find(c => c[0] === "updateFeaturedRule")![1] as { enabled: boolean; featuredContents: { featured_content_id: string }[] };
        expect(rule.enabled).toBe(false);
        expect(rule.featuredContents[0].featured_content_id).toBe("e1");
        expect(names()).toContain("dropDraft");
        expect(names()).not.toContain("updateScheduleEnabled");
    });

    it("in evidenza pronto messo in onda senza regola: torna pubblicato e la regola nasce accesa", async () => {
        cal.entries = [];
        await saveEdit(upd(evid(null, false), x => void (x.onda = "on")), ctx());
        expect(calls.find(c => c[0] === "updateFeaturedContent")?.[3]).toEqual({ status: "published" });
        expect((calls.find(c => c[0] === "updateFeaturedRule")![1] as { enabled: boolean }).enabled).toBe(true);
    });

    it("la storia: spenta torna bozza, rimessa in onda torna pubblicata", async () => {
        await saveEdit(upd(storia(true), x => void (x.onda = "off")), ctx());
        expect((calls.find(c => c[0] === "updateStory")![3] as { status: string }).status).toBe("draft");
        calls.length = 0;
        await saveEdit(upd(storia(false), x => void (x.onda = "on")), ctx());
        expect((calls.find(c => c[0] === "updateStory")![3] as { status: string }).status).toBe("published");
    });

    it("chi non gestisce il Calendario non cambia la messa in onda", async () => {
        await saveEdit(upd(menu(), x => void (x.onda = "off")), ctx(false));
        expect(names()).not.toContain("updateScheduleEnabled");
        expect(names()).not.toContain("saveDraft");
    });
});

describe("«Metti in onda» dall'elenco (D189)", () => {
    const pronto = (rules = 0) => asEdit({ ...newTunnel("evid", ALL), name: "Aperitivo" }, "e1", { id: rules === 1 ? "r1" : null, count: rules, live: false });

    it("apre la modifica sul «Dove e quando», scelto e con «Sì» acceso", () => {
        const t = asMetti(pronto(), OWNER);
        expect(steps(t, OWNER)[t.i]).toBe("dove");
        expect(t.onda).toBe("on");
        expect(t.edit!.picked).toEqual(["dove"]);
        expect(changed(t, "dove")).toBe(true);
    });

    it("con una sede sola il passo è «Quando»", () => {
        const one = { owner: true, multi: false }, t = asMetti(pronto(), one);
        expect(steps(t, one)[t.i]).toBe("quando");
    });

    it("senza il passo (chi non gestisce il Calendario, o più voci) resta la modifica di sempre", () => {
        expect(asMetti(pronto(), { owner: false, multi: true })).toEqual(pronto());
        expect(asMetti(pronto(2), OWNER)).toEqual(pronto(2));
    });
});
