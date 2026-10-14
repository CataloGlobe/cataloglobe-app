// Scrivere «Categorie e piatti» nel database (D177): tutto il menù quando nasce,
// solo le differenze quando lo si modifica.
import { addProductToCategory, createCategory, deleteCategory, removeProductFromCategory, updateCategory, updateProductSortOrder } from "@/services/supabase/catalogs";
import { createProduct, updateProduct } from "@/services/supabase/products";
import { createPrimaryPriceFormat } from "@/services/supabase/productOptions";
import type { Dish, Section } from "./creaModel";
import { MAX_LEVEL, allSecs } from "./menuTree";

/**
 * Quello che un salvataggio ha già scritto, per chiave del tunnel (`SaveCtx.done`):
 * al «Riprova» ogni cosa si riconosce dal suo id, non dal posto né dal nome, e
 * se nel frattempo è cambiata si aggiorna invece di nascere un'altra volta.
 * Senza memoria (una `Map` nuova) si scrive tutto da capo.
 */
export type Memo = Map<string, unknown>;

/** Un passo che, riuscito una volta, al «Riprova» non si rifà. */
export async function once<T>(m: Memo, key: string, run: () => Promise<T>): Promise<T> {
    if (m.has(key)) return m.get(key) as T;
    const v = await run();
    m.set(key, v);
    return v;
}

type ProdW = { id: string; name: string; description: string | null; price: number | null; type: "formats" | "simple" };
type CatW = { id: string; name: string; parent: string | null; level: number; sort: number };
type LinkW = { id: string | undefined; catId: string; productId: string; sort: number };

/** Il prodotto di un piatto: quello che hai già, o uno nuovo con descrizione e varianti. */
export async function productOf(d: Dish, tenantId: string, m: Memo = new Map()): Promise<string> {
    if (d.productId) return d.productId;
    const formats = (d.formats ?? []).filter((f): f is { name: string; price: number } => !!f.name.trim() && f.price !== null);
    const name = d.name.trim(), description = d.description ?? null, price = formats.length ? null : d.price;
    const type = formats.length ? "formats" : "simple";
    const key = "prod:" + d.key;
    const w = m.get(key) as ProdW | undefined;
    if (!w) {
        const id = (await createProduct(tenantId, { name, description, base_price: price, product_type: type })).id;
        m.set(key, { id, name, description, price, type });
    } else if (w.name !== name || w.description !== description || w.price !== price || w.type !== type) {
        // il piatto è nato al tentativo prima ed è cambiato sullo schermo: lo stesso prodotto, coi dati di adesso
        // (anche il prezzo che si riempie o si svuota, e le varianti aggiunte a un piatto nato semplice)
        await updateProduct(w.id, tenantId, { name, description, base_price: price, ...(w.type !== type ? { product_type: type } : {}) });
        m.set(key, { ...w, name, description, price, type });
    }
    const id = (m.get(key) as ProdW).id;
    for (const [k, f] of formats.entries()) await once(m, `format:${id}:${k}`, () => createPrimaryPriceFormat(id, tenantId, f.name.trim(), f.price));
    return id;
}

/**
 * Un menù nuovo: categorie, sottocategorie e piatti nell'ordine del tunnel; quelli letti da una foto sono già lì dentro (D180).
 * Al «Riprova» quello che è già scritto si allinea a quello che si vede: rinominato, spostato o tolto.
 */
export async function writeSections(sections: readonly Section[], catalogId: string, tenantId: string, m: Memo = new Map()): Promise<string[]> {
    const catOf = new Map<Section, string>();
    const cats = async (list: readonly Section[], parent: string | null, level: 1 | 2 | 3) => {
        for (const [i, sec] of list.entries()) {
            const name = sec.name.trim() || "Piatti";
            const key = "cat:" + sec.key;
            const w = m.get(key) as CatW | undefined;
            if (!w) m.set(key, { id: (await createCategory(tenantId, catalogId, name, level, parent, i)).id, name, parent, level, sort: i });
            else {
                const upd: Parameters<typeof updateCategory>[2] = {};
                if (w.name !== name) upd.name = name;
                if (w.sort !== i) upd.sort_order = i;
                if (w.parent !== parent || w.level !== level) Object.assign(upd, { parent_category_id: parent, level });
                if (Object.keys(upd).length) await updateCategory(w.id, tenantId, upd);
                m.set(key, { ...w, name, parent, level, sort: i });
            }
            catOf.set(sec, (m.get(key) as CatW).id);
            if (level < MAX_LEVEL) await cats(sec.subs, catOf.get(sec)!, (level + 1) as 2 | 3);
        }
    };
    await cats(sections, null, 1);

    // tolte prima del «Riprova»: le categorie dal livello più profondo, coi loro piatti, poi i piatti
    const now = allSecs(sections).map(x => x.sec);
    const secKeys = new Set(now.map(x => "cat:" + x.key));
    const dishKeys = new Set(now.flatMap(x => x.dishes.map(d => "link:" + d.key)));
    const goneCats = [...m].filter(([k]) => k.startsWith("cat:") && !secKeys.has(k)).map(([k, w]) => [k, w as CatW] as const);
    for (const [k, w] of goneCats.sort((a, b) => b[1].level - a[1].level)) {
        await deleteCategory(w.id, tenantId);
        m.delete(k);
    }
    const goneIds = new Set(goneCats.map(([, w]) => w.id));
    for (const [k, v] of [...m]) {
        if (!k.startsWith("link:")) continue;
        const w = v as LinkW;
        if (goneIds.has(w.catId)) m.delete(k);
        else if (!dishKeys.has(k)) {
            if (w.id) await removeProductFromCategory(tenantId, w.id);
            m.delete(k);
        }
    }

    const productIds: string[] = [];
    for (const sec of now) {
        const catId = catOf.get(sec)!;
        for (const [j, d] of sec.dishes.entries()) {
            const productId = await productOf(d, tenantId, m);
            const key = "link:" + d.key;
            const w = m.get(key) as LinkW | undefined;
            if (w && (w.catId !== catId || w.productId !== productId)) {
                // spostato in un'altra categoria, o un altro prodotto: lascia il posto di prima
                if (w.id) await removeProductFromCategory(tenantId, w.id);
                m.delete(key);
            }
            const still = m.get(key) as LinkW | undefined;
            if (!still) m.set(key, { id: (await addProductToCategory(tenantId, catalogId, catId, productId, j))?.id, catId, productId, sort: j });
            else if (still.sort !== j) {
                if (still.id) await updateProductSortOrder(still.id, tenantId, j);
                m.set(key, { ...still, sort: j });
            }
            productIds.push(productId);
        }
    }
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
 * vuole il suo genitore, e una portata fuori non deve sparire col suo), poi le
 * categorie tolte, e solo alla fine i piatti.
 */
export async function saveSezioni(sections: readonly Section[], origSections: readonly Section[], catalogId: string, tenantId: string, m: Memo = new Map()) {
    const was = new Map(allSecs(origSections).map(({ sec, path }) => [sec.id!, { sec, parent: path[path.length - 2]?.id ?? null, level: path.length }]));
    const wasIn = new Map<string, string>();
    for (const { sec } of allSecs(origSections)) for (const d of sec.dishes) wasIn.set(d.linkId!, sec.id!);
    const idOf = new Map<Section, string>();

    const cats = async (list: readonly Section[], parent: string | null, level: 1 | 2 | 3) => {
        const sort = places(list.map(x => (x.id ? x.sort : undefined)));
        for (const [i, sec] of list.entries()) {
            const name = sec.name.trim() || "Piatti";
            // la categoria nuova e il collegamento si ricordano come il prodotto: al «Riprova» non si rifanno (review #388);
            // chiavi diverse da «cat:» e «link:», che writeSections legge come righe sue
            if (!sec.id) idOf.set(sec, await once(m, `sez-cat:${sec.key}`, async () => (await createCategory(tenantId, catalogId, name, level, parent, sort[i])).id));
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
    // le categorie tolte se ne vanno subito, dal livello più profondo, coi loro piatti: un piatto
    // spostato da lì a un'altra del ramo troverebbe ancora il suo vecchio posto (review #388.1)
    const gone = [...was].filter(([id]) => !kept.has(id)).sort((a, b) => b[1].level - a[1].level);
    for (const [id] of gone) await deleteCategory(id, tenantId);
    // i piatti tolti o spostati lasciano il posto
    for (const [linkId, catId] of wasIn) if (!here.has(linkId) && kept.has(catId)) await removeProductFromCategory(tenantId, linkId);
    for (const sec of now) {
        const sort = places(sec.dishes.map(d => (stays(d, sec) ? d.sort : undefined)));
        for (const [j, d] of sec.dishes.entries()) {
            if (stays(d, sec)) {
                if (d.sort !== sort[j]) await updateProductSortOrder(d.linkId!, tenantId, sort[j]);
                continue;
            }
            // il prodotto nuovo si ricorda per piatto: al «Riprova» non nasce una seconda volta
            const productId = await productOf(d, tenantId, m);
            // una variante sta nel menù col suo prodotto e sé stessa accanto
            await once(m, `sez-link:${d.key}`, () => addProductToCategory(tenantId, catalogId, idOf.get(sec)!, d.parentId ?? productId, sort[j], d.parentId ? productId : null));
        }
    }

}
