// Modificare una cosa già creata (D140): la si legge dal database e la si mette
// nel tunnel com'è oggi. Quello che il tunnel non sa mostrare (le varianti dei
// prodotti che avete già, i token fini dello stile, l'inquadratura delle foto) non si tocca:
// `saveEdit` scrive solo le differenze.
import { getCatalog, listCategories, listCategoryProducts } from "@/services/supabase/catalogs";
import { getFeaturedContentById, listFeaturedContentProducts } from "@/services/supabase/featuredContents";
import { getStory } from "@/services/supabase/stories";
import { getStyle, type V2Style } from "@/services/supabase/styles";
import { entriesFromRules, whenOfRule, whereOfRule, type CalEntry } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { EV, asEdit, cloneWhen, key, newTunnel, type CreaKind, type EvType, type Section, type Tunnel } from "./creaModel";
import { aspectOf, tokensOf } from "./creaStyle";
import type { CreaData } from "./useCreaData";

const ALL = { all: true, activityIds: [], groupIds: [] };

export type Loaded = { t: Tunnel; style: V2Style | null };

/** Lo stile di CataloGlobe non si modifica: se ne fa una copia. */
export class SystemStyleError extends Error {}

/** Le voci del Calendario che mettono in onda questa cosa. */
export function entriesOf(kind: CreaKind, id: string, data: Pick<CreaData, "rules" | "names">): CalEntry[] {
    if (kind === "storia") return [];
    return entriesFromRules(data.rules, data.names).filter(e =>
        kind === "menu"
            ? e.kind === "menu" && e.rule.layout?.catalog_id === id
            : kind === "stile"
              ? e.kind === "style" && e.rule.layout?.style_id === id
              : e.kind === "featured" && e.id === `${e.ruleId}:featured:${id}`
    );
}

async function loadMenu(t: Tunnel, id: string, tenantId: string, data: CreaData) {
    const [catalog, cats, links] = await Promise.all([getCatalog(id, tenantId), listCategories(tenantId, id), listCategoryProducts(tenantId, id)]);
    t.menuType = "classico";
    t.name = catalog.name;
    const kids = (parent: string | null) => cats.filter(c => c.parent_category_id === parent).sort((a, b) => a.sort_order - b.sort_order);
    const walk = (parent: string | null): Section[] =>
        kids(parent).map(c => ({
            key: key(),
            id: c.id,
            sort: c.sort_order,
            name: c.name,
            dishes: links
                .filter(l => l.category_id === c.id)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(l => {
                    const pid = l.variant_product_id ?? l.product_id;
                    const p = data.L.products.get(pid);
                    return { key: key(), linkId: l.id, sort: l.sort_order, productId: pid, ...(l.variant_product_id ? { parentId: l.product_id } : {}), name: p?.name ?? data.names.products.get(pid) ?? "Prodotto", price: p?.listPrice ?? null };
                }),
            subs: walk(c.id)
        }));
    t.sections = walk(null);
}

async function loadStile(t: Tunnel, id: string, tenantId: string): Promise<V2Style> {
    const st = await getStyle(id, tenantId);
    if (!st) throw new Error("stile non trovato");
    if (st.is_system) throw new SystemStyleError();
    const tk = tokensOf(st);
    t.name = st.name;
    t.base = "copy";
    t.baseStyleId = id;
    t.color = tk.colors.primary;
    Object.assign(t, aspectOf(tk));
    return st;
}

const EV_OF = Object.fromEntries((Object.keys(EV) as EvType[]).map(k => [EV[k].type, k])) as Record<string, EvType>;

async function loadEvid(t: Tunnel, id: string, tenantId: string) {
    const [c, rows] = await Promise.all([getFeaturedContentById(id, tenantId), listFeaturedContentProducts(id, tenantId)]);
    t.evType = EV_OF[c.content_type] ?? "annuncio";
    t.title = c.title ?? "";
    t.sub = c.subtitle ?? "";
    t.inner = c.internal_name && c.internal_name !== c.title ? c.internal_name : "";
    t.text = c.description ?? "";
    t.imageUrl = c.media_id ?? null;
    t.cta = !!(c.cta_text || c.cta_url);
    if (t.cta) {
        t.ctaText = c.cta_text ?? "";
        t.ctaLink = c.cta_url ?? "";
    }
    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
    t.dishes = sorted.map(r => r.product_id);
    t.notes = Object.fromEntries(sorted.filter(r => r.note).map(r => [r.product_id, r.note!]));
    t.bundle = c.bundle_price == null ? "" : String(c.bundle_price).replace(".", ",");
    t.showOrig = !!c.show_original_total;
}

async function loadStoria(t: Tunnel, id: string, tenantId: string) {
    const st = await getStory(id, tenantId);
    t.kicker = st.eyebrow ?? "";
    t.title = st.title;
    t.coverUrl = st.cover_media;
    t.linked = st.product_id ?? "";
    t.blocks = st.body_blocks ?? [];
    if (st.activity_id) t.where = { all: false, activityIds: [st.activity_id], groupIds: [] };
}

export async function loadTunnel(kind: CreaKind, id: string, tenantId: string, data: CreaData): Promise<Loaded> {
    const t = newTunnel(kind, ALL);
    let style: V2Style | null = null;
    if (kind === "menu") await loadMenu(t, id, tenantId, data);
    else if (kind === "stile") style = await loadStile(t, id, tenantId);
    else if (kind === "evid") await loadEvid(t, id, tenantId);
    else await loadStoria(t, id, tenantId);

    // il quando e il dove sono quelli della sua regola, se è una sola
    const es = entriesOf(kind, id, data);
    const one = es.length === 1 ? es[0] : null;
    if (one) {
        const w = cloneWhen(whenOfRule(one.rule)), where = whereOfRule(one.rule);
        t.when = w;
        t.qmode = w.period || w.days || w.ranges ? "momenti" : "sempre";
        t.where = { all: where.all, activityIds: [...where.activityIds], groupIds: [...where.groupIds] };
        if (kind === "evid") t.slot = one.rule.featured_contents.find(c => c.featured_content_id === id)?.slot === "after_catalog" ? "after" : "before";
    }
    return { t: asEdit(t, id, { id: one?.ruleId ?? null, count: es.length }), style };
}
