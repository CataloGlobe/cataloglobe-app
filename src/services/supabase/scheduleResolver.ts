// ⚠️ SYNC: questo file è duplicato. L'altra copia è in supabase/functions/_shared/scheduleResolver.ts.
// Qualsiasi modifica va replicata in ENTRAMBI i file: le due copie differiscono
// solo per questa intestazione e per i percorsi degli import qui sotto.
// La scelta di chi vince NON vive qui: è in _shared/scheduleCompetition.ts,
// file unico importato da entrambe. Qui restano le query.

import {
    isTimeRuleActiveNow,
    judge,
    activeWindowToday,
    laterMenusToday,
    temporalScore,
    type CompetitionSpecificity,
    type JudgeEntry,
    type JudgeRule,
    type JudgeRuleType,
    type JudgeSlot,
    type OverlapMode,
    type RomeDateTime
} from "@shared/scheduleCompetition";
import { romeInstantAtMinute } from "./schedulingNow";

export { isTimeRuleActiveNow };

export type VisibilityMode = "hide" | "disable";

/** I tipi che un chiamante chiede: «layout» porta con sé le regole `menu` e `style`. */
type RuleType = "layout" | "price" | "visibility" | "featured";
type RuleSpecificity = CompetitionSpecificity;

const JUDGE_TYPES_FOR: Record<RuleType, JudgeRuleType[]> = {
    layout: ["layout", "menu", "style"],
    price: ["price"],
    visibility: ["visibility"],
    featured: ["featured"]
};

type TimeRuleRow = {
    id: string;
    rule_type: JudgeRuleType;
    priority: number;
    created_at: string;
    on_air_since?: string | null;
    overlap_mode?: OverlapMode | null;
    time_mode: "always" | "window";
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
    start_at: string | null;
    end_at: string | null;
};

type RawActivityGroupMemberRow = {
    group_id: string;
};

type RawScheduleTargetRow = {
    schedule_id: string;
    target_id?: string;
};

type RawRuleTargetRow = {
    id: string;
    schedule_id: string;
    target_type: "activity" | "activity_group";
    target_id: string;
    overlap_mode: OverlapMode | null;
};

type RawSlotRow = {
    id: string;
    schedule_id: string;
    days_of_week: number[] | null;
    start_minute: number;
    end_minute: number;
    sort_order: number | null;
};

type RawSlotTargetRow = {
    slot_id: string;
    schedule_target_id: string;
};

type RawStyle = {
    id: string;
    name: string;
    current_version:
        | {
              config: unknown;
          }
        | Array<{
              config: unknown;
          }>
        | null;
};

type RawLayoutValue = {
    catalog_id: string | null;
    style?: RawStyle | RawStyle[] | null;
};

type RawLayoutRuleRow = {
    id: string;
    layout: RawLayoutValue | RawLayoutValue[] | null;
};

type RawMenuRow = {
    schedule_id: string;
    catalog_id: string | null;
};

type RawStyleRuleRow = {
    schedule_id: string;
    style_id: string | null;
    style?: RawStyle | RawStyle[] | null;
};

type CandidateInfo = {
    rows: JudgeRule[];
    /** Gruppi di cui la sede fa parte (activity_group_members). */
    seatGroupIds: string[];
};

type SupabaseLike = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => any;
};

export type ResolveRulesForActivityParams = {
    supabase: SupabaseLike;
    activityId: string;
    tenantId: string;
    now: RomeDateTime;
    includeLayoutStyle?: boolean;
    /** Anche i menù di più tardi oggi (`menus` con `state: "later"`): serve alla pagina pubblica. */
    includeLaterMenus?: boolean;
    ruleTypes?: RuleType[];
};

export type ResolvedStyleData = {
    id: string;
    name: string;
    config?: unknown;
};

/** Un menù della sede oggi, come lo decide il giudice. */
export type ResolvedMenuRule = {
    scheduleId: string;
    catalogId: string;
    /** `now`: si vede adesso; `later`: solo oggi, più tardi. */
    state: "now" | "later";
    /** La fascia di oggi che lo mostra, in minuti da questa mezzanotte (la fine può passare 1440). */
    startMinute: number;
    endMinute: number;
    /** `catalogs.sort_order`; 0 quando la sede ha un menù solo (non serve a niente). */
    sortOrder: number;
};

export type ResolveRulesForActivityResult = {
    /**
     * Il primo menù in onda per `catalogs.sort_order` e lo stile che vince.
     * Chi legge un menù solo (ordini, PDF, pannello) resta su questo.
     */
    layout: {
        catalogId: string | null;
        scheduleId: string | null;
        styleData?: ResolvedStyleData;
    };
    /** I menù in onda adesso (per `sort_order`), poi quelli di più tardi oggi (per ora d'inizio). */
    menus: ResolvedMenuRule[];
    /** La regola che dà lo stile (layout o style). */
    styleScheduleId: string | null;
    /** Numero di regole layout e menu enabled=true associate alla sede, PRIMA del
     *  filtro temporale — distingue "nessuna regola mai configurata" da "regole
     *  configurate ma nessuna vince ora" (dayparting). Vedi
     *  `resolveActivityCatalogs.ts` → `hasConfiguredCatalogRule`. */
    layoutCandidateCount: number;
    /** La prima di `priceRuleIds` (chi legge una regola sola). */
    priceRuleId: string | null;
    /** Le regole di prezzi attive, si sommano: per lo stesso piatto vince la prima che lo tocca. */
    priceRuleIds: string[];
    visibilityRule: {
        scheduleId: string;
        mode: VisibilityMode;
    } | null;
    visibilityRules: Array<{
        scheduleId: string;
        mode: VisibilityMode;
    }>;
    featuredRule: {
        scheduleId: string;
    } | null;
    /** Le regole in evidenza attive: i contenuti di tutte, una volta sola. */
    featuredRuleIds: string[];
    debug?: {
        candidatesCount: number;
        selectedLayoutRuleId: string | null;
        selectedLayoutRuleSpecificity: RuleSpecificity | null;
        selectedPriceRuleId: string | null;
        selectedPriceRuleSpecificity: RuleSpecificity | null;
        selectedVisibilityRuleId: string | null;
        selectedVisibilityRuleSpecificity: RuleSpecificity | null;
        selectedFeaturedRuleId: string | null;
        selectedFeaturedRuleSpecificity: RuleSpecificity | null;
    };
};

const TIME_RULE_SELECT = `
    id,
    rule_type,
    priority,
    created_at,
    on_air_since,
    overlap_mode,
    time_mode,
    days_of_week,
    time_from,
    time_to,
    start_at,
    end_at
`;

/**
 * Resolver contract:
 * - Chi vince: `judge` in _shared/scheduleCompetition.ts (fonte unica). Fasce
 *   (`schedule_slots`, `schedule_slot_targets`), menù «insieme» / «al posto»,
 *   stile, prezzi / disponibilità / in evidenza che si sommano. Le regole
 *   `layout` fra loro tengono l'ordine di oggi (D83): sede, orari più
 *   stretti, priorità, created_at, id.
 * - Time: uses `now` passed by caller; caller must provide Europe/Rome-normalized
 *   "now" when evaluating runtime behavior.
 * - Targets:
 *   apply_to_all=true means global scope and wins over any malformed specific
 *   target attached to the same schedule id (defensive hardening).
 *   apply_to_all=false requires at least one explicit target match to participate.
 */

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isMissingColumnError(error: unknown, column: string): boolean {
    if (!error || typeof error !== "object") return false;
    const message = String((error as { message?: string }).message ?? "").toLowerCase();
    const needle = column.toLowerCase();
    return (
        message.includes(needle) &&
        (message.includes("column") ||
            message.includes("schema cache") ||
            message.includes("does not exist"))
    );
}

function styleDataOf(style: RawStyle | null): ResolvedStyleData | undefined {
    if (!style) return undefined;
    const version = normalizeOne(style.current_version);
    return {
        id: style.id,
        name: style.name,
        ...(version?.config ? { config: version.config } : {})
    };
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
}

async function listCandidateRulesForActivity(
    supabase: SupabaseLike,
    ruleTypes: JudgeRuleType[],
    activityId: string,
    tenantId: string
): Promise<CandidateInfo> {
    const groupMembersRes = await supabase
        .from("activity_group_members")
        .select("group_id")
        .eq("activity_id", activityId);
    if (groupMembersRes.error) throw groupMembersRes.error;

    const groupIds = Array.from(
        new Set(
            ((groupMembersRes.data ?? []) as RawActivityGroupMemberRow[]).map(row => row.group_id)
        )
    );

    let applyAllRows: TimeRuleRow[] = [];
    const applyAllRes = await supabase
        .from("schedules")
        .select(TIME_RULE_SELECT)
        .eq("tenant_id", tenantId)
        .in("rule_type", ruleTypes)
        .eq("enabled", true)
        .eq("apply_to_all", true);
    if (applyAllRes.error) {
        if (!isMissingColumnError(applyAllRes.error, "apply_to_all")) {
            throw applyAllRes.error;
        }
    } else {
        applyAllRows = (applyAllRes.data ?? []) as TimeRuleRow[];
    }
    const applyAllIds = new Set(applyAllRows.map(row => row.id));

    // Candidate selection is schedule_targets-only (passo 3): the inline
    // target_type/target_id columns are no longer read here. apply_to_all
    // still wins over any specific target on the same schedule: those rows
    // are read as global (specificityFor in scheduleCompetition).
    const activityTargetIds = new Set<string>();
    const activityTargetsRes = await supabase
        .from("schedule_targets")
        .select("schedule_id")
        .eq("target_type", "activity")
        .eq("target_id", activityId);
    if (activityTargetsRes.error) throw activityTargetsRes.error;
    for (const row of (activityTargetsRes.data ?? []) as RawScheduleTargetRow[]) {
        activityTargetIds.add(row.schedule_id);
    }

    const groupTargetIdsBySchedule = new Map<string, string[]>();
    if (groupIds.length > 0) {
        const groupTargetsRes = await supabase
            .from("schedule_targets")
            .select("schedule_id, target_id")
            .eq("target_type", "activity_group")
            .in("target_id", groupIds);
        if (groupTargetsRes.error) throw groupTargetsRes.error;
        for (const row of (groupTargetsRes.data ?? []) as RawScheduleTargetRow[]) {
            const current = groupTargetIdsBySchedule.get(row.schedule_id) ?? [];
            if (row.target_id) current.push(row.target_id);
            groupTargetIdsBySchedule.set(row.schedule_id, current);
        }
    }

    const targetedIds = new Set<string>([...activityTargetIds, ...groupTargetIdsBySchedule.keys()]);
    let targetedRows: TimeRuleRow[] = [];
    if (targetedIds.size > 0) {
        const targetedRes = await supabase
            .from("schedules")
            .select(TIME_RULE_SELECT)
            .eq("tenant_id", tenantId)
            .in("rule_type", ruleTypes)
            .eq("enabled", true)
            .in("id", Array.from(targetedIds));
        if (targetedRes.error) throw targetedRes.error;
        targetedRows = (targetedRes.data ?? []) as TimeRuleRow[];
    }

    const toCandidate = (row: TimeRuleRow, applyToAll: boolean): JudgeRule => ({
        id: row.id,
        rule_type: row.rule_type,
        enabled: true,
        priority: row.priority,
        created_at: row.created_at,
        on_air_since: row.on_air_since ?? row.created_at,
        time_mode: row.time_mode,
        start_at: row.start_at,
        end_at: row.end_at,
        applyToAll,
        activityIds: activityTargetIds.has(row.id) ? [activityId] : [],
        groupIds: groupTargetIdsBySchedule.get(row.id) ?? [],
        slots: [],
        overlap_mode: row.overlap_mode ?? null,
        // Le layout si ordinano ancora come oggi (D83), coi punti delle colonne di oggi.
        ...(row.rule_type === "layout" ? { todayTemporalScore: temporalScore(row) } : {})
    });

    const rowsById = new Map<string, JudgeRule>();
    for (const row of applyAllRows) {
        rowsById.set(row.id, toCandidate(row, true));
    }
    for (const row of targetedRows) {
        if (applyAllIds.has(row.id)) continue;
        rowsById.set(row.id, toCandidate(row, false));
    }

    return { rows: Array.from(rowsById.values()), seatGroupIds: groupIds };
}

/**
 * Fasce (M1), sedi delle fasce (M2) e scelta dell'incrocio per sede (M5) delle
 * regole candidate. Una regola senza fasce vale tutto il giorno, ogni giorno:
 * il ponte (mig 20261014090000) le scrive per ogni regola «Fascia».
 */
export async function attachSlotsAndOverlaps(
    supabase: SupabaseLike,
    rules: Array<Partial<Pick<JudgeRule, "slots" | "overlapByActivity" | "overlapByGroup">> & { id: string }>
): Promise<void> {
    if (rules.length === 0) return;
    const ids = rules.map(rule => rule.id);
    const [slotsRes, targetsRes] = await Promise.all([
        supabase
            .from("schedule_slots")
            .select("id, schedule_id, days_of_week, start_minute, end_minute, sort_order")
            .in("schedule_id", ids),
        supabase
            .from("schedule_targets")
            .select("id, schedule_id, target_type, target_id, overlap_mode")
            .in("schedule_id", ids)
    ]);
    if (slotsRes.error) throw slotsRes.error;
    if (targetsRes.error) throw targetsRes.error;
    const slotRows = ((slotsRes.data ?? []) as RawSlotRow[])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id));
    const targetRows = (targetsRes.data ?? []) as RawRuleTargetRow[];
    const targetById = new Map(targetRows.map(row => [row.id, row]));

    const slotTargetsBySlot = new Map<string, RawSlotTargetRow[]>();
    if (slotRows.length > 0) {
        const slotTargetsRes = await supabase
            .from("schedule_slot_targets")
            .select("slot_id, schedule_target_id")
            .in(
                "slot_id",
                slotRows.map(row => row.id)
            );
        if (slotTargetsRes.error) throw slotTargetsRes.error;
        for (const row of (slotTargetsRes.data ?? []) as RawSlotTargetRow[]) {
            pushTo(slotTargetsBySlot, row.slot_id, row);
        }
    }

    const slotsBySchedule = new Map<string, JudgeSlot[]>();
    for (const row of slotRows) {
        const targets = (slotTargetsBySlot.get(row.id) ?? [])
            .map(link => targetById.get(link.schedule_target_id))
            .filter((target): target is RawRuleTargetRow => target !== undefined);
        pushTo(slotsBySchedule, row.schedule_id, {
            id: row.id,
            days_of_week: row.days_of_week,
            start_minute: row.start_minute,
            end_minute: row.end_minute,
            activityIds: targets.filter(t => t.target_type === "activity").map(t => t.target_id),
            groupIds: targets.filter(t => t.target_type === "activity_group").map(t => t.target_id)
        });
    }
    const overlapsBySchedule = new Map<string, RawRuleTargetRow[]>();
    for (const row of targetRows) {
        if (row.overlap_mode) pushTo(overlapsBySchedule, row.schedule_id, row);
    }

    for (const rule of rules) {
        rule.slots = slotsBySchedule.get(rule.id) ?? [];
        const overlaps = overlapsBySchedule.get(rule.id) ?? [];
        if (overlaps.length === 0) continue;
        rule.overlapByActivity = Object.fromEntries(
            overlaps.filter(o => o.target_type === "activity").map(o => [o.target_id, o.overlap_mode as OverlapMode])
        );
        rule.overlapByGroup = Object.fromEntries(
            overlaps
                .filter(o => o.target_type === "activity_group")
                .map(o => [o.target_id, o.overlap_mode as OverlapMode])
        );
    }
}

async function getVisibilityModeForSchedule(
    supabase: SupabaseLike,
    scheduleId: string,
    tenantId: string
): Promise<VisibilityMode> {
    const { data, error } = await supabase
        .from("schedules")
        .select("visibility_mode")
        .eq("tenant_id", tenantId)
        .eq("id", scheduleId)
        .maybeSingle();

    if (error) {
        if (isMissingColumnError(error, "visibility_mode")) return "hide";
        throw error;
    }

    const value = (data as { visibility_mode?: string | null } | null)?.visibility_mode;
    return value === "disable" ? "disable" : "hide";
}

const STYLE_EMBED = `
    style:styles(
        id,
        name,
        current_version:style_versions!styles_current_version_id_fkey(
            config
        )
    )
`;

function buildLayoutSelect(includeLayoutStyle: boolean): string {
    return `
        id,
        layout:schedule_layout!schedule_layout_schedule_id_fkey(
            catalog_id${includeLayoutStyle ? `,${STYLE_EMBED}` : ""}
        )
    `;
}

/** Cosa porta ogni regola: il menù (layout, menu) e lo stile (layout, style). */
type RulePayload = {
    catalogId: string | null;
    /** Solo se il chiamante ha chiesto lo stile (`includeLayoutStyle`). */
    style: RawStyle | null;
    hasStyle: boolean;
};

async function loadPayloads(
    supabase: SupabaseLike,
    rules: JudgeRule[],
    tenantId: string,
    includeLayoutStyle: boolean
): Promise<Map<string, RulePayload>> {
    const idsOf = (type: JudgeRuleType) => rules.filter(rule => rule.rule_type === type).map(rule => rule.id);
    const layoutIds = idsOf("layout");
    const menuIds = idsOf("menu");
    const styleIds = idsOf("style");
    const [layoutRes, menuRes, styleRes] = await Promise.all([
        layoutIds.length > 0
            ? supabase
                  .from("schedules")
                  .select(buildLayoutSelect(includeLayoutStyle))
                  .eq("tenant_id", tenantId)
                  .in("id", layoutIds)
            : Promise.resolve({ data: [], error: null }),
        menuIds.length > 0
            ? supabase.from("schedule_menu").select("schedule_id, catalog_id").in("schedule_id", menuIds)
            : Promise.resolve({ data: [], error: null }),
        styleIds.length > 0
            ? supabase
                  .from("schedule_style")
                  .select(`schedule_id, style_id${includeLayoutStyle ? `,${STYLE_EMBED}` : ""}`)
                  .in("schedule_id", styleIds)
            : Promise.resolve({ data: [], error: null })
    ]);
    if (layoutRes.error) throw layoutRes.error;
    if (menuRes.error) throw menuRes.error;
    if (styleRes.error) throw styleRes.error;

    const payloads = new Map<string, RulePayload>();
    for (const row of (layoutRes.data ?? []) as RawLayoutRuleRow[]) {
        const layout = normalizeOne(row.layout);
        const style = normalizeOne(layout?.style);
        payloads.set(row.id, { catalogId: layout?.catalog_id ?? null, style, hasStyle: style !== null });
    }
    for (const row of (menuRes.data ?? []) as RawMenuRow[]) {
        payloads.set(row.schedule_id, { catalogId: row.catalog_id, style: null, hasStyle: false });
    }
    for (const row of (styleRes.data ?? []) as RawStyleRuleRow[]) {
        payloads.set(row.schedule_id, {
            catalogId: null,
            style: normalizeOne(row.style),
            hasStyle: row.style_id !== null
        });
    }

    for (const rule of rules) {
        const payload = payloads.get(rule.id);
        if (rule.rule_type === "layout" || rule.rule_type === "menu") {
            rule.hasMenu = (payload?.catalogId ?? null) !== null;
        }
        // Lo stile di una layout si conosce solo se il chiamante l'ha chiesto;
        // altrimenti la regola conta come se l'avesse (lo stile non serve).
        if (rule.rule_type === "style" || (rule.rule_type === "layout" && includeLayoutStyle)) {
            rule.hasStyle = payload?.hasStyle ?? false;
        }
    }
    return payloads;
}

async function loadCatalogSortOrders(
    supabase: SupabaseLike,
    catalogIds: string[],
    tenantId: string
): Promise<Map<string, number>> {
    const { data, error } = await supabase
        .from("catalogs")
        .select("id, sort_order")
        .eq("tenant_id", tenantId)
        .in("id", catalogIds);
    if (error) throw error;
    return new Map(
        ((data ?? []) as Array<{ id: string; sort_order: number | null }>).map(row => [
            row.id,
            row.sort_order ?? Number.MAX_SAFE_INTEGER
        ])
    );
}

export async function resolveRulesForActivity(
    params: ResolveRulesForActivityParams
): Promise<ResolveRulesForActivityResult> {
    const {
        supabase,
        activityId,
        tenantId,
        now,
        includeLayoutStyle = false,
        includeLaterMenus = false,
        ruleTypes
    } = params;
    const requestedTypes = ruleTypes ?? (["layout", "price", "visibility", "featured"] as RuleType[]);
    const judgeTypes = Array.from(new Set(requestedTypes.flatMap(type => JUDGE_TYPES_FOR[type])));

    const candidates = await listCandidateRulesForActivity(supabase, judgeTypes, activityId, tenantId);
    const rules = candidates.rows;
    // Fasce e payload servono prima del giudice: una regola senza menù non
    // vince, passa la successiva.
    const [, payloads] = await Promise.all([
        attachSlotsAndOverlaps(supabase, rules),
        loadPayloads(supabase, rules, tenantId, includeLayoutStyle)
    ]);

    const seat = { activityId, groupIds: candidates.seatGroupIds };
    const verdict = judge(rules, seat, now);

    // Menù: quelli in onda adesso, poi quelli di più tardi oggi.
    type MenuDraft = Omit<ResolvedMenuRule, "sortOrder"> & { rank: number };
    const drafts: MenuDraft[] = [];
    const seenCatalogs = new Set<string>();
    const addMenu = (entry: JudgeEntry, state: "now" | "later", startMinute: number, endMinute: number) => {
        const catalogId = payloads.get(entry.rule.id)?.catalogId ?? null;
        // Due regole con lo stesso menù: un riquadro solo, quello della prima.
        if (!catalogId || seenCatalogs.has(catalogId)) return;
        seenCatalogs.add(catalogId);
        drafts.push({ scheduleId: entry.rule.id, catalogId, state, startMinute, endMinute, rank: drafts.length });
    };
    for (const entry of verdict.menus) {
        const window = activeWindowToday(entry.rule, seat, now);
        addMenu(entry, "now", window.startMinute, window.endMinute);
    }
    if (includeLaterMenus && requestedTypes.includes("layout")) {
        for (const later of laterMenusToday(rules, seat, now, minute => romeInstantAtMinute(now, minute))) {
            addMenu(later.entry, "later", later.startMinute, later.endMinute);
        }
    }
    const sortOrders =
        drafts.length > 1
            ? await loadCatalogSortOrders(
                  supabase,
                  drafts.map(draft => draft.catalogId),
                  tenantId
              )
            : new Map<string, number>();
    const menus: ResolvedMenuRule[] = drafts
        .map(draft => ({ ...draft, sortOrder: sortOrders.get(draft.catalogId) ?? 0 }))
        .sort((a, b) => {
            if (a.state !== b.state) return a.state === "now" ? -1 : 1;
            if (a.state === "later" && a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
            return a.sortOrder - b.sortOrder || a.rank - b.rank;
        })
        .map(({ scheduleId, catalogId, state, startMinute, endMinute, sortOrder }) => ({
            scheduleId,
            catalogId,
            state,
            startMinute,
            endMinute,
            sortOrder
        }));
    const firstMenu = menus.find(menu => menu.state === "now") ?? null;
    const firstMenuEntry = firstMenu
        ? (verdict.menus.find(entry => entry.rule.id === firstMenu.scheduleId) ?? null)
        : null;

    const styleEntry = verdict.style;
    const styleData = styleEntry ? styleDataOf(payloads.get(styleEntry.rule.id)?.style ?? null) : undefined;

    const visibilityRules = await Promise.all(
        verdict.visibility.map(async entry => ({
            scheduleId: entry.rule.id,
            mode: await getVisibilityModeForSchedule(supabase, entry.rule.id, tenantId)
        }))
    );
    const priceRuleIds = verdict.price.map(entry => entry.rule.id);
    const featuredRuleIds = verdict.featured.map(entry => entry.rule.id);
    const firstPrice = verdict.price[0] ?? null;
    const firstVisibility = verdict.visibility[0] ?? null;
    const firstFeatured = verdict.featured[0] ?? null;

    return {
        layout: {
            catalogId: firstMenu?.catalogId ?? null,
            scheduleId: firstMenu?.scheduleId ?? null,
            ...(styleData ? { styleData } : {})
        },
        menus,
        styleScheduleId: styleEntry?.rule.id ?? null,
        layoutCandidateCount: verdict.candidates.layout.length + verdict.candidates.menu.length,
        priceRuleId: firstPrice?.rule.id ?? null,
        priceRuleIds,
        visibilityRule: visibilityRules[0] ?? null,
        visibilityRules,
        featuredRule: firstFeatured ? { scheduleId: firstFeatured.rule.id } : null,
        featuredRuleIds,
        debug: {
            candidatesCount: rules.length,
            selectedLayoutRuleId: firstMenu?.scheduleId ?? null,
            selectedLayoutRuleSpecificity: firstMenuEntry?.specificity ?? null,
            selectedPriceRuleId: firstPrice?.rule.id ?? null,
            selectedPriceRuleSpecificity: firstPrice?.specificity ?? null,
            selectedVisibilityRuleId: firstVisibility?.rule.id ?? null,
            selectedVisibilityRuleSpecificity: firstVisibility?.specificity ?? null,
            selectedFeaturedRuleId: firstFeatured?.rule.id ?? null,
            selectedFeaturedRuleSpecificity: firstFeatured?.specificity ?? null
        }
    };
}
