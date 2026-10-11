import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { SelectedAddon, SelectedFormat, SelectionItem } from "@/components/PublicCollectionView/OrderingSheet/OrderingSheet";
import { isOrderablePrice } from "@/components/PublicCollectionView/itemPricing";

/**
 * Scheda in modo ordine (spec §7): la bozza di un piatto prima di «Aggiungi»
 * (formato, scelte, quantità, nota) e le due operazioni sulla selezione del
 * tavolo che `CollectionView` tiene (aggiungi, Annulla). Puro, provato in
 * `src/tests/publicRedesign/orderDraft.test.ts`.
 */

type OptionGroup = NonNullable<CollectionViewSectionItem["optionGroups"]>[number];
type OrderItem = Pick<CollectionViewSectionItem, "id" | "name" | "price" | "effective_price" | "optionGroups">;

/** Stesso tetto di `ItemNoteEditor` e del server. */
export const ITEM_NOTE_MAX = 140;
export const QTY_MIN = 1;
/** Il «+» della scheda si ferma qui. */
export const QTY_MAX = 20;
/** Il tetto del server per riga: una riga sommata o portata più in alto da «Il tuo ordine» non lo passa. */
export const LINE_QTY_MAX = 99;

export type OrderDraft = {
    formatId: string | null;
    /** Valori scelti per gruppo di scelte, nell'ordine in cui sono stati toccati. */
    addons: Record<string, string[]>;
    qty: number;
    note: string;
};

// Come `itemPricing`: il tipo del gruppo può arrivare in minuscolo.
const isFormatGroup = (group: OptionGroup) => group.group_kind?.toUpperCase() === "PRIMARY_PRICE";

export const formatGroupOf = (item: OrderItem): OptionGroup | undefined => item.optionGroups?.find(isFormatGroup);

export const addonGroupsOf = (item: OrderItem): OptionGroup[] =>
    item.optionGroups?.filter(group => !isFormatGroup(group) && group.values.length > 0) ?? [];

/** Un formato solo è già scelto, come nella scheda di oggi. */
export function initialDraft(item: OrderItem): OrderDraft {
    const formats = formatGroupOf(item);
    return {
        formatId: formats && formats.values.length === 1 ? formats.values[0].id : null,
        addons: {},
        qty: QTY_MIN,
        note: ""
    };
}

/**
 * Tocco su una scelta. Con «scegli 1» la nuova prende il posto della vecchia;
 * oltre il massimo il tocco non passa e `blocked` dice quante ce ne sono già
 * («Hai scelto 2: togline una per cambiare»).
 */
export function toggleAddon(
    draft: OrderDraft,
    group: Pick<OptionGroup, "id" | "maxSelectable">,
    valueId: string
): { draft: OrderDraft; blocked: number | null } {
    const current = draft.addons[group.id] ?? [];
    if (current.includes(valueId)) {
        return { draft: { ...draft, addons: { ...draft.addons, [group.id]: current.filter(id => id !== valueId) } }, blocked: null };
    }
    const max = group.maxSelectable;
    if (max === 1) return { draft: { ...draft, addons: { ...draft.addons, [group.id]: [valueId] } }, blocked: null };
    if (max != null && current.length >= max) return { draft, blocked: current.length };
    return { draft: { ...draft, addons: { ...draft.addons, [group.id]: [...current, valueId] } }, blocked: null };
}

/** Id del gruppo nella pagina, per il pulsante che porta a ciò che manca. */
export const choiceGroupId = (itemId: string, groupId: string) => `oc-${itemId}-${groupId}`;

/** Una riga già sopra il tetto della scheda (da «Modifica») scende di uno, non salta a 20. */
export const setQty = (draft: OrderDraft, qty: number): OrderDraft => ({
    ...draft,
    qty: Math.min(Math.max(QTY_MAX, draft.qty), LINE_QTY_MAX, Math.max(QTY_MIN, Math.round(qty)))
});

export const setNote = (draft: OrderDraft, note: string): OrderDraft => ({ ...draft, note: note.slice(0, ITEM_NOTE_MAX) });

/** La prima cosa che manca, nell'ordine della scheda: il formato, poi i gruppi obbligatori. */
export function missingChoice(item: OrderItem, draft: OrderDraft): { groupId: string; name: string; isFormat: boolean } | null {
    const formats = formatGroupOf(item);
    if (formats && !draft.formatId) return { groupId: formats.id, name: formats.name, isFormat: true };
    for (const group of addonGroupsOf(item)) {
        if (group.isRequired && (draft.addons[group.id]?.length ?? 0) === 0) {
            return { groupId: group.id, name: group.name, isFormat: false };
        }
    }
    return null;
}

/** La riga della selezione che la bozza aggiunge; null se il prezzo non si conosce (il server la rifiuterebbe). */
export function draftToLine(item: OrderItem, draft: OrderDraft): SelectionItem | null {
    const formats = formatGroupOf(item);
    let format: SelectedFormat | null = null;
    let basePrice: number | null | undefined;
    if (formats) {
        const value = formats.values.find(v => v.id === draft.formatId);
        if (!value) return null;
        basePrice = value.absolutePrice;
        format = { id: value.id, name: value.name, price: value.absolutePrice ?? 0 };
    } else {
        basePrice = item.effective_price ?? item.price;
    }
    if (!isOrderablePrice(basePrice)) return null;
    const addons: SelectedAddon[] = [];
    for (const group of addonGroupsOf(item)) {
        for (const valueId of draft.addons[group.id] ?? []) {
            const value = group.values.find(v => v.id === valueId);
            if (value) addons.push({ id: value.id, groupId: group.id, name: value.name, priceDelta: value.priceModifier ?? 0 });
        }
    }
    const note = draft.note.trim();
    return {
        id: item.id,
        name: item.name,
        basePrice: basePrice as number,
        qty: draft.qty,
        selectedFormat: format,
        selectedAddons: addons,
        unitPrice: (basePrice as number) + addons.reduce((sum, a) => sum + a.priceDelta, 0),
        note: note ? note : null
    };
}

/**
 * «Modifica» da «Il tuo ordine»: la bozza che riparte dalla riga. Le scelte che
 * il menu non ha più cadono; il formato che non c'è più torna da scegliere.
 */
export function draftFromLine(item: OrderItem, line: SelectionItem): OrderDraft {
    const formats = formatGroupOf(item);
    const formatId = line.selectedFormat?.id ?? null;
    const addons: Record<string, string[]> = {};
    for (const group of addonGroupsOf(item)) {
        const ids = (line.selectedAddons ?? [])
            .filter(addon => addon.groupId === group.id && group.values.some(v => v.id === addon.id))
            .map(addon => addon.id);
        if (ids.length > 0) addons[group.id] = ids;
    }
    return {
        formatId: formats?.values.some(v => v.id === formatId) ? formatId : initialDraft(item).formatId,
        addons,
        qty: Math.min(LINE_QTY_MAX, Math.max(QTY_MIN, line.qty)),
        note: (line.note ?? "").slice(0, ITEM_NOTE_MAX)
    };
}

/**
 * Riga modificata: prende il posto della vecchia; se ora è uguale a un'altra
 * riga (stesse scelte e nota) le due si sommano, al posto della prima.
 */
export function replaceLine(selection: SelectionItem[], index: number, line: SelectionItem): SelectionItem[] {
    if (index < 0 || index >= selection.length) return selection;
    const rest = selection.filter((_, i) => i !== index);
    const twin = rest.findIndex(existing => sameLine(existing, line));
    if (twin < 0) return selection.map((existing, i) => (i === index ? line : existing));
    return rest.map((existing, i) => (i === twin ? { ...existing, qty: Math.min(LINE_QTY_MAX, existing.qty + line.qty) } : existing));
}

/** Il prezzo che il pulsante mostra: formato (o prezzo) più sovrapprezzi, per la quantità. */
export function draftTotal(item: OrderItem, draft: OrderDraft): number | null {
    const formats = formatGroupOf(item);
    const base = formats
        ? formats.values.find(v => v.id === draft.formatId)?.absolutePrice ?? null
        : item.effective_price ?? item.price ?? null;
    if (!isOrderablePrice(base)) return null;
    let unit = base as number;
    for (const group of addonGroupsOf(item)) {
        for (const valueId of draft.addons[group.id] ?? []) {
            unit += group.values.find(v => v.id === valueId)?.priceModifier ?? 0;
        }
    }
    return unit * draft.qty;
}

/** Stessa chiave di `CollectionView` (prodotto, formato, scelte): righe uguali si sommano. */
function lineKey(line: Pick<SelectionItem, "id" | "selectedFormat" | "selectedAddons">): string {
    const formatPart = line.selectedFormat ? line.selectedFormat.id : "no-format";
    const addonPart = (line.selectedAddons ?? []).map(a => a.id).sort().join(",") || "no-addons";
    return `${line.id}__${formatPart}__${addonPart}`;
}

const sameLine = (a: SelectionItem, b: SelectionItem) => lineKey(a) === lineKey(b) && (a.note ?? null) === (b.note ?? null);

/** Aggiunge alla selezione: si somma a una riga uguale (nota compresa), altrimenti riga nuova in fondo. */
export function addLine(selection: SelectionItem[], line: SelectionItem): SelectionItem[] {
    const index = selection.findIndex(existing => sameLine(existing, line));
    if (index < 0) return [...selection, line];
    return selection.map((existing, i) => (i === index ? { ...existing, qty: Math.min(LINE_QTY_MAX, existing.qty + line.qty) } : existing));
}

/** Quanti ne ha la riga dove `addLine` ha messo `line` (per le analitiche). */
export function lineQty(selection: SelectionItem[], line: SelectionItem): number {
    return selection.find(existing => sameLine(existing, line))?.qty ?? 0;
}

/** «Annulla»: toglie quello che `addLine` ha messo, anche se nel frattempo la riga è cresciuta. */
export function undoLine(selection: SelectionItem[], line: SelectionItem): SelectionItem[] {
    let index = -1;
    for (let i = selection.length - 1; i >= 0; i--) {
        if (sameLine(selection[i], line)) {
            index = i;
            break;
        }
    }
    if (index < 0) return selection;
    const left = selection[index].qty - line.qty;
    return left > 0
        ? selection.map((existing, i) => (i === index ? { ...existing, qty: left } : existing))
        : selection.filter((_, i) => i !== index);
}
