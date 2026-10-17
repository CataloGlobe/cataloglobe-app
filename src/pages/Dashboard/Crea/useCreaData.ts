import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listLayoutRuleOptions, listLayoutRules, type LayoutRule, type LayoutRuleOption } from "@/services/supabase/layoutScheduling";
import { listCatalogProductPairs } from "@/services/supabase/catalogs";
import { listActivityIdsByGroup } from "@/services/supabase/activity-groups";
import { listBaseProductsForPickerWithCategory } from "@/services/supabase/products";
import { listStyles, type V2Style } from "@/services/supabase/styles";
import { listFeaturedContentPositions } from "@/services/supabase/featuredContents";
import { NEW_MODEL } from "@/pages/Dashboard/Programming/calendar/calendarFlags";
import type { DraftLookups, PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { CalNames } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { basePair } from "@/pages/Dashboard/Programming/calendar/baseRule";

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
    /** `menusOf` è arrivata: prima, vuota non vuol dire «in nessun menù». */
    menusReady: boolean;
    /** L'ordine salvato dei contenuti in evidenza, sede per sede (col database nuovo; altrimenti vuoto). */
    positions: Record<string, Record<string, number>>;
    L: DraftLookups;
};

type CreaRaw = {
    rules: LayoutRule[];
    activities: LayoutRuleOption[];
    groups: LayoutRuleOption[];
    catalogs: LayoutRuleOption[];
    products: LayoutRuleOption[];
    featured: LayoutRuleOption[];
    idsByGroup: Record<string, string[]>;
    pick: Awaited<ReturnType<typeof listBaseProductsForPickerWithCategory>>;
    styles: V2Style[];
    /** `null` finché non sono arrivate (si leggono dopo, a parte). */
    pairs: Awaited<ReturnType<typeof listCatalogProductPairs>> | null;
    positions: Record<string, Record<string, number>>;
};

/**
 * Quello che serve per aprire il tunnel. In quali menù sta ogni piatto arriva dopo,
 * a parte (`listCatalogProductPairs` legge a pagine tutte le coppie: con aziende
 * grandi rallentava l'apertura, review #473 punto 6); intanto `pairs` è `null`.
 */
export async function readCrea(tenantId: string): Promise<CreaRaw> {
    const [rules, opts, pick, styles, positions] = await Promise.all([
        listLayoutRules(tenantId),
        listLayoutRuleOptions(tenantId),
        listBaseProductsForPickerWithCategory(tenantId),
        listStyles(tenantId),
        // dove la tabella non c'è ancora (produzione) l'ordine resta quello delle regole
        NEW_MODEL.evid
            ? listFeaturedContentPositions(tenantId).catch((error: unknown) => {
                  console.warn("[Crea] ordine dei contenuti in evidenza non letto:", error);
                  return {};
              })
            : {}
    ]);
    const groups = opts.activityGroups.filter(g => !g.is_system);
    const idsByGroup = groups.length ? await listActivityIdsByGroup(groups.map(g => g.id)) : {};
    return {
        rules,
        activities: opts.activities,
        groups,
        catalogs: opts.catalogs,
        products: opts.products,
        featured: opts.featuredContents,
        idsByGroup,
        pick,
        pairs: null,
        positions,
        styles: styles.filter(st => st.is_active !== false)
    };
}

/**
 * Quello che serve ai tunnel, letto una volta: le regole e le cose del
 * Calendario (per il Quando, il Dove e la settimana), i piatti, gli stili.
 */
export function useCreaData(tenantId: string | null | undefined) {
    const [raw, setRaw] = useState<CreaRaw | null>(null);
    const [failed, setFailed] = useState(false);

    const loads = useRef(0);
    const load = useCallback(async () => {
        if (!tenantId) return;
        const n = ++loads.current;
        setFailed(false);
        try {
            const fresh = await readCrea(tenantId);
            if (n !== loads.current) return;
            // ricaricando, le coppie di prima restano finché non arrivano le nuove
            setRaw(r => ({ ...fresh, pairs: r?.pairs ?? null }));
            listCatalogProductPairs(tenantId)
                .then(pairs => void (n === loads.current && setRaw(r => (r ? { ...r, pairs } : r))))
                .catch((error: unknown) => console.error("[Crea] menù dei piatti non letti:", error));
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
        const menusOf = new Map<string, string[]>();
        for (const x of raw.pairs ?? []) {
            const l = menusOf.get(x.product_id);
            if (!l) menusOf.set(x.product_id, [x.catalog_id]);
            else if (!l.includes(x.catalog_id)) l.push(x.catalog_id);
        }
        return {
            menusOf,
            menusReady: raw.pairs !== null,
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
            base: basePair(raw.rules),
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
