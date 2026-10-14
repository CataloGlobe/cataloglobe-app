import { describe, expect, it } from "vitest";
import type { SelectionItem } from "@/components/PublicCollectionView/OrderingSheet/OrderingSheet";
import { draftFromLine, replaceLine, setQty } from "@/components/PublicCollectionView/redesign/order/orderDraft";
import {
    canCancelOrder,
    cleanNote,
    isBareTableNumber,
    isLineUnavailable,
    orderRequest,
    orderStep,
    selectionTotal,
    sendFailure
} from "@/components/PublicCollectionView/redesign/order/orderSend";

const line = (over: Partial<SelectionItem> = {}): SelectionItem => ({
    id: "p1",
    name: "Burger",
    basePrice: 12,
    qty: 1,
    selectedFormat: { id: "l", name: "L", price: 12 },
    selectedAddons: [{ id: "bacon", groupId: "extras", name: "Bacon", priceDelta: 2 }],
    unitPrice: 14,
    note: null,
    ...over
});

const value = (id: string, absolutePrice: number | null = null) => ({ id, name: id, absolutePrice, priceModifier: null });
const burger = {
    id: "p1",
    name: "Burger",
    price: null,
    effective_price: null,
    optionGroups: [
        {
            id: "fmt",
            name: "Formato",
            group_kind: "PRIMARY_PRICE" as const,
            pricing_mode: "ABSOLUTE" as const,
            isRequired: true,
            maxSelectable: 1,
            values: [value("s", 8), value("l", 12)]
        },
        {
            id: "extras",
            name: "Aggiunte",
            group_kind: "ADDON" as const,
            pricing_mode: "DELTA" as const,
            isRequired: false,
            maxSelectable: 2,
            values: [value("bacon"), value("egg")]
        }
    ]
};

const fail = (message: string, extra: { code?: string; reason?: string } = {}) => Object.assign(new Error(message), extra);

describe("invio alla cucina", () => {
    it("righe come le vuole submitOrder: formato, aggiunte, nota pulita; quantità zero fuori", () => {
        const { items, notes } = orderRequest(
            [line({ qty: 2, note: "  ben   cotto " }), line({ id: "p2", qty: 0 }), line({ id: "p3", selectedFormat: null, selectedAddons: [] })],
            "   "
        );
        expect(items).toEqual([
            { product_id: "p1", quantity: 2, primary_option_value_id: "l", addon_value_ids: ["bacon"], item_notes: "ben cotto" },
            { product_id: "p3", quantity: 1 }
        ]);
        expect(notes).toBeUndefined();
        expect(orderRequest([], " tutto  insieme ").notes).toBe("tutto insieme");
    });

    it("nota vuota o di soli spazi = nessuna nota", () => {
        expect(cleanNote("  ")).toBeNull();
        expect(cleanNote(null)).toBeNull();
        expect(cleanNote(" a\n b ")).toBe("a b");
    });

    it("totale = prezzo unitario per quantità", () => {
        expect(selectionTotal([line({ qty: 2 }), line({ unitPrice: 3.5, qty: 1 })])).toBe(31.5);
        expect(selectionTotal([])).toBe(0);
    });

    it("errori dell'invio letti come oggi", () => {
        expect(sendFailure(fail("x", { code: "ORDERING_UNAVAILABLE", reason: "table_closed" }))).toEqual({
            kind: "maintenance",
            reason: "table_closed",
            message: "x"
        });
        expect(sendFailure(fail("x", { code: "ORDERING_UNAVAILABLE" }))).toMatchObject({ reason: "ordering_disabled" });
        expect(sendFailure(fail("Chiuso", { code: "ORDERING_CLOSED" }))).toEqual({ kind: "closed", message: "Chiuso" });
        expect(sendFailure(fail("Sessione scaduta"))).toEqual({ kind: "session" });
        expect(sendFailure(fail("SESSION_EXPIRED"))).toEqual({ kind: "session" });
        expect(sendFailure(fail("INVALID_ITEMS"))).toEqual({ kind: "items", productIds: [] });
        expect(sendFailure(fail("EMPTY_CART"))).toEqual({ kind: "empty" });
        expect(sendFailure(fail("boh"))).toEqual({ kind: "other", message: "boh" });
        expect(sendFailure("non un errore")).toEqual({ kind: "other", message: null });
    });

    it("piatti rifiutati dal server: spenti o fuori menu", () => {
        const withDetails = (details: unknown) => Object.assign(new Error("INVALID_ITEMS"), { details });
        expect(sendFailure(withDetails({ reason: "UNAVAILABLE_PRODUCTS", unavailable_product_ids: ["p1", "p2"] }))).toEqual({
            kind: "items",
            productIds: ["p1", "p2"]
        });
        expect(sendFailure(withDetails({ reason: "PRODUCT_NOT_IN_CATALOG", invalid_product_ids: ["p3", 4] }))).toEqual({
            kind: "items",
            productIds: ["p3"]
        });
        expect(sendFailure(withDetails({ reason: "PRICE_MISMATCH" }))).toEqual({ kind: "items", productIds: [] });
        expect(sendFailure(withDetails("x"))).toEqual({ kind: "items", productIds: [] });
    });

    it("quattro passi fino a Servito; annullato fuori; si annulla solo da Inviato", () => {
        expect(["submitted", "acknowledged", "ready", "delivered"].map(s => orderStep(s as never))).toEqual([0, 1, 2, 3]);
        expect(orderStep("cancelled")).toBe(-1);
        expect(canCancelOrder("submitted")).toBe(true);
        expect(canCancelOrder("acknowledged")).toBe(false);
        expect(canCancelOrder("cancelled")).toBe(false);
    });
});

describe("righe e tavolo", () => {
    it("piatto sparito dal menu o spento = non più disponibile", () => {
        const menu: Record<string, { is_disabled?: boolean }> = { p1: {}, p2: { is_disabled: true } };
        const find = (id: string) => menu[id] ?? null;
        expect(isLineUnavailable(find, { id: "p1" })).toBe(false);
        expect(isLineUnavailable(find, { id: "p2" })).toBe(true);
        expect(isLineUnavailable(find, { id: "p3" })).toBe(true);
        // Spento dopo l'apertura: il menu della pagina lo dà ancora, il server no.
        expect(isLineUnavailable(find, { id: "p1" }, new Set(["p1"]))).toBe(true);
    });

    it("«Tavolo» solo davanti a un numero nudo", () => {
        expect(isBareTableNumber("12")).toBe(true);
        expect(isBareTableNumber(" 6 ")).toBe(true);
        expect(isBareTableNumber("T5")).toBe(false);
        expect(isBareTableNumber("Tavolo 1")).toBe(false);
    });
});

describe("Modifica di una riga", () => {
    it("la bozza riparte dalla riga; scelte e formati che non ci sono più cadono", () => {
        expect(draftFromLine(burger, line({ qty: 3, note: "senza sale" }))).toEqual({
            formatId: "l",
            addons: { extras: ["bacon"] },
            qty: 3,
            note: "senza sale"
        });
        const stale = line({
            selectedFormat: { id: "xl", name: "XL", price: 15 },
            selectedAddons: [{ id: "gone", groupId: "extras", name: "Via", priceDelta: 1 }]
        });
        expect(draftFromLine(burger, stale)).toMatchObject({ formatId: null, addons: {} });
        // La quantità della riga resta (fino al tetto del server), anche sopra il «+» della scheda.
        expect(draftFromLine(burger, line({ qty: 25 })).qty).toBe(25);
        expect(draftFromLine(burger, line({ qty: 150 })).qty).toBe(99);
    });

    it("una riga già sopra il «+» della scheda scende di uno, non salta a 20", () => {
        const draft = draftFromLine(burger, line({ qty: 25 }));
        expect(setQty(draft, 24).qty).toBe(24);
        expect(setQty(draft, 26).qty).toBe(25);
        expect(setQty({ ...draft, qty: 3 }, 25).qty).toBe(20);
    });

    it("la riga nuova prende il posto della vecchia, o si somma alla gemella", () => {
        const a = line();
        const b = line({ selectedAddons: [], unitPrice: 12 });
        const c = line({ id: "p9" });
        expect(replaceLine([a, c], 0, { ...a, qty: 4 })).toEqual([{ ...a, qty: 4 }, c]);
        // a diventa uguale a b: una riga sola, con le quantità sommate.
        expect(replaceLine([a, b, c], 0, { ...b, qty: 2 })).toEqual([{ ...b, qty: 3 }, c]);
        expect(replaceLine([a], 5, b)).toEqual([a]);
        // Sommate non passano il tetto del server.
        expect(replaceLine([a, { ...b, qty: 90 }], 0, { ...b, qty: 20 })).toEqual([{ ...b, qty: 99 }]);
    });
});
