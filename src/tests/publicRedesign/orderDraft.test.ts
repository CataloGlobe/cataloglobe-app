import { describe, expect, it } from "vitest";
import {
    addLine,
    draftToLine,
    lineQty,
    draftTotal,
    initialDraft,
    missingChoice,
    removeOne,
    setNote,
    setQty,
    toggleAddon,
    undoLine,
    ITEM_NOTE_MAX,
    type OrderDraft
} from "@/components/PublicCollectionView/redesign/order/orderDraft";

const value = (id: string, extra: { absolutePrice?: number | null; priceModifier?: number | null } = {}) => ({
    id,
    name: id.toUpperCase(),
    absolutePrice: extra.absolutePrice ?? null,
    priceModifier: extra.priceModifier ?? null
});

const formats = {
    id: "fmt",
    name: "Formato",
    group_kind: "PRIMARY_PRICE" as const,
    pricing_mode: "ABSOLUTE" as const,
    isRequired: true,
    maxSelectable: 1,
    values: [value("s", { absolutePrice: 8 }), value("l", { absolutePrice: 12 })]
};
const sauce = {
    id: "sauce",
    name: "Salsa",
    group_kind: "ADDON" as const,
    pricing_mode: "DELTA" as const,
    isRequired: true,
    maxSelectable: 1,
    values: [value("ketchup"), value("mayo", { priceModifier: 0.5 })]
};
const extras = {
    id: "extras",
    name: "Aggiunte",
    group_kind: "ADDON" as const,
    pricing_mode: "DELTA" as const,
    isRequired: false,
    maxSelectable: 2,
    values: [value("bacon", { priceModifier: 2 }), value("egg", { priceModifier: 1 }), value("cheese", { priceModifier: 1.5 })]
};

const burger = { id: "p1", name: "Burger", price: null, effective_price: null, optionGroups: [formats, sauce, extras] };
const water = { id: "p2", name: "Acqua", price: 2, effective_price: null, optionGroups: [] };

describe("bozza della scheda in modo ordine", () => {
    it("un formato solo è già scelto, più formati no", () => {
        expect(initialDraft(burger).formatId).toBeNull();
        expect(initialDraft({ ...burger, optionGroups: [{ ...formats, values: [formats.values[0]] }] }).formatId).toBe("s");
    });

    it("scegli 1 sostituisce, fino a 2 si ferma alla terza e dice quante ce ne sono", () => {
        let draft = toggleAddon(initialDraft(burger), sauce, "ketchup").draft;
        draft = toggleAddon(draft, sauce, "mayo").draft;
        expect(draft.addons.sauce).toEqual(["mayo"]);

        draft = toggleAddon(draft, extras, "bacon").draft;
        draft = toggleAddon(draft, extras, "egg").draft;
        const third = toggleAddon(draft, extras, "cheese");
        expect(third.blocked).toBe(2);
        expect(third.draft.addons.extras).toEqual(["bacon", "egg"]);

        const removed = toggleAddon(draft, extras, "bacon").draft;
        expect(removed.addons.extras).toEqual(["egg"]);
    });

    it("dice cosa manca, nell'ordine della scheda", () => {
        const draft = initialDraft(burger);
        expect(missingChoice(burger, draft)).toEqual({ groupId: "fmt", name: "Formato", isFormat: true });
        const withFormat = { ...draft, formatId: "l" };
        expect(missingChoice(burger, withFormat)).toEqual({ groupId: "sauce", name: "Salsa", isFormat: false });
        expect(missingChoice(burger, toggleAddon(withFormat, sauce, "ketchup").draft)).toBeNull();
        expect(missingChoice(water, initialDraft(water))).toBeNull();
    });

    it("quantità da 1 a 20, nota fino a 140 caratteri", () => {
        const draft = initialDraft(water);
        expect(setQty(draft, 0).qty).toBe(1);
        expect(setQty(draft, 25).qty).toBe(20);
        expect(setNote(draft, "x".repeat(200)).note).toHaveLength(ITEM_NOTE_MAX);
    });

    it("prezzo del pulsante e riga della selezione: formato più sovrapprezzi, per la quantità", () => {
        let draft: OrderDraft = { ...initialDraft(burger), formatId: "l", qty: 2, note: "  ben cotto " };
        draft = toggleAddon(draft, sauce, "mayo").draft;
        draft = toggleAddon(draft, extras, "bacon").draft;
        expect(draftTotal(burger, draft)).toBe(29);
        expect(draftToLine(burger, draft)).toEqual({
            id: "p1",
            name: "Burger",
            basePrice: 12,
            qty: 2,
            selectedFormat: { id: "l", name: "L", price: 12 },
            selectedAddons: [
                { id: "mayo", groupId: "sauce", name: "MAYO", priceDelta: 0.5 },
                { id: "bacon", groupId: "extras", name: "BACON", priceDelta: 2 }
            ],
            unitPrice: 14.5,
            note: "ben cotto"
        });
    });

    it("senza prezzo la riga non nasce", () => {
        const noPrice = { ...water, price: null };
        expect(draftToLine(noPrice, initialDraft(noPrice))).toBeNull();
        expect(draftTotal(noPrice, initialDraft(noPrice))).toBeNull();
        expect(draftToLine(burger, initialDraft(burger))).toBeNull();
    });
});

describe("aggiungi e Annulla sulla selezione", () => {
    const plain = draftToLine(water, initialDraft(water))!;

    it("righe uguali si sommano, con una nota diversa no", () => {
        let selection = addLine([], plain);
        selection = addLine(selection, { ...plain, qty: 2 });
        expect(selection).toHaveLength(1);
        expect(selection[0].qty).toBe(3);
        expect(lineQty(selection, plain)).toBe(3);
        selection = addLine(selection, { ...plain, note: "senza ghiaccio" });
        expect(selection).toHaveLength(2);
        expect(lineQty(selection, { ...plain, note: "senza ghiaccio" })).toBe(1);
    });

    it("Annulla toglie solo quello che è stato aggiunto", () => {
        const before = addLine([], plain);
        const after = addLine(before, { ...plain, qty: 2 });
        expect(undoLine(after, { ...plain, qty: 2 })).toEqual(before);
        expect(undoLine(before, plain)).toEqual([]);
        expect(undoLine([], plain)).toEqual([]);
    });
});

describe("«−» sulla riga del menù", () => {
    const plain = draftToLine(water, initialDraft(water))!;

    it("toglie un pezzo dall'ultima riga del piatto e a zero la riga sparisce", () => {
        const withNote = { ...plain, note: "senza ghiaccio" };
        let selection = addLine(addLine([], { ...plain, qty: 2 }), withNote);
        selection = removeOne(selection, plain.id);
        expect(selection).toEqual([{ ...plain, qty: 2 }]);
        selection = removeOne(selection, plain.id);
        expect(selection).toEqual([{ ...plain, qty: 1 }]);
        expect(removeOne(selection, plain.id)).toEqual([]);
    });

    it("un piatto che non c'è lascia la selezione com'è", () => {
        const selection = addLine([], plain);
        expect(removeOne(selection, "altro")).toBe(selection);
    });
});
