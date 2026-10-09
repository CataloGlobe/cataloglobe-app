// Salvare la bozza della sezione sul database di oggi, con le funzioni che usa
// già l'editor della regola: si crea la bozza della regola, poi la si scrive.
import {
    createRuleDraft,
    deleteLayoutRule,
    updateRule,
    type LayoutRule,
    type RuleType
} from "@/services/supabase/layoutScheduling";
import { createFeaturedRuleDraft, updateFeaturedRule } from "@/services/supabase/featuredScheduling";
import { updateScheduleTargets } from "@/services/supabase/scheduleTargets";
import { ruleDateToIso } from "@/utils/ruleDetailForm";
import { autoName, priceKeys, timeFields, whenKey, whereKey, type Draft, type DraftLookups } from "./calendarDraft";
import { whenOfRule, whereOfRule } from "./calendarModel";

const RULE_TYPE: Record<Draft["kind"], RuleType> = { menu: "layout", style: "layout", price: "price", visibility: "visibility", featured: "featured" };

type Target = { applyToAll: boolean; activityIds: string[]; groupIds: string[] };

async function writeTargets(id: string, t: Target) {
    // la RPC rifiuta «tutte» e l'elenco vuoto: in quei casi non si chiama
    if (t.applyToAll) return;
    if (t.activityIds.length) await updateScheduleTargets(id, t.activityIds.map(targetId => ({ targetType: "activity" as const, targetId })));
    else if (t.groupIds.length) await updateScheduleTargets(id, t.groupIds.map(targetId => ({ targetType: "activity_group" as const, targetId })));
}

const targetOf = (D: Draft): Target => ({ applyToAll: D.where.all, activityIds: D.where.all ? [] : D.where.activityIds, groupIds: D.where.all ? [] : D.where.groupIds });

function timeOf(D: Draft) {
    const t = timeFields(D.when);
    return { ...t, startAt: ruleDateToIso(t.startDay, "start"), endAt: ruleDateToIso(t.endDay, "end") };
}

type Products = { price: { productId: string; optionValueId: string | null; overridePrice: number; showOriginalPrice: boolean }[]; visibility: { productId: string; mode: "hide" | "disable" }[] };

function draftProducts(D: Draft, L: DraftLookups): Products {
    const price: Products["price"] = [], visibility: Products["visibility"] = [];
    for (const id of D.picks) {
        if (D.kind === "price") {
            const p = L.products.get(id);
            for (const k of priceKeys(p, id)) {
                const fid = k.includes(":") ? k.split(":")[1] : null;
                price.push({ productId: id, optionValueId: fid, overridePrice: D.prices[k] ?? 0, showOriginalPrice: D.strike });
            }
        } else visibility.push({ productId: id, mode: D.hide });
    }
    return { price, visibility };
}

const ruleProducts = (r: LayoutRule, skip: string | null): Products => ({
    price: r.price_overrides
        .filter(o => o.product_id !== skip)
        .map(o => ({ productId: o.product_id, optionValueId: o.option_value_id ?? null, overridePrice: o.override_price, showOriginalPrice: o.show_original_price })),
    visibility: r.visibility_overrides.filter(o => o.product_id !== skip).map(o => ({ productId: o.product_id, mode: o.mode }))
});

/** Scrive la regola `id` com'è nella bozza (tempo, sedi, cosa). */
async function writeRule(id: string, tenantId: string, D: Draft, name: string, products: Products, contents: LayoutRule["featured_contents"]) {
    const t = timeOf(D), tg = targetOf(D);
    if (D.kind === "featured") {
        await updateFeaturedRule({
            id,
            tenantId,
            name,
            enabled: true,
            startAt: t.startAt,
            endAt: t.endAt,
            timeFrom: t.timeFrom,
            timeTo: t.timeTo,
            daysOfWeek: t.daysOfWeek,
            alwaysActive: t.alwaysActive,
            targetMode: tg.applyToAll ? "all" : tg.activityIds.length ? "activities" : "groups",
            activityIds: tg.activityIds,
            groupIds: tg.groupIds,
            featuredContents: contents.map(c => ({ featured_content_id: c.featured_content_id, slot: c.slot, sort_order: c.sort_order }))
        });
    } else {
        await updateRule({
            scheduleId: id,
            tenantId,
            ruleType: RULE_TYPE[D.kind],
            name,
            ...tg,
            enabled: true,
            timeMode: t.timeMode,
            daysOfWeek: t.daysOfWeek,
            timeFrom: t.timeFrom,
            timeTo: t.timeTo,
            startAt: t.startAt,
            endAt: t.endAt,
            ...(D.kind === "menu" ? { layout: { catalogId: D.thing, styleId: D.pair } } : {}),
            ...(D.kind === "style" ? { layout: { catalogId: D.pair, styleId: D.thing } } : {}),
            ...(D.kind === "price" ? { priceProducts: products.price } : {}),
            ...(D.kind === "visibility" ? { visibilityProductOverrides: products.visibility } : {})
        });
    }
    await writeTargets(id, tg);
}

async function createFor(tenantId: string, D: Draft, name: string): Promise<string> {
    return D.kind === "featured" ? createFeaturedRuleDraft({ tenantId, name }) : createRuleDraft({ tenantId, ruleType: RULE_TYPE[D.kind], name });
}

/** Riscrive la regola di partenza senza la voce `only` (o la toglie, se era l'ultima). */
async function leaveOut(r: LayoutRule, D: Draft) {
    const only = D.only!;
    if (D.kind === "featured") {
        const left = r.featured_contents.filter(c => c.featured_content_id !== only);
        if (!left.length) return deleteLayoutRule(r.id);
    } else {
        const left = ruleProducts(r, only);
        if (!(D.kind === "price" ? left.price : left.visibility).length) return deleteLayoutRule(r.id);
    }
    const keep: Draft = { ...D, when: whenOfRule(r), where: whereOfRule(r), thing: null };
    const left = ruleProducts(r, only);
    await writeRule(r.id, r.tenant_id, keep, r.name ?? "", left, r.featured_contents.filter(c => c.featured_content_id !== only));
}

/**
 * Salva la bozza. In modifica di una voce sola: se tempo e sedi restano quelli,
 * si riscrive la regola; se cambiano, la voce esce dalla regola e ne fa una sua.
 */
export async function saveDraft(D: Draft, L: DraftLookups, tenantId: string): Promise<void> {
    const name = D.name?.trim() || autoName(D, L);
    const r = D.rule;
    const contentOf = (id: string, base?: LayoutRule["featured_contents"][number]) => ({
        featured_content_id: id,
        featured_content_title: null,
        slot: base?.slot ?? ("before_catalog" as const),
        sort_order: base?.sort_order ?? 0
    });

    if (r && D.only) {
        const same = whenKey(D.when) === whenKey(whenOfRule(r)) && whereKey(D.where) === whereKey(whereOfRule(r));
        if (same) {
            if (D.kind === "featured") {
                const cs = r.featured_contents.map(c => (c.featured_content_id === D.only ? { ...c, featured_content_id: D.thing! } : c));
                const keep: Draft = { ...D };
                return writeRule(r.id, r.tenant_id, keep, r.name ?? "", { price: [], visibility: [] }, cs);
            }
            const mine = draftProducts(D, L), rest = ruleProducts(r, D.only);
            const drop = <T extends { productId: string }>(xs: T[]) => xs.filter(x => !D.picks.includes(x.productId));
            return writeRule(r.id, r.tenant_id, D, r.name ?? "", { price: [...drop(rest.price), ...mine.price], visibility: [...drop(rest.visibility), ...mine.visibility] }, []);
        }
        const id = await createFor(tenantId, D, name);
        await writeRule(id, tenantId, D, name, draftProducts(D, L), D.kind === "featured" ? [contentOf(D.thing!, r.featured_contents.find(c => c.featured_content_id === D.only))] : []);
        await leaveOut(r, D);
        return;
    }

    if (r) {
        const cs = D.kind === "featured" ? (r.featured_contents.length ? r.featured_contents.map(c => ({ ...c, featured_content_id: D.thing! })) : [contentOf(D.thing!)]) : [];
        return writeRule(r.id, r.tenant_id, D, name, draftProducts(D, L), cs);
    }

    const id = await createFor(tenantId, D, name);
    await writeRule(id, tenantId, D, name, draftProducts(D, L), D.kind === "featured" ? [contentOf(D.thing!)] : []);
}

/** «Togli dal calendario» dalla sezione: la voce sola, o tutta la regola. */
export async function dropDraft(D: Draft): Promise<void> {
    if (!D.rule) return;
    if (D.only) return leaveOut(D.rule, D);
    await deleteLayoutRule(D.rule.id);
}

