// Salvare una modifica fatta nel tunnel (D140): solo i passi cambiati, e dentro
// ogni passo solo le differenze. Il resto della cosa resta com'è.
import { updateCatalog } from "@/services/supabase/catalogs";
import { updateStyle } from "@/services/supabase/styles";
import {
    listFeaturedContentProducts,
    syncFeaturedContentProducts,
    updateFeaturedContent,
    updateFeaturedContentProductNote,
    updateFeaturedContentProductsSortOrder,
    type FeaturedContent
} from "@/services/supabase/featuredContents";
import { listLayoutRules, updateScheduleEnabled } from "@/services/supabase/layoutScheduling";
import { updateStory, type StoryUpdateInput } from "@/services/supabase/stories";
import { uploadFeaturedContentImage, deleteStoryImageBestEffort, uploadStoryImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { draftFromEntry } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { dropDraft, saveDraft } from "@/pages/Dashboard/Programming/calendar/calendarSave";
import { deriveTypeFields, parsePrice } from "@/pages/Dashboard/Highlights/featuredContentTypes";
import { EV, changed, clonePer, cloneWhen, effWhen, hasDishes, thingName, type Tunnel } from "./creaModel";
import { saveSezioni } from "./menuSave";
import { allEntriesOf } from "./creaLoad";
import { styleConfig } from "./creaStyle";
import { CAL_KIND, draftFor, parts, writeEvidRules, type SaveCtx, type Saved } from "./creaSave";
import type { CreaData } from "./useCreaData";

export type EditCtx = Pick<SaveCtx, "tenantId" | "L" | "blockFiles" | "done" | "pair"> & {
    names: CreaData["names"];
    /** Chi gestisce il Calendario: solo lui cambia «in onda» (D189). */
    owner: boolean;
};

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

async function savePiatti(t: Tunnel, orig: Tunnel, tenantId: string) {
    const id = t.edit!.id;
    // i piatti aggiunti o tolti cambiano come il contenuto si salva: il tipo lo decidono loro (D187)
    const dishes = hasDishes(t) ? t.dishes : [];
    if ((t.evType ?? "annuncio") !== (orig.evType ?? "annuncio")) {
        // l'aspetto (`layout_style`) il tunnel non lo sceglie: cambiando tipo resta quello che c'era
        const fields: Partial<FeaturedContent> = deriveTypeFields({ type: EV[t.evType ?? "annuncio"].type, bundlePrice: t.bundle, showOriginalTotal: t.showOrig, showImages: false });
        delete fields.layout_style;
        await updateFeaturedContent(id, tenantId, fields);
    }
    const rows = await listFeaturedContentProducts(id, tenantId);
    const have = new Set(rows.map(r => r.product_id));
    await syncFeaturedContentProducts(
        id,
        tenantId,
        rows.filter(r => !dishes.includes(r.product_id)).map(r => r.id),
        dishes.filter(d => !have.has(d)).map(productId => ({ productId, sortOrder: dishes.indexOf(productId) }))
    );
    const after = await listFeaturedContentProducts(id, tenantId);
    const order = after.map(r => ({ id: r.id, sort_order: dishes.indexOf(r.product_id) })).filter(r => r.sort_order >= 0);
    if (order.some(r => after.find(a => a.id === r.id)?.sort_order !== r.sort_order)) await updateFeaturedContentProductsSortOrder(order, tenantId);
    if (t.evType === "bundle") await updateFeaturedContent(id, tenantId, { bundle_price: parsePrice(t.bundle), show_original_total: t.showOrig });
    else if (t.evType === "promo")
        for (const r of after) {
            const n = t.notes[r.product_id]?.trim() || null;
            if (n !== (r.note?.trim() || null)) await updateFeaturedContentProductNote(r.id, tenantId, n);
        }
}

async function saveStoria(t: Tunnel, orig: Tunnel, c: EditCtx, onda: boolean) {
    const id = t.edit!.id;
    const patch: StoryUpdateInput = {};
    let fresh: string | null = null;
    if (changed(t, "racconto")) {
        patch.eyebrow = t.kicker.trim() || null;
        patch.title = thingName(t);
        if (t.cover) patch.cover_media = fresh = await uploadStoryImage(c.tenantId, id, await compressImage(t.cover, COMPRESS_PROFILES.cover));
        else if (orig.coverUrl && !t.coverUrl) patch.cover_media = null;
    }
    // di cosa parla (D191): il prodotto o la sede. Cambiando solo il prodotto, la sede di prima resta
    if (changed(t, "tema")) {
        patch.product_id = t.about === "prod" ? t.linked || null : null;
        if (t.about === "loc") patch.activity_id = t.sede || null;
        else if (orig.about !== "prod") patch.activity_id = null;
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
    // in onda o pronta (D189): la storia non ha regole, lo dice il suo stato
    if (onda) patch.status = t.onda === "off" ? "draft" : "published";
    try {
        await updateStory(id, c.tenantId, patch);
    } catch (e) {
        // la copertina appena caricata non la usa nessuno
        if (fresh) await deleteStoryImageBestEffort(c.tenantId, id, fresh).catch(() => {});
        throw e;
    }
    // quella di prima non serve più
    if (orig.coverUrl && patch.cover_media !== undefined) await deleteStoryImageBestEffort(c.tenantId, id, orig.coverUrl).catch(() => {});
}

/**
 * Il quando e il dove (D189). In onda: si riscrive la sua regola del Calendario,
 * come da lì, e se era spenta si riaccende; senza regola, ne nasce una.
 * Tenuto pronto: la sua voce si spegne e resta nel Calendario, con sedi e ore.
 */
async function saveQuando(t: Tunnel, c: EditCtx) {
    const ed = t.edit!, id = ed.id, kind = t.kind as "menu" | "stile" | "evid";
    const rules = await listLayoutRules(c.tenantId);
    const e = ed.ruleId ? allEntriesOf(kind, id, { rules, names: c.names }).find(x => x.ruleId === ed.ruleId) : undefined;
    if (ed.ruleId && !e) throw new Error("la regola non c'è più");
    const shared = kind === "evid" && !!e && e.rule.featured_contents.length > 1;
    if (t.onda === "off") {
        if (!e) return;
        if (!shared) return updateScheduleEnabled(e.ruleId, false);
        // la regola la divide con altri contenuti: ne fa una sua, spenta, e lascia l'altra
        await writeEvidRules(ed.orig, c, id, thingName(t), false);
        return dropDraft(draftFromEntry(e, c.L, id));
    }
    if (kind === "evid" && ed.orig.onda !== "on") await updateFeaturedContent(id, c.tenantId, { status: "published" });
    if (!e) {
        if (kind === "evid") await writeEvidRules(t, c, id, thingName(t), true);
        else await saveDraft(draftFor(t, CAL_KIND[kind], id, c.pair), c.L, c.tenantId, parts(c, "rule:" + id));
        return;
    }
    const D = draftFromEntry(e, c.L, shared ? id : null);
    D.when = cloneWhen(effWhen(t));
    D.where = { all: t.where.all, activityIds: [...t.where.activityIds], groupIds: [...t.where.groupIds] };
    D.per = clonePer(t.per);
    // «Riprova»: con più orari per sede, le regole già nate non si rifanno
    await saveDraft(D, c.L, c.tenantId, parts(c, "rule:" + id));
}

export async function saveEdit(t: Tunnel, c: EditCtx): Promise<Saved> {
    const e = t.edit!, orig = e.orig, id = e.id, name = thingName(t);
    const dove = changed(t, "dove") || changed(t, "quando");
    if (t.kind === "menu") {
        if (changed(t, "parti")) await updateCatalog(id, c.tenantId, { name });
        if (changed(t, "sezioni")) await saveSezioni(t.sections, orig.sections, id, c.tenantId, c.done);
    } else if (t.kind === "stile") {
        // i colori e i caratteri fanno una versione nuova dello stile; il solo nome no
        if (changed(t, "nome") || changed(t, "aspetto")) await updateStyle(id, changed(t, "nome") ? name : undefined, changed(t, "aspetto") ? styleConfig(t) : undefined, c.tenantId);
    } else if (t.kind === "evid") {
        if (changed(t, "contenuto")) await saveContenuto(t, orig, c.tenantId);
        if (changed(t, "piatti")) await savePiatti(t, orig, c.tenantId);
    } else {
        // la storia non ha regole: in onda o pronta lo dice il suo stato («In onda?»)
        const onda = changed(t, "onda");
        if (changed(t, "tema") || changed(t, "racconto") || changed(t, "blocchi") || onda) await saveStoria(t, orig, c, onda);
    }
    // chi non gestisce il Calendario non cambia dove e quando (non ha il passo)
    if (dove && c.owner && t.kind !== "storia") await saveQuando(t, c);
    return { id, name, live: t.onda === "on", ruleId: e.ruleId };
}
