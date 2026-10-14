import type { CollectionViewSectionGroup, CollectionViewSectionItem } from "./CollectionView";

/**
 * Un piatto (o una sua variante, resa come piatto) per id dentro le sezioni di
 * un catalogo. La usa `CollectionView`, e il redesign per cercare anche negli
 * altri menù di adesso (si ordina da più menù, piano 9b passo 4).
 */
export function findProductInGroups(
    sectionGroups: CollectionViewSectionGroup[],
    productId: string
): CollectionViewSectionItem | null {
    for (const group of sectionGroups) {
        for (const section of [group.root, ...group.children]) {
            const found = section.items.find(i => i.id === productId);
            if (found) return found;
            for (const item of section.items) {
                if (item.variants) {
                    const variant = item.variants.find(v => v.id === productId);
                    if (variant) {
                        return {
                            id: variant.id,
                            name: variant.name,
                            parentSelected: true,
                            price: variant.price ?? null,
                            original_price: variant.original_price ?? null,
                            from_price: variant.from_price ?? null,
                            to_price: variant.to_price ?? null,
                            image: variant.image ?? null,
                            description: variant.description ?? null,
                            ...(variant.optionGroups?.length ? { optionGroups: variant.optionGroups } : {}),
                            ...(item.characteristics?.length
                                ? { characteristics: item.characteristics }
                                : {}),
                            ...(item.allergens?.length ? { allergens: item.allergens } : {}),
                            ...(item.ingredients?.length ? { ingredients: item.ingredients } : {}),
                            ...(item.notes?.length ? { notes: item.notes } : {}),
                        };
                    }
                }
            }
        }
    }
    return null;
}
