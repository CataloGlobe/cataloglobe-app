import type { CollectionViewSectionGroup, CollectionViewSection } from "@/components/PublicCollectionView/CollectionView/CollectionView";

/** Una riga del foglio «Categorie»: testata del riquadro o sottocategoria. */
export type CategoryRow = {
    id: string;
    name: string;
    /** 0 = categoria principale (testata), 1+ = sottocategoria e oltre. */
    depth: number;
    /** Piatti visibili (filtri compresi) sotto la riga; null = la riga non porta ai piatti. */
    count: number | null;
};

export type CategoryBox = { id: string; rows: CategoryRow[] };

function countOf(section: CollectionViewSection, children: Map<string, CollectionViewSection[]>): number {
    return (children.get(section.id) ?? []).reduce((sum, kid) => sum + countOf(kid, children), section.items.length);
}

/**
 * Riquadri del foglio «Categorie» (spec §4, D36): uno per categoria principale,
 * la principale come testata senza conteggio, le sottocategorie dentro in
 * ordine d'albero. Una principale senza sottocategorie porta da sola ai piatti:
 * lì il conteggio c'è. Riquadri e righe senza piatti (filtri) non compaiono.
 */
export function categoryBoxes(groups: readonly CollectionViewSectionGroup[]): CategoryBox[] {
    return groups.flatMap(({ root, children }) => {
        const byParent = new Map<string, CollectionViewSection[]>();
        for (const child of children) {
            const key = child.parentCategoryId ?? root.id;
            byParent.set(key, [...(byParent.get(key) ?? []), child]);
        }
        const total = countOf(root, byParent);
        if (total === 0) return [];
        const hasKids = (byParent.get(root.id) ?? []).length > 0;
        const rows: CategoryRow[] = [{ id: root.id, name: root.name, depth: 0, count: hasKids ? null : total }];
        const walk = (parentId: string, depth: number) => {
            for (const kid of byParent.get(parentId) ?? []) {
                const count = countOf(kid, byParent);
                if (count === 0) continue;
                rows.push({ id: kid.id, name: kid.name, depth, count });
                walk(kid.id, depth + 1);
            }
        };
        walk(root.id, 1);
        return [{ id: root.id, rows }];
    });
}
