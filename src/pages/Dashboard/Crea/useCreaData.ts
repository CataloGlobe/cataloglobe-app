import { useCallback, useEffect, useMemo, useState } from "react";
import { listLayoutRuleOptions, listLayoutRules, type LayoutRule, type LayoutRuleOption } from "@/services/supabase/layoutScheduling";
import { listCatalogProductPairs } from "@/services/supabase/catalogs";
import { listActivityIdsByGroup } from "@/services/supabase/activity-groups";
import { listBaseProductsForPickerWithCategory } from "@/services/supabase/products";
import { listStyles, type V2Style } from "@/services/supabase/styles";
import { listFeaturedContentPositions } from "@/services/supabase/featuredContents";
import { NEW_MODEL } from "@/pages/Dashboard/Programming/calendar/calendarFlags";
import type { DraftLookups, PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { CalNames } from "@/pages/Dashboard/Programming/calendar/calendarModel";

export type CreaData = {
    rules: LayoutRule[];
    names: CalNames;
    /** `off`: la sede è sospesa (la pagina pubblica non mostra il catalogo). */
    sedi: { id: string; name: string; off?: true }[];
    groups: { id: string; name: string; activityIds: string[] }[];
    groupIdsByActivity: Record<string, string[]>;
    groupNames: Map<string, string>;
    formatNames: Map<string, string>;
    pickList: PickProduct[];
    catalogs: LayoutRuleOption[];
    styles: V2Style[];
    /** Oggi menù e stile vanno in coppia: quelli della regola di base, sempre e per tutte. */
    base: { catalogId: string; styleId: string } | null;
    systemStyleId: string | null;
    /** In quali menù sta ogni prodotto (gli id dei menù): la storia di un prodotto si vede lì. */
    menusOf: Map<string, string[]>;
    /** L'ordine salvato dei contenuti in evidenza, sede per sede (col database nuovo; altrimenti vuoto). */
    positions: Record<string, Record<string, number>>;
    L: DraftLookups;
};

/**
 * Quello che serve ai tunnel, letto una volta: le regole e le cose del
 * Calendario (per il Quando, il Dove e la settimana), i piatti, gli stili.
 */
export function useCreaData(tenantId: string | null | undefined) {
    const [raw, setRaw] = useState<{
        rules: LayoutRule[];
        activities: LayoutRuleOption[];
        groups: LayoutRuleOption[];
        catalogs: LayoutRuleOption[];
        products: LayoutRuleOption[];
        featured: LayoutRuleOption[];
        idsByGroup: Record<string, string[]>;
        pick: Awaited<ReturnType<typeof listBaseProductsForPickerWithCategory>>;
        styles: V2Style[];
        pairs: Awaited<ReturnType<typeof listCatalogProductPairs>>;
        positions: Record<string, Record<string, number>>;
    } | null>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        if (!tenantId) return;
        setFailed(false);
        try {
            const [rules, opts, pick, styles, pairs, positions] = await Promise.all([
                listLayoutRules(tenantId),
                listLayoutRuleOptions(tenantId),
                listBaseProductsForPickerWithCategory(tenantId),
                listStyles(tenantId),
                listCatalogProductPairs(tenantId),
                // dove la tabella non c'è ancora (produzione) l'ordine resta quello delle regole
                NEW_MODEL.evid ? listFeaturedContentPositions(tenantId).catch(() => ({})) : {}
            ]);
            const groups = opts.activityGroups.filter(g => !g.is_system);
            const idsByGroup = groups.length ? await listActivityIdsByGroup(groups.map(g => g.id)) : {};
            setRaw({
                rules,
                activities: opts.activities,
                groups,
                catalogs: opts.catalogs,
                products: opts.products,
                featured: opts.featuredContents,
                idsByGroup,
                pick,
                pairs,
                positions,
                styles: styles.filter(st => st.is_active !== false)
            });
        } catch (error) {
            console.error("[Crea] dati non caricati:", error);
            setFailed(true);
        }
    }, [tenantId]);

    useEffect(() => {
        void load();
    }, [load]);

    const data = useMemo<CreaData | null>(() => {
        if (!raw) return null;
        const formats = new Map(raw.products.map(p => [p.id, p.format_values ?? []]));
        const pickList: PickProduct[] = raw.pick.map(p => ({
            id: p.id,
            name: p.name,
            category: p.category_name,
            listPrice: p.base_price,
            formats: formats.get(p.id) ?? []
        }));
        const names: CalNames = {
            catalogs: new Map(raw.catalogs.map(c => [c.id, c.name])),
            styles: new Map(raw.styles.map(c => [c.id, c.name])),
            featured: new Map(raw.featured.map(c => [c.id, c.name])),
            products: new Map(raw.products.map(c => [c.id, c.name]))
        };
        const groupIdsByActivity: Record<string, string[]> = {};
        for (const [g, ids] of Object.entries(raw.idsByGroup)) for (const id of ids) (groupIdsByActivity[id] ??= []).push(g);
        const sedi = raw.activities.map(a => ({ id: a.id, name: a.name, ...(a.status === "inactive" ? { off: true as const } : {}) }));
        const groupNames = new Map(raw.groups.map(g => [g.id, g.name]));
        const baseRule = raw.rules.find(
            r =>
                r.enabled &&
                r.rule_type === "layout" &&
                r.applyToAll &&
                r.time_mode === "always" &&
                !r.start_at &&
                !r.end_at &&
                r.layout?.catalog_id &&
                r.layout?.style_id
        );
        const menusOf = new Map<string, string[]>();
        for (const x of raw.pairs) {
            const l = menusOf.get(x.product_id);
            if (!l) menusOf.set(x.product_id, [x.catalog_id]);
            else if (!l.includes(x.catalog_id)) l.push(x.catalog_id);
        }
        return {
            menusOf,
            positions: raw.positions,
            rules: raw.rules,
            names,
            sedi,
            groups: raw.groups.map(g => ({ id: g.id, name: g.name, activityIds: raw.idsByGroup[g.id] ?? [] })),
            groupIdsByActivity,
            groupNames,
            formatNames: new Map(raw.products.flatMap(p => (p.format_values ?? []).map(v => [v.id, v.name] as const))),
            pickList,
            catalogs: raw.catalogs,
            styles: raw.styles,
            base: baseRule?.layout ? { catalogId: baseRule.layout.catalog_id!, styleId: baseRule.layout.style_id! } : null,
            systemStyleId: raw.styles.find(st => st.is_system)?.id ?? null,
            L: {
                products: new Map(pickList.map(p => [p.id, p])),
                catalogs: names.catalogs,
                styles: names.styles,
                featured: names.featured,
                sedi: new Map(sedi.map(x => [x.id, x.name])),
                groups: groupNames,
                multi: sedi.length > 1
            }
        };
    }, [raw]);

    return { data, failed, reload: load };
}
