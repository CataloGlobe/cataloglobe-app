// Scrivere «Categorie e piatti» nel database (D177): tutto il menù quando nasce,
// solo le differenze quando lo si modifica.
import { addProductToCategory, createCategory, deleteCategory, removeProductFromCategory, updateCategory, updateProductSortOrder } from "@/services/supabase/catalogs";
import { createProduct } from "@/services/supabase/products";
import { createPrimaryPriceFormat } from "@/services/supabase/productOptions";
import type { Dish, Section } from "./creaModel";
import { MAX_LEVEL, allSecs } from "./menuTree";

/** Il prodotto di un piatto: quello che avete già, o uno nuovo con descrizione e varianti. */
export async function productOf(d: Dish, tenantId: string): Promise<string> {
    if (d.productId) return d.productId;
    const formats = (d.formats ?? []).filter((f): f is { name: string; price: number } => !!f.name.trim() && f.price !== null);
    const id = (await createProduct(tenantId, { name: d.name.trim(), description: d.description ?? null, base_price: formats.length ? null : d.price })).id;
    for (const f of formats) await createPrimaryPriceFormat(id, tenantId, f.name.trim(), f.price);
    return id;
}

/** Un menù nuovo: categorie, sottocategorie e piatti nell'ordine del tunnel; quelli letti da una foto sono già lì dentro (D180). */
export async function writeSections(sections: readonly Section[], catalogId: string, tenantId: string): Promise<string[]> {
    const productIds: string[] = [];
    const write = async (list: readonly Section[], parent: string | null, level: 1 | 2 | 3) => {
        for (const [i, sec] of list.entries()) {
            const cat = await createCategory(tenantId, catalogId, sec.name.trim() || "Piatti", level, parent, i);
            for (const [j, d] of sec.dishes.entries()) {
                const productId = await productOf(d, tenantId);
                await addProductToCategory(tenantId, catalogId, cat.id, productId, j);
                productIds.push(productId);
            }
            if (level < MAX_LEVEL) await write(sec.subs, cat.id, (level + 1) as 2 | 3);
        }
    };
    await write(sections, null, 1);
    return productIds;
}

/**
 * I posti di una fila di fratelli. Se quelli che c'erano sono ancora in ordine
 * e i nuovi stanno in fondo, i posti di prima restano: si riscrive solo chi è
 * stato spostato davvero.
 */
export function places(xs: readonly (number | undefined)[]): number[] {
    const out: number[] = [];
    for (const x of xs) {
        const last = out.length ? out[out.length - 1] : null;
        const v = x ?? (last === null ? 0 : last + 10);
        if (last !== null && v <= last) return xs.map((_, i) => i * 10);
        out.push(v);
    }
    return out;
}

/**
 * Categorie e piatti (D177): nomi, ordine, sottocategorie, piatti tolti,
 * spostati e nuovi. Prima le categorie dall'alto in basso (una sottocategoria
 * vuole il suo genitore), poi i piatti, e solo alla fine le categorie tolte:
 * così una sottocategoria portata fuori non sparisce col genitore.
 */
export async function saveSezioni(sections: readonly Section[], origSections: readonly Section[], catalogId: string, tenantId: string) {
    const was = new Map(allSecs(origSections).map(({ sec, path }) => [sec.id!, { sec, parent: path[path.length - 2]?.id ?? null, level: path.length }]));
    const wasIn = new Map<string, string>();
    for (const { sec } of allSecs(origSections)) for (const d of sec.dishes) wasIn.set(d.linkId!, sec.id!);
    const idOf = new Map<Section, string>();

    const cats = async (list: readonly Section[], parent: string | null, level: 1 | 2 | 3) => {
        const sort = places(list.map(x => (x.id ? x.sort : undefined)));
        for (const [i, sec] of list.entries()) {
            const name = sec.name.trim() || "Piatti";
            if (!sec.id) idOf.set(sec, (await createCategory(tenantId, catalogId, name, level, parent, sort[i])).id);
            else {
                idOf.set(sec, sec.id);
                const o = was.get(sec.id);
                const upd: Parameters<typeof updateCategory>[2] = {};
                if (o?.sec.name.trim() !== name) upd.name = name;
                if (o?.sec.sort !== sort[i]) upd.sort_order = sort[i];
                if (o?.parent !== parent || o?.level !== level) Object.assign(upd, { parent_category_id: parent, level });
                if (Object.keys(upd).length) await updateCategory(sec.id, tenantId, upd);
            }
            if (level < MAX_LEVEL) await cats(sec.subs, idOf.get(sec)!, (level + 1) as 2 | 3);
        }
    };
    await cats(sections, null, 1);

    const now = allSecs(sections).map(x => x.sec);
    const kept = new Set(now.map(x => x.id).filter(Boolean));
    const stays = (d: Dish, sec: Section) => !!d.linkId && wasIn.get(d.linkId) === sec.id;
    const here = new Set(now.flatMap(sec => sec.dishes.filter(d => stays(d, sec)).map(d => d.linkId!)));
    // i piatti tolti o spostati lasciano il posto; quelli di una categoria tolta se ne vanno con lei
    for (const [linkId, catId] of wasIn) if (!here.has(linkId) && kept.has(catId)) await removeProductFromCategory(tenantId, linkId);
    for (const sec of now) {
        const sort = places(sec.dishes.map(d => (stays(d, sec) ? d.sort : undefined)));
        for (const [j, d] of sec.dishes.entries()) {
            if (stays(d, sec)) {
                if (d.sort !== sort[j]) await updateProductSortOrder(d.linkId!, tenantId, sort[j]);
                continue;
            }
            const productId = await productOf(d, tenantId);
            // una variante sta nel menù col suo prodotto e sé stessa accanto
            await addProductToCategory(tenantId, catalogId, idOf.get(sec)!, d.parentId ?? productId, sort[j], d.parentId ? productId : null);
        }
    }

    const gone = [...was].filter(([id]) => !kept.has(id)).sort((a, b) => b[1].level - a[1].level);
    for (const [id] of gone) await deleteCategory(id, tenantId);
}
