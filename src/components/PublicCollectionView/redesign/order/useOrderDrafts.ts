import { useState } from "react";
import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import { hasOrderablePrice } from "@/components/PublicCollectionView/itemPricing";
import type { SheetsSlotContext } from "../slots";
import { useSheetState } from "../sheets/sheetStack";
import { initialDraft, type OrderDraft } from "./orderDraft";
import type { OrderBinding, OrderHint } from "./OrderChoices";

type Entry = { draft: OrderDraft; hint: OrderHint };

/**
 * Le bozze delle schede in modo ordine, una per pagina del foglio: restano
 * durante il giro in «Perfetto con» e ripartono da capo quando la scheda
 * rientra nella pila (non quando esce: durante la discesa resta com'era).
 */
export function useOrderDrafts(order: SheetsSlotContext["product"]["order"]) {
    const [entries, setEntries] = useState<Record<string, Entry>>({});
    const keys = useSheetState()
        .pages.map(page => page.key)
        .join("\n");
    const [seenKeys, setSeenKeys] = useState(keys);
    if (keys !== seenKeys) {
        const before = new Set(seenKeys.split("\n"));
        const entered = keys.split("\n").filter(key => !before.has(key));
        setSeenKeys(keys);
        if (entered.some(key => key in entries)) {
            setEntries(prev => Object.fromEntries(Object.entries(prev).filter(([key]) => !entered.includes(key))));
        }
    }

    /** La bozza della pagina; undefined se qui non si ordina (niente QR, piatto spento, prezzo che non c'è). */
    return (pageKey: string, item: CollectionViewSectionItem): OrderBinding | undefined => {
        if (!order || item.is_disabled === true || !hasOrderablePrice(item)) return undefined;
        const entry = entries[pageKey] ?? { draft: initialDraft(item), hint: null };
        return {
            ...entry,
            setDraft: (draft, hint = null) => setEntries(prev => ({ ...prev, [pageKey]: { draft, hint } }))
        };
    };
}
