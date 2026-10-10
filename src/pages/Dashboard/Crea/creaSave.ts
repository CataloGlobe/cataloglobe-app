// Salvare quello che esce dal tunnel, con le funzioni che usano già le pagine
// (Menù, Stili, In evidenza, Storie) e, per la messa in onda, quelle del
// Calendario (`saveDraft`): la regola nasce come se la si aggiungesse da lì.
import { addProductToCategory, createCatalog, createCategory } from "@/services/supabase/catalogs";
import { createProduct } from "@/services/supabase/products";
import { createStyle } from "@/services/supabase/styles";
import {
    createFeaturedContent,
    listFeaturedContentProducts,
    syncFeaturedContentProducts,
    updateFeaturedContent,
    updateFeaturedContentProductNote,
    type FeaturedContent
} from "@/services/supabase/featuredContents";
import { createFeaturedRuleDraft, updateFeaturedRule } from "@/services/supabase/featuredScheduling";
import { updateScheduleTargets } from "@/services/supabase/scheduleTargets";
import { listLayoutRules, type LayoutRule } from "@/services/supabase/layoutScheduling";
import { createStory, updateStory } from "@/services/supabase/stories";
import { uploadFeaturedContentImage, uploadStoryImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { ruleDateToIso } from "@/utils/ruleDetailForm";
import { autoName, blankDraft, draftParts, timeFields, type Draft, type DraftLookups } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { saveDraft } from "@/pages/Dashboard/Programming/calendar/calendarSave";
import { whenOfRule, whereOfRule, type CalKind, type CalWhere } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { deriveTypeFields } from "@/pages/Dashboard/Highlights/featuredContentTypes";
import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { EV, clonePer, cloneWhen, effWhen, thingName, type Tunnel } from "./creaModel";
import { styleConfig } from "./creaStyle";

export const CAL_KIND: Record<"menu" | "stile" | "evid", CalKind> = { menu: "menu", stile: "style", evid: "featured" };

/** Quello che serve oltre al tunnel: chi salva, cosa c'è già, i file scelti. */
export type SaveCtx = {
    tenantId: string;
    L: DraftLookups;
    /** In onda (chi gestisce il Calendario, «Metti in onda» / «Pubblica») o da parte (bozza, o chi non lo gestisce). */
    live: boolean;
    /** Il compagno della regola: lo stile per un menù, il menù per uno stile. */
    pair: string | null;
    /** Lo stile da cui parte uno stile nuovo. */
    baseTokens: StyleTokenModel;
    /** I file dei blocchi immagine della storia, per id del blocco. */
    blockFiles: Record<string, File>;
};

export type Saved = { id: string; name: string; live: boolean; ruleId: string | null; productIds?: string[] };

/** La bozza del Calendario per la cosa appena creata: quando, dove, cosa. */
export function draftFor(t: Tunnel, kind: CalKind, thing: string, pair: string | null): Draft {
    const D = blankDraft(kind, t.where, pair);
    D.thing = thing;
    D.when = cloneWhen(effWhen(t));
    D.per = clonePer(t.per);
    D.insieme = kind === "menu" && !!t.insieme;
    return D;
}

/** I nomi del Calendario con dentro la cosa nuova, per il nome automatico della regola. */
export function withThing(L: DraftLookups, kind: CalKind, id: string, name: string): DraftLookups {
    if (kind === "menu") return { ...L, catalogs: new Map(L.catalogs).set(id, name) };
    if (kind === "style") return { ...L, styles: new Map(L.styles).set(id, name) };
    return { ...L, featured: new Map(L.featured).set(id, name) };
}

/** La regola appena scritta: `saveDraft` non la restituisce, la si ritrova. */
async function findRule(tenantId: string, match: (r: LayoutRule) => boolean): Promise<string | null> {
    const rules = await listLayoutRules(tenantId);
    const mine = rules.filter(match).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return mine[0]?.id ?? null;
}

/* ---------- il menù ---------- */
async function saveMenu(t: Tunnel, c: SaveCtx): Promise<Saved> {
    const name = thingName(t);
    const catalogId = t.importedId ?? (await createCatalog(c.tenantId, name)).id;
    const productIds = t.sections.flatMap(x => x.dishes.map(d => d.productId).filter((v): v is string => !!v));
    if (!t.importedId) {
        productIds.length = 0;
        for (const [i, sec] of t.sections.entries()) {
            const cat = await createCategory(c.tenantId, catalogId, sec.name.trim() || "Piatti", 1, null, i);
            for (const [j, d] of sec.dishes.entries()) {
                const productId = d.productId ?? (await createProduct(c.tenantId, { name: d.name.trim(), base_price: d.price })).id;
                await addProductToCategory(c.tenantId, catalogId, cat.id, productId, j);
                productIds.push(productId);
            }
        }
    }
    if (!c.live || !c.pair) return { id: catalogId, name, live: false, ruleId: null, productIds };
    await saveDraft(draftFor(t, "menu", catalogId, c.pair), withThing(c.L, "menu", catalogId, name), c.tenantId);
    const ruleId = await findRule(c.tenantId, r => r.layout?.catalog_id === catalogId);
    return { id: catalogId, name, live: true, ruleId, productIds };
}

/* ---------- lo stile ---------- */
async function saveStile(t: Tunnel, c: SaveCtx): Promise<Saved> {
    const name = thingName(t);
    const st = await createStyle(c.tenantId, name, styleConfig(t, c.baseTokens));
    if (!c.live || !c.pair) return { id: st.id, name, live: false, ruleId: null };
    const L = withThing(c.L, "style", st.id, name);
    const from = t.from;
    // arriva dal menù appena messo in onda, col suo stesso quando e dove: lo stile va nella sua regola
    if (from?.ruleId && sameAsFrom(t)) {
        const rules = await listLayoutRules(c.tenantId);
        const r = rules.find(x => x.id === from.ruleId);
        if (r) {
            const D = blankDraft("style", whereOfRule(r), r.layout?.catalog_id ?? from.catalogId);
            Object.assign(D, { mode: "edit", rule: r, thing: st.id, when: whenOfRule(r), name: r.name ?? null });
            await saveDraft(D, L, c.tenantId);
            return { id: st.id, name, live: true, ruleId: r.id };
        }
    }
    await saveDraft(draftFor(t, "style", st.id, c.pair), L, c.tenantId);
    return { id: st.id, name, live: true, ruleId: null };
}

/** Quando e dove sono rimasti quelli del menù da cui si è partiti. */
export function sameAsFrom(t: Tunnel): boolean {
    const f = t.from;
    // con le ore per sede le regole sono più d'una: lo stile fa le sue
    if (!f || t.per || f.per) return false;
    const key = (w: object) => JSON.stringify(w);
    const wk = (w: CalWhere) => key([w.all, [...w.activityIds].sort(), [...w.groupIds].sort()]);
    return key(cloneWhen(effWhen(t))) === key(cloneWhen(f.when)) && wk(t.where) === wk(f.where);
}

/* ---------- in evidenza ---------- */
async function aspectOfFile(f: File): Promise<number | null> {
    try {
        const b = await createImageBitmap(f);
        const r = b.width && b.height ? b.width / b.height : null;
        b.close();
        return r;
    } catch {
        return null;
    }
}

async function saveEvid(t: Tunnel, c: SaveCtx): Promise<Saved> {
    const name = thingName(t);
    const type = EV[t.evType ?? "annuncio"].type;
    const payload: Partial<FeaturedContent> = {
        title: name,
        internal_name: t.inner.trim() || name,
        subtitle: t.sub.trim() || null,
        description: t.text.trim() || null,
        cta_text: t.cta ? t.ctaText.trim() || null : null,
        cta_url: t.cta ? t.ctaLink.trim() || null : null,
        status: c.live ? "published" : "draft",
        ...deriveTypeFields({ type, bundlePrice: t.bundle, showOriginalTotal: t.showOrig, showImages: false })
    };
    const content = await createFeaturedContent(c.tenantId, payload);
    const id: string = content.id;
    if (t.evType === "promo" || t.evType === "bundle") {
        const dishes = t.dishes;
        if (dishes.length) {
            await syncFeaturedContentProducts(id, c.tenantId, [], dishes.map((productId, i) => ({ productId, sortOrder: i })));
            const notes = dishes.filter(d => t.notes[d]?.trim());
            if (t.evType === "promo" && notes.length) {
                const rows = await listFeaturedContentProducts(id, c.tenantId);
                for (const row of rows) {
                    const n = t.notes[row.product_id]?.trim();
                    if (n) await updateFeaturedContentProductNote(row.id, c.tenantId, n);
                }
            }
        }
    }
    if (t.image) {
        const file = await compressImage(t.image, COMPRESS_PROFILES.featured);
        const url = await uploadFeaturedContentImage(c.tenantId, id, file);
        await updateFeaturedContent(id, c.tenantId, { media_id: `${url}?t=${Date.now()}`, media_aspect_ratio: await aspectOfFile(file) });
    }
    if (!c.live) return { id, name, live: false, ruleId: null };

    // la regola: quella del Calendario, ma col posto scelto nel tunnel (sopra o sotto il menù);
    // con le ore diverse per sede, una per ogni orario (D145)
    let first: string | null = null;
    for (const D of draftParts(draftFor(t, "featured", id, null))) {
        const ruleName = autoName(D, withThing(c.L, "featured", id, name));
        const ruleId = await createFeaturedRuleDraft({ tenantId: c.tenantId, name: ruleName });
        const tf = timeFields(D.when), w = D.where;
        await updateFeaturedRule({
            id: ruleId,
            tenantId: c.tenantId,
            name: ruleName,
            enabled: true,
            startAt: ruleDateToIso(tf.startDay, "start"),
            endAt: ruleDateToIso(tf.endDay, "end"),
            timeFrom: tf.timeFrom,
            timeTo: tf.timeTo,
            daysOfWeek: tf.daysOfWeek,
            alwaysActive: tf.alwaysActive,
            targetMode: w.all ? "all" : w.activityIds.length ? "activities" : "groups",
            activityIds: w.all ? [] : w.activityIds,
            groupIds: w.all ? [] : w.groupIds,
            featuredContents: [{ featured_content_id: id, slot: t.slot === "after" ? "after_catalog" : "before_catalog", sort_order: 0 }]
        });
        // come in calendarSave: la RPC rifiuta «tutte» e l'elenco vuoto
        if (!w.all && w.activityIds.length) await updateScheduleTargets(ruleId, w.activityIds.map(targetId => ({ targetType: "activity" as const, targetId })));
        else if (!w.all && w.groupIds.length) await updateScheduleTargets(ruleId, w.groupIds.map(targetId => ({ targetType: "activity_group" as const, targetId })));
        first ??= ruleId;
    }
    return { id, name, live: true, ruleId: first };
}

/* ---------- la storia ---------- */
async function saveStoria(t: Tunnel, c: SaveCtx): Promise<Saved> {
    const name = thingName(t);
    const w = t.where;
    const story = await createStory(c.tenantId, {
        eyebrow: t.kicker.trim() || null,
        title: name,
        cover_media: null,
        product_id: t.linked || null,
        status: "draft",
        // oggi una storia va in tutte le sedi o in una (D124 4: il resto col database nuovo)
        activity_id: !w.all && w.activityIds.length === 1 && !w.groupIds.length ? w.activityIds[0] : null
    });
    let cover: string | null = null;
    if (t.cover) cover = await uploadStoryImage(c.tenantId, story.id, await compressImage(t.cover, COMPRESS_PROFILES.cover));
    const blocks = [];
    for (const b of t.blocks) {
        const f = c.blockFiles[b.id];
        if (b.type === "image" && f) blocks.push({ ...b, url: await uploadStoryImage(c.tenantId, `${story.id}/${b.id}`, await compressImage(f, COMPRESS_PROFILES.story)) });
        else if (b.type === "list") blocks.push({ ...b, items: b.items.filter(x => x.trim() !== "") });
        else blocks.push(b);
    }
    await updateStory(story.id, c.tenantId, { cover_media: cover, body_blocks: blocks, status: c.live ? "published" : "draft" });
    return { id: story.id, name, live: c.live, ruleId: null };
}

export function saveTunnel(t: Tunnel, c: SaveCtx): Promise<Saved> {
    return t.kind === "menu" ? saveMenu(t, c) : t.kind === "stile" ? saveStile(t, c) : t.kind === "evid" ? saveEvid(t, c) : saveStoria(t, c);
}
