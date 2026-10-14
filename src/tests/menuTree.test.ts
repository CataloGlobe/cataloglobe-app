import { describe, expect, it, vi, beforeEach } from "vitest";

const { calls, log, seq } = vi.hoisted(() => {
    const calls: unknown[][] = [];
    const seq = { n: 0 };
    const log =
        (name: string, out: () => unknown = () => undefined) =>
        (...a: unknown[]) => {
            calls.push([name, ...a]);
            return Promise.resolve(out());
        };
    return { calls, log, seq };
});
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/supabase/catalogs", () => ({
    createCatalog: log("createCatalog", () => ({ id: "cat" })),
    createCategory: log("createCategory", () => ({ id: "n" + ++seq.n })),
    updateCategory: log("updateCategory"),
    deleteCategory: log("deleteCategory"),
    addProductToCategory: log("addProductToCategory"),
    removeProductFromCategory: log("removeProductFromCategory"),
    updateProductSortOrder: log("updateProductSortOrder"),
    updateCatalog: log("updateCatalog")
}));
vi.mock("@/services/supabase/products", () => ({ createProduct: log("createProduct", () => ({ id: "p" + ++seq.n })) }));
vi.mock("@/services/supabase/productOptions", () => ({ createPrimaryPriceFormat: log("createPrimaryPriceFormat") }));

import type { Dish, Section } from "@/pages/Dashboard/Crea/creaModel";
import { places, saveSezioni, writeSections } from "@/pages/Dashboard/Crea/menuSave";
import { adopt, badFormat, cats, clash, dropDish, dropSec, ensure, findSec, height, moveOut, total } from "@/pages/Dashboard/Crea/menuTree";

// L'albero del menù nel tunnel (D177): categorie dentro categorie, e il
// salvataggio che scrive solo quello che è cambiato.

const D = (k: string, extra: Partial<Dish> = {}): Dish => ({ key: k, productId: "p-" + k, name: k, price: 5, ...extra });
const S = (k: string, dishes: Dish[] = [], subs: Section[] = [], extra: Partial<Section> = {}): Section => ({ key: k, name: k, dishes, subs, ...extra });
const names = (l: Section[]): unknown => l.map(x => (x.subs.length ? [x.name, names(x.subs)] : x.name));

describe("l'albero del menù", () => {
    const tree = () => [S("Antipasti", [D("a")]), S("Primi", [], [S("Terra", [D("b"), D("c")]), S("Mare", [D("d")])]), S("Dolci")];

    it("conta piatti e categorie dentro, e i livelli che occupa", () => {
        const [, primi] = tree();
        expect([total(primi), cats(primi), height(primi)]).toEqual([3, 2, 2]);
    });

    it("una categoria si lascia prima, dopo, dentro un'altra o in fondo al menù", () => {
        const t = tree();
        dropSec(t, "Dolci", { type: "sec", key: "Primi", zone: "inside" });
        expect(names(t)).toEqual(["Antipasti", ["Primi", ["Terra", "Mare", "Dolci"]]]);
        dropSec(t, "Dolci", { type: "sec", key: "Antipasti", zone: "before" });
        expect(names(t)).toEqual(["Dolci", "Antipasti", ["Primi", ["Terra", "Mare"]]]);
        dropSec(t, "Terra", { type: "end" });
        expect(names(t)).toEqual(["Dolci", "Antipasti", ["Primi", ["Mare"]], "Terra"]);
    });

    it("«Porta fuori» la mette subito dopo la categoria che la conteneva", () => {
        const t = tree();
        moveOut(t, "Terra");
        expect(names(t)).toEqual(["Antipasti", ["Primi", ["Mare"]], "Terra", "Dolci"]);
    });

    it("un piatto si lascia su un altro piatto o su una categoria", () => {
        const t = tree();
        dropDish(t, "a", { type: "dish", key: "c", zone: "before" });
        dropDish(t, "d", { type: "sec", key: "Dolci", zone: "inside" });
        expect(findSec(t, "Terra")!.sec.dishes.map(d => d.key)).toEqual(["b", "a", "c"]);
        expect(findSec(t, "Dolci")!.sec.dishes.map(d => d.key)).toEqual(["d"]);
    });

    it("ensure trova la strada senza guardare le maiuscole e fa nascere solo quello che manca", () => {
        const t = tree();
        const born: string[] = [];
        const make = (name: string) => (born.push(name), S(name));
        expect(ensure(t, ["primi", "MARE"], make).key).toBe("Mare");
        ensure(t, ["Contorni", "Caldi"], make);
        expect(born).toEqual(["Contorni", "Caldi"]);
    });

    it("places: i posti di prima restano se l'ordine è lo stesso e i nuovi sono in fondo", () => {
        expect(places([0, 1, 2])).toEqual([0, 1, 2]);
        expect(places([3, 7, undefined])).toEqual([3, 7, 17]);
        expect(places([1, 0])).toEqual([0, 10]);
        expect(places([0, undefined, 1])).toEqual([0, 10, 20]);
    });
});

describe("quello che il Salva non potrebbe scrivere (review #388)", () => {
    it("lo stesso prodotto due volte nello stesso ramo si vede prima; in due rami diversi va bene", () => {
        expect(clash([S("A", [D("x")]), S("B", [D("y", { productId: "p-x" })])])).toBeNull();
        expect(clash([S("A", [D("x"), D("y", { productId: "p-x" })])])?.dish.key).toBe("y");
        const deep = clash([S("A", [D("x")], [S("B", [], [S("C", [D("y", { productId: "p-x" })])])])]);
        expect([deep?.a.name, deep?.b.name]).toEqual(["A", "C"]);
        // due varianti diverse dello stesso prodotto sono due righe diverse
        expect(clash([S("A", [D("x", { parentId: "v1" }), D("y", { productId: "p-x", parentId: "v2" })])])).toBeNull();
        expect(clash([S("A", [D("x", { productId: null }), D("y", { productId: null })])])).toBeNull();
    });
    it("una variante senza nome o senza prezzo di un piatto nuovo si vede prima", () => {
        expect(badFormat([S("A", [D("x", { productId: null, formats: [{ name: "Piccola", price: 3 }] })])])).toBeNull();
        expect(badFormat([S("A", [], [S("B", [D("x", { productId: null, formats: [{ name: "", price: 3 }] })])])])?.key).toBe("x");
        expect(badFormat([S("A", [D("x", { productId: null, formats: [{ name: "Grande", price: null }] })])])?.key).toBe("x");
    });
    it("adopt: dopo un salvataggio a metà la bozza prende gli id di quello che è già scritto e lascia quelli spariti", () => {
        const draft = [
            S("Antipasti", [D("a", { linkId: "la", sort: 0 }), D("n", { productId: null, name: "Patate" })], [], { id: "c1", sort: 0 }),
            S("Nuova", [D("b")], [S("Sotto", [D("z")])]),
            S("Tolta", [D("q", { linkId: "lq", sort: 0 })], [], { id: "c9", sort: 3 })
        ];
        const fresh = [
            S("Antipasti", [D("a", { linkId: "la", sort: 0 }), D("f1", { productId: "p77", name: "patate", linkId: "l77", sort: 10 })], [], { id: "c1", sort: 0 }),
            S("nuova", [D("f2", { productId: "p-b", linkId: "l88", sort: 0 })], [], { id: "c5", sort: 12 })
        ];
        adopt(draft, fresh);
        expect(draft[0].dishes[1]).toMatchObject({ productId: "p77", linkId: "l77", sort: 10 });
        expect(draft[1]).toMatchObject({ id: "c5", sort: 12 });
        expect(draft[1].dishes[0].linkId).toBe("l88");
        expect(draft[1].subs[0].id).toBeUndefined();
        expect(draft[1].subs[0].dishes[0].linkId).toBeUndefined();
        expect(draft[2].id).toBeUndefined();
        expect(draft[2].dishes[0].linkId).toBeUndefined();
    });
});

describe("salvare «Categorie e piatti» in modifica", () => {
    beforeEach(() => {
        calls.length = 0;
        seq.n = 0;
    });
    const menu = (): Section[] => [
        S("Antipasti", [D("a", { linkId: "la", sort: 0 })], [], { id: "c1", sort: 0 }),
        S("Primi", [], [S("Terra", [D("b", { linkId: "lb", sort: 0 }), D("c", { linkId: "lc", sort: 1 })], [], { id: "c3", sort: 0 })], { id: "c2", sort: 1 }),
        S("Dolci", [D("d", { linkId: "ld", sort: 0 })], [], { id: "c4", sort: 2 })
    ];
    const save = async (fn: (x: Section[]) => void) => {
        const now = menu();
        fn(now);
        calls.length = 0;
        await saveSezioni(now, menu(), "m1", "T");
        return [...calls];
    };

    it("senza cambi non scrive niente", async () => {
        expect(await save(() => undefined)).toEqual([]);
    });

    it("un nome cambiato riscrive solo quel nome", async () => {
        expect(await save(x => void (x[2].name = "Dessert"))).toEqual([["updateCategory", "c4", "T", { name: "Dessert" }]]);
    });

    it("due categorie scambiate cambiano posto, i piatti non si toccano", async () => {
        const out = await save(x => void x.reverse());
        expect(out.map(c => c[0])).toEqual(["updateCategory", "updateCategory", "updateCategory"]);
        expect(out.map(c => [c[1], c[3]])).toEqual([
            ["c4", { sort_order: 0 }],
            ["c2", { sort_order: 10 }],
            ["c1", { sort_order: 20 }]
        ]);
    });

    it("una categoria messa dentro un'altra prende il genitore e il livello; tolto il genitore, la sottocategoria portata fuori resta", async () => {
        const inside = await save(x => dropSec(x, "Dolci", { type: "sec", key: "Terra", zone: "inside" }));
        expect(inside).toContainEqual(["updateCategory", "c4", "T", { parent_category_id: "c3", level: 3 }]);
        const out = await save(x => {
            moveOut(x, "Terra");
            x.splice(1, 1);
        });
        expect(out[0]).toEqual(["updateCategory", "c3", "T", { sort_order: 10, parent_category_id: null, level: 1 }]);
        expect(out[out.length - 1]).toEqual(["deleteCategory", "c2", "T"]);
        expect(out.some(c => c[0] === "removeProductFromCategory")).toBe(false);
    });

    it("un piatto spostato lascia il posto vecchio e ne prende uno nuovo; uno riordinato cambia solo il posto", async () => {
        const moved = await save(x => dropDish(x, "a", { type: "sec", key: "Dolci", zone: "inside" }));
        expect(moved).toEqual([
            ["removeProductFromCategory", "T", "la"],
            ["addProductToCategory", "T", "m1", "c4", "p-a", 10, null]
        ]);
        const swapped = await save(x => void findSec(x, "Terra")!.sec.dishes.reverse());
        expect(swapped).toEqual([
            ["updateProductSortOrder", "lc", "T", 0],
            ["updateProductSortOrder", "lb", "T", 10]
        ]);
    });

    it("un piatto spostato fuori da una sottocategoria tolta: prima se ne va lei coi suoi posti, poi lui trova il nuovo", async () => {
        const out = await save(x => {
            dropDish(x, "b", { type: "sec", key: "Primi", zone: "inside" });
            x[1].subs = [];
        });
        expect(out).toEqual([
            ["deleteCategory", "c3", "T"],
            ["addProductToCategory", "T", "m1", "c2", "p-b", 0, null]
        ]);
    });

    it("una categoria nuova con un piatto nuovo e le sue varianti nasce in fondo", async () => {
        const out = await save(x => void x.push(S("Contorni", [D("e", { productId: null, name: "Patate", formats: [{ name: "Piccola", price: 3 }, { name: "", price: 9 }] })])));
        expect(out).toEqual([
            ["createCategory", "T", "m1", "Contorni", 1, null, 12],
            ["createProduct", "T", { name: "Patate", description: null, base_price: null, product_type: "formats" }],
            ["createPrimaryPriceFormat", "p2", "T", "Piccola", 3],
            ["addProductToCategory", "T", "m1", "n1", "p2", 0, null]
        ]);
    });

    it("un menù nuovo si scrive con le sottocategorie al loro livello", async () => {
        const ids = await writeSections([S("Primi", [], [S("Terra", [D("b")])])], "m1", "T");
        expect(calls).toEqual([
            ["createCategory", "T", "m1", "Primi", 1, null, 0],
            ["createCategory", "T", "m1", "Terra", 2, "n1", 0],
            ["addProductToCategory", "T", "m1", "n2", "p-b", 0]
        ]);
        expect(ids).toEqual(["p-b"]);
    });

    // il primo tentativo ha creato categoria e collegamento, poi qualcosa è fallito (rilettura #472, punto 4)
    it("«Riprova» dopo aver rinominato la categoria nuova e spostato il piatto nuovo: si riallineano, niente nasce due volte", async () => {
        const m = new Map<string, unknown>();
        const first = menu();
        first.push(S("Contorni", [D("e")]));
        await saveSezioni(first, menu(), "m1", "T", m);
        const again = menu();
        again.push(S("Verdure", [], [], { key: "Contorni" }));
        again[2].dishes.push(D("e"));
        calls.length = 0;
        await saveSezioni(again, menu(), "m1", "T", m);
        expect(calls).toEqual([
            ["updateCategory", "n1", "T", { name: "Verdure" }],
            ["addProductToCategory", "T", "m1", "c4", "p-e", 10, null]
        ]);
        // il collegamento del primo tentativo aveva id vuoto nel finto servizio: con un id vero si toglie
        const m2 = new Map<string, unknown>([["sez-link:e", { id: "le", catId: "n1", productId: "p-e", sort: 0 }]]);
        calls.length = 0;
        await saveSezioni(again.slice(0, 3), menu(), "m1", "T", m2);
        expect(calls).toEqual([
            ["removeProductFromCategory", "T", "le"],
            ["addProductToCategory", "T", "m1", "c4", "p-e", 10, null]
        ]);
    });
});
