// Salvare una modifica fatta nel tunnel (D140): solo i passi cambiati, e dentro
// ogni passo solo le differenze. Il resto della cosa resta com'è.
import { addProductToCategory, createCategory, deleteCategory, removeProductFromCategory, updateCatalog } from "@/services/supabase/catalogs";
import { createProduct } from "@/services/supabase/products";
import { updateStyle } from "@/services/supabase/styles";
import {
    listFeaturedContentProducts,
    syncFeaturedContentProducts,
    updateFeaturedContent,
    updateFeaturedContentProductNote,
    updateFeaturedContentProductsSortOrder,
    type FeaturedContent
} from "@/services/supabase/featuredContents";
import { listLayoutRules } from "@/services/supabase/layoutScheduling";
import { updateStory, type StoryUpdateInput } from "@/services/supabase/stories";
import { uploadFeaturedContentImage, uploadStoryImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { draftFromEntry } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { saveDraft } from "@/pages/Dashboard/Programming/calendar/calendarSave";
import { parsePrice } from "@/pages/Dashboard/Highlights/featuredContentTypes";
import { changed, cloneWhen, effWhen, thingName, type Section, type Tunnel } from "./creaModel";
import { entriesOf } from "./creaLoad";
import { styleConfig } from "./creaStyle";
import type { SaveCtx, Saved } from "./creaSave";
import type { CreaData } from "./useCreaData";

export type EditCtx = Pick<SaveCtx, "tenantId" | "L" | "baseTokens" | "blockFiles"> & { names: CreaData["names"] };

const top = (xs: readonly (number | undefined)[]) => xs.reduce<number>((m, x) => Math.max(m, x ?? -1), -1);

/** Sezioni e piatti: si tolgono quelli tolti e si aggiungono in fondo quelli nuovi. */
async function saveSezioni(t: Tunnel, orig: Tunnel, tenantId: string) {
    const catalogId = t.edit!.id;
    const now = new Map(t.sections.filter(x => x.id).map(x => [x.id!, x]));
    for (const o of orig.sections) {
        const n = now.get(o.id!);
        if (!n) {
            await deleteCategory(o.id!, tenantId);
            continue;
        }
        const kept = new Set(n.dishes.map(d => d.linkId));
        for (const d of o.dishes) if (!kept.has(d.linkId)) await removeProductFromCategory(tenantId, d.linkId!);
    }
    const addDishes = async (sec: Section, categoryId: string) => {
        let sort = top(sec.dishes.map(d => d.sort));
        for (const d of sec.dishes) {
            if (d.linkId) continue;
            const productId = d.productId ?? (await createProduct(tenantId, { name: d.name.trim(), base_price: d.price })).id;
            await addProductToCategory(tenantId, catalogId, categoryId, productId, ++sort);
        }
    };
    // le sezioni nuove vanno in fondo, al primo livello
    let sort = top(orig.sections.filter(x => !x.name.includes(" › ")).map(x => x.sort));
    for (const sec of t.sections) {
        const categoryId = sec.id ?? (await createCategory(tenantId, catalogId, sec.name.trim() || "Piatti", 1, null, ++sort)).id;
        await addDishes(sec, categoryId);
    }
}

async function saveContenuto(t: Tunnel, orig: Tunnel, tenantId: string) {
    const id = t.edit!.id, name = thingName(t);
    const patch: Partial<FeaturedContent> = {
        title: name,
        internal_name: t.inner.trim() || name,
        subtitle: t.sub.trim() || null,
        description: t.text.trim() || null,
        cta_text: t.cta ? t.ctaText.trim() || null : null,
        cta_url: t.cta ? t.ctaLink.trim() || null : null
    };
    // la foto si riscrive solo se è nuova o è stata tolta: così resta la sua inquadratura
    if (t.image) {
        const file = await compressImage(t.image, COMPRESS_PROFILES.featured);
        patch.media_id = `${await uploadFeaturedContentImage(tenantId, id, file)}?t=${Date.now()}`;
    } else if (orig.imageUrl && !t.imageUrl) patch.media_id = null;
    await updateFeaturedContent(id, tenantId, patch);
}

async function savePiatti(t: Tunnel, tenantId: string) {
    const id = t.edit!.id;
    const rows = await listFeaturedContentProducts(id, tenantId);
    const have = new Set(rows.map(r => r.product_id));
    await syncFeaturedContentProducts(
        id,
        tenantId,
        rows.filter(r => !t.dishes.includes(r.product_id)).map(r => r.id),
        t.dishes.filter(d => !have.has(d)).map(productId => ({ productId, sortOrder: t.dishes.indexOf(productId) }))
    );
    const after = await listFeaturedContentProducts(id, tenantId);
    const order = after.map(r => ({ id: r.id, sort_order: t.dishes.indexOf(r.product_id) })).filter(r => r.sort_order >= 0);
    if (order.some(r => after.find(a => a.id === r.id)?.sort_order !== r.sort_order)) await updateFeaturedContentProductsSortOrder(order, tenantId);
    if (t.evType === "bundle") await updateFeaturedContent(id, tenantId, { bundle_price: parsePrice(t.bundle), show_original_total: t.showOrig });
    else
        for (const r of after) {
            const n = t.notes[r.product_id]?.trim() || null;
            if (n !== (r.note?.trim() || null)) await updateFeaturedContentProductNote(r.id, tenantId, n);
        }
}

async function saveStoria(t: Tunnel, orig: Tunnel, c: EditCtx, dove: boolean) {
    const id = t.edit!.id;
    const patch: StoryUpdateInput = {};
    if (changed(t, "racconto")) {
        patch.eyebrow = t.kicker.trim() || null;
        patch.title = thingName(t);
        patch.product_id = t.linked || null;
        if (t.cover) patch.cover_media = await uploadStoryImage(c.tenantId, id, await compressImage(t.cover, COMPRESS_PROFILES.cover));
        else if (orig.coverUrl && !t.coverUrl) patch.cover_media = null;
    }
    if (changed(t, "blocchi")) {
        const blocks = [];
        for (const b of t.blocks) {
            const f = c.blockFiles[b.id];
            if (b.type === "image" && f) blocks.push({ ...b, url: await uploadStoryImage(c.tenantId, `${id}/${b.id}`, await compressImage(f, COMPRESS_PROFILES.story)) });
            else if (b.type === "list") blocks.push({ ...b, items: b.items.filter(x => x.trim() !== "") });
            else blocks.push(b);
        }
        patch.body_blocks = blocks;
    }
    if (dove) {
        const w = t.where;
        patch.activity_id = !w.all && w.activityIds.length === 1 && !w.groupIds.length ? w.activityIds[0] : null;
    }
    await updateStory(id, c.tenantId, patch);
}

/** Il quando e il dove: si riscrive la sua regola del Calendario, come da lì. */
async function saveQuando(t: Tunnel, c: EditCtx) {
    const id = t.edit!.id;
    const rules = await listLayoutRules(c.tenantId);
    const e = entriesOf(t.kind, id, { rules, names: c.names }).find(x => x.ruleId === t.edit!.ruleId);
    if (!e) throw new Error("la regola non c'è più");
    const D = draftFromEntry(e, c.L, t.kind === "evid" && e.rule.featured_contents.length > 1 ? id : null);
    D.when = cloneWhen(effWhen(t));
    D.where = { all: t.where.all, activityIds: [...t.where.activityIds], groupIds: [...t.where.groupIds] };
    await saveDraft(D, c.L, c.tenantId);
}

export async function saveEdit(t: Tunnel, c: EditCtx): Promise<Saved> {
    const e = t.edit!, orig = e.orig, id = e.id, name = thingName(t);
    const dove = changed(t, "dove") || changed(t, "quando");
    if (t.kind === "menu") {
        if (changed(t, "parti")) await updateCatalog(id, c.tenantId, { name });
        if (changed(t, "sezioni")) await saveSezioni(t, orig, c.tenantId);
    } else if (t.kind === "stile") {
        // i colori e i caratteri fanno una versione nuova dello stile; il solo nome no
        if (changed(t, "nome") || changed(t, "aspetto")) await updateStyle(id, changed(t, "nome") ? name : undefined, changed(t, "aspetto") ? styleConfig(t, c.baseTokens) : undefined, c.tenantId);
    } else if (t.kind === "evid") {
        if (changed(t, "contenuto")) await saveContenuto(t, orig, c.tenantId);
        if (changed(t, "piatti")) await savePiatti(t, c.tenantId);
    } else if (changed(t, "racconto") || changed(t, "blocchi") || dove) await saveStoria(t, orig, c, dove);
    if (dove && t.kind !== "storia") await saveQuando(t, c);
    return { id, name, live: true, ruleId: e.ruleId };
}
