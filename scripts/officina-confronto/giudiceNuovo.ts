// Il giudice nuovo (piano 9b, passo 3) nella forma `Giudice` dello strumento,
// per confrontarlo con quello di oggi sulla stessa fotografia.
//
// Legge le fasce vere (`schedule_slots`, `schedule_slot_targets`), le regole
// `menu` e `style` con `overlap_mode` e `on_air_since`, la scelta per sede di
// `schedule_targets.overlap_mode`. Le regole `layout` restano una sola per sede
// con l'ordine di oggi (D83).
//
// Cosa vede il cliente, nella stessa forma di `cosaVede` perché il confronto
// segni solo i cambi veri:
// - layout: i menù in onda (gli id dei cataloghi, separati da virgola) e lo stile;
// - prezzi e visibilità: le regole attive («regola:a+b»), nell'ordine di precedenza;
// - in evidenza: i contenuti pubblicati di tutte le regole attive, una volta sola.
// Con una sola regola attiva per strato il testo è identico a quello di oggi.

import {
    judge,
    type CompetitionRuleType,
    type JudgeRule,
    type JudgeRuleType,
    type JudgeSlot,
    type OverlapMode
} from "../../supabase/functions/_shared/scheduleCompetition";
import type { SlotTarget, SnapshotConFasce } from "./fasce";
import type { Giudice, GiudiceContesto, Snapshot, SnapshotFeaturedLink } from "./model";

/** Le colonne della fase (a) che la fotografia legge in più. */
export type SnapshotNuovo = SnapshotConFasce & {
    schedule_extra?: { id: string; on_air_since: string; overlap_mode: OverlapMode | null }[];
    target_overlaps?: {
        schedule_id: string;
        target_type: "activity" | "activity_group";
        target_id: string;
        overlap_mode: OverlapMode;
    }[];
    menus?: { schedule_id: string; catalog_id: string }[];
    styles?: { schedule_id: string; style_id: string }[];
};

type NuovoCache = {
    rulesByTenant: Map<string, JudgeRule[]>;
    menuOf: Map<string, string | null>;
    styleOf: Map<string, string | null>;
};

const caches = new WeakMap<GiudiceContesto, NuovoCache>();

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
}

export function buildJudgeRules(snapshot: Snapshot): NuovoCache {
    const snap = snapshot as SnapshotNuovo;
    const extra = new Map((snap.schedule_extra ?? []).map(e => [e.id, e]));
    const targets = new Map<string, Snapshot["targets"]>();
    for (const t of snap.targets) push(targets, t.schedule_id, t);
    const slotTargets = new Map<string, SlotTarget[]>();
    for (const t of snap.slot_targets ?? []) push(slotTargets, t.slot_id, t);
    const slots = new Map<string, JudgeSlot[]>();
    for (const s of snap.slots ?? []) {
        const st = slotTargets.get(s.id) ?? [];
        push(slots, s.schedule_id, {
            id: s.id,
            days_of_week: s.days_of_week,
            start_minute: s.start_minute,
            end_minute: s.end_minute,
            activityIds: st.filter(t => t.target_type === "activity").map(t => t.target_id),
            groupIds: st.filter(t => t.target_type === "activity_group").map(t => t.target_id)
        });
    }
    const overlaps = new Map<string, NonNullable<SnapshotNuovo["target_overlaps"]>>();
    for (const o of snap.target_overlaps ?? []) push(overlaps, o.schedule_id, o);

    const menuOf = new Map<string, string | null>();
    const styleOf = new Map<string, string | null>();
    for (const l of snap.layouts) {
        menuOf.set(l.schedule_id, l.catalog_id);
        styleOf.set(l.schedule_id, l.style_id);
    }
    for (const m of snap.menus ?? []) menuOf.set(m.schedule_id, m.catalog_id);
    for (const s of snap.styles ?? []) styleOf.set(s.schedule_id, s.style_id);

    const rulesByTenant = new Map<string, JudgeRule[]>();
    for (const s of snap.schedules) {
        const ts = targets.get(s.id) ?? [];
        const ov = overlaps.get(s.id) ?? [];
        const e = extra.get(s.id);
        const type = s.rule_type as JudgeRuleType;
        const rule: JudgeRule = {
            id: s.id,
            rule_type: type,
            enabled: s.enabled,
            priority: s.priority,
            created_at: s.created_at,
            on_air_since: e?.on_air_since ?? s.created_at,
            time_mode: s.time_mode,
            start_at: s.start_at,
            end_at: s.end_at,
            applyToAll: s.apply_to_all,
            activityIds: s.apply_to_all ? [] : ts.filter(t => t.target_type === "activity").map(t => t.target_id),
            groupIds: s.apply_to_all ? [] : ts.filter(t => t.target_type === "activity_group").map(t => t.target_id),
            slots: slots.get(s.id) ?? [],
            overlap_mode: e?.overlap_mode ?? null,
            overlapByActivity: Object.fromEntries(
                ov.filter(o => o.target_type === "activity").map(o => [o.target_id, o.overlap_mode])
            ),
            overlapByGroup: Object.fromEntries(
                ov.filter(o => o.target_type === "activity_group").map(o => [o.target_id, o.overlap_mode])
            )
        };
        if (type === "layout" || type === "menu") rule.hasMenu = (menuOf.get(s.id) ?? null) !== null;
        if (type === "layout" || type === "style") rule.hasStyle = (styleOf.get(s.id) ?? null) !== null;
        push(rulesByTenant, s.tenant_id, rule);
    }
    return { rulesByTenant, menuOf, styleOf };
}

function cacheFor(ctx: GiudiceContesto): NuovoCache {
    let cache = caches.get(ctx);
    if (!cache) {
        cache = buildJudgeRules(ctx.snapshot);
        caches.set(ctx, cache);
    }
    return cache;
}

function featuredOf(ctx: GiudiceContesto, ruleIds: string[]): string {
    const seen = new Set<string>();
    const links: SnapshotFeaturedLink[] = [];
    for (const id of ruleIds) {
        for (const l of ctx.featuredBySchedule.get(id) ?? []) {
            if (l.status !== "published" || seen.has(l.featured_content_id)) continue;
            seen.add(l.featured_content_id);
            links.push(l);
        }
    }
    if (links.length === 0) return "nessun contenuto";
    // Come `cosaVede`: prima quelli sopra il menù, poi quelli sotto.
    const rank = (l: SnapshotFeaturedLink) => (l.slot === "before_catalog" ? 0 : 1);
    return links
        .map((l, i) => ({ l, i }))
        .sort((a, b) => rank(a.l) - rank(b.l) || a.i - b.i)
        .map(({ l }) => `${l.slot === "before_catalog" ? "sopra" : "sotto"}:${l.featured_content_id}`)
        .join(" ");
}

export const giudiceNuovo: Giudice = (ctx, activity, now) => {
    const { rulesByTenant, menuOf, styleOf } = cacheFor(ctx);
    const rules = rulesByTenant.get(activity.tenant_id) ?? [];
    const v = judge(rules, { activityId: activity.id, groupIds: activity.group_ids }, now);
    const result = {} as ReturnType<Giudice>;

    const menuIds = v.menus.map(e => e.rule.id);
    const catalogs = v.menus.map(e => menuOf.get(e.rule.id) ?? "-").sort();
    const style = v.style ? (styleOf.get(v.style.rule.id) ?? "-") : "-";
    result.layout = {
        regola: menuIds[0] ?? null,
        cosa: menuIds.length === 0 && !v.style ? "-" : `menu:${catalogs.join(",") || "-"} stile:${style}`,
        altre: v.coveredMenus.map(e => e.rule.id)
    };

    const stacked = (type: Exclude<CompetitionRuleType, "layout">) => {
        const list = v[type].map(e => e.rule.id);
        return {
            regola: list[0] ?? null,
            cosa:
                list.length === 0 ? "-" : type === "featured" ? featuredOf(ctx, list) : `regola:${list.join("+")}`,
            altre: list.slice(1)
        };
    };
    result.price = stacked("price");
    result.visibility = stacked("visibility");
    result.featured = stacked("featured");
    return result;
};
