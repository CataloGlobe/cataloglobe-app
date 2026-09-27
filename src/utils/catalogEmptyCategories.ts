/**
 * Le categorie di un menù che i clienti non vedono (§23.2, #238): quelle
 * senza prodotti, né propri né nelle sotto-categorie. È la stessa lettura
 * dell'albero del dettaglio («vuota: i clienti non la vedono») e del resolver
 * pubblico, che le scarta (`filterEmptyCategories`): una categoria che ha
 * prodotti solo sotto resta, perché le sue figlie si vedono.
 */
export function countEmptyCategories(
    categories: ReadonlyArray<{ id: string; parent_category_id: string | null }>,
    linkedCategoryIds: Iterable<string>
): number {
    const full = new Set(linkedCategoryIds);
    const parentById = new Map(categories.map(c => [c.id, c.parent_category_id]));
    // Una categoria con prodotti accende i suoi antenati.
    for (const id of [...full]) {
        let parent = parentById.get(id) ?? null;
        while (parent && !full.has(parent)) {
            full.add(parent);
            parent = parentById.get(parent) ?? null;
        }
    }
    return categories.filter(c => !full.has(c.id)).length;
}
