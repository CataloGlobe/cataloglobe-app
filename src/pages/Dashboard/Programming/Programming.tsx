import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Calendar, ChevronDown, List, CalendarDays } from "lucide-react";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { BulkBar } from "@/components/ui/BulkBar/BulkBar";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Menu } from "@/components/ui/Menu";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { SplitButton, type SplitButtonAction } from "@/components/ui/SplitButton";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { useSedeScope, SCOPE_ALL } from "@/hooks/useSedeScope";
import { usePermissions } from "@/context/PermissionsContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnActivity, canDoOnAnyActivity } from "@/lib/permissions";
import { listActivityIdsByGroup } from "@/services/supabase/activity-groups";
import { PageGate } from "@/components/PageGate/PageGate";
import { supabase } from "@/services/supabase/client";
import {
    createRuleDraft,
    deleteLayoutRule,
    duplicateRule,
    listLayoutRuleOptions,
    listLayoutRules,
    updateScheduleEnabled,
    type LayoutRule,
    type LayoutRuleOption,
    type RuleType
} from "@/services/supabase/layoutScheduling";
import { createFeaturedRuleDraft } from "@/services/supabase/featuredScheduling";
import { RuleRow, type RuleInsight } from "./components/RuleRow";
import { HowItWorksLink, RuleTypeHelpModal } from "./components/RuleTypeHelpModal";
import { CalendarView } from "./components/CalendarView";
import {
    resolveRulesForActivity,
    type ResolveRulesForActivityResult
} from "@/services/supabase/scheduleResolver";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { isRuleCurrentlyActive } from "@/utils/ruleHelpers";
import { isLayoutRuleDraft } from "@/utils/scheduleDraft";
import { ruleReachesAnyActivity, describeZeroReach } from "@/utils/scheduleReach";
import { deriveScheduleStatus } from "@/utils/scheduleStatus";
import { formatInactiveReason } from "@/utils/activityStatus";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { ruleTypeLabel } from "./ruleTypeLabel";
import styles from "./Programming.module.scss";

type RuleTypeFilter = RuleType | "all";

type DailyTimelineBlock = {
    startMinutes: number;
    endMinutes: number;
    layoutCatalogId: string | null;
    layoutScheduleId: string | null;
    priceRuleId: string | null;
    visibilityScheduleId: string | null;
    visibilityMode: "hide" | "disable" | null;
    featuredScheduleId: string | null;
    layoutSpecificity: number | null;
    priceSpecificity: number | null;
    visibilitySpecificity: number | null;
};

type RuleTypeOption = { value: RuleTypeFilter; label: string; description: string };

/** I valori del filtro per tipo, col nome del verticale (§22, dizionario #12). */
function ruleTypeOptions(catalogLabel: string): RuleTypeOption[] {
    const menu = catalogLabel.toLowerCase();
    return [
        { value: "layout", label: ruleTypeLabel("layout", catalogLabel), description: `Decidono quale ${menu} e quale stile mostrare` },
        { value: "featured", label: ruleTypeLabel("featured", catalogLabel), description: "Programmano quando mostrare contenuti in evidenza" },
        { value: "price", label: ruleTypeLabel("price", catalogLabel), description: "Cambiano il prezzo di alcuni prodotti" },
        { value: "visibility", label: ruleTypeLabel("visibility", catalogLabel), description: "Nascondono alcuni prodotti, o li segnano come non disponibili" },
        { value: "all", label: "Tutte", description: "Tutte le regole, di ogni tipo." }
    ];
}

/**
 * Copy dell'empty state "vuoto assoluto", uno per tab. Volutamente separato da
 * `ruleTypeOptions().description`: quella riga resta come sottotitolo sopra
 * la lista, e riusarla qui la mostrerebbe due volte identica nella stessa
 * schermata. Qui il testo spiega a cosa serve il tipo di regola e qual è la
 * prima mossa; là descrive la tab in una riga.
 */
const emptyStateCopy = (menu: string): Record<RuleTypeFilter, { title: string; description: string }> => ({
    layout: {
        title: "Decidi cosa mostrare, e quando",
        description:
            `Una regola sceglie il ${menu} e lo stile da mostrare in una sede, in una finestra di tempo: colazione fino alle 11, cena dalle 19. Senza finestra, vale sempre.`
    },
    featured: {
        title: "Fai comparire promozioni, eventi e avvisi",
        description:
            `Scegli il contenuto da mettere in risalto e il periodo in cui deve apparire: compare e sparisce da solo, sopra o sotto il ${menu}.`
    },
    price: {
        title: "Applica uno sconto per un giorno o un periodo",
        description:
            "Happy hour del giovedì, promozione di agosto: il prodotto resta uno, cambia solo il prezzo nel periodo che scegli."
    },
    visibility: {
        title: "Gestisci i prodotti finiti o fuori stagione",
        description:
            "Puoi nasconderlo del tutto o lasciarlo visibile segnandolo come non disponibile, per una sede o in certi orari."
    },
    all: {
        title: "Le regole decidono cosa vedono i clienti, e quando",
        description:
            `${menu.charAt(0).toUpperCase()}${menu.slice(1)} e stile, contenuti in risalto, sconti e disponibilità: ogni regola vale per una sede e una finestra di tempo.`
    }
});

const DAILY_TIMELINE_STEP_MINUTES = 30;


function getRuleTargetLabel(rule: LayoutRule, activityById: Map<string, LayoutRuleOption>): string {
    if (rule.target_type === "activity_group") {
        if (rule.target_group?.is_system) return "Tutte le sedi";
        return rule.target_group?.name ?? rule.target_id;
    }

    return activityById.get(rule.target_id)?.name ?? rule.target_id;
}

function toDateTimeLocalValue(date: Date): string {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

function getSpecificityLabel(value: number | null) {
    if (value === 2) return "Sede";
    if (value === 1) return "Gruppo di sedi";
    if (value === 0) return "Tutte le sedi";
    return "-";
}

function getRuleDisplayName(rule: LayoutRule, catalogLabel: string): string {
    return (rule.name ?? `${ruleTypeLabel(rule.rule_type, catalogLabel)} · ${rule.id.slice(0, 6)}`).trim();
}

function compareSpecificityFirst(a: LayoutRule, b: LayoutRule, specA: number, specB: number): number {
    if (specA !== specB) return specB - specA;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const createdDelta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (createdDelta !== 0) return createdDelta;
    return a.id.localeCompare(b.id);
}

function compareCandidateSpecificityFirst(
    a: { rule: LayoutRule; specificity: 0 | 1 | 2 },
    b: { rule: LayoutRule; specificity: 0 | 1 | 2 }
): number {
    return compareSpecificityFirst(a.rule, b.rule, a.specificity, b.specificity);
}


function formatMinutesToHourLabel(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60)
        .toString()
        .padStart(2, "0");
    const m = (totalMinutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
}

/* ─── RuleBlock ──────────────────────────────────────────────── */

interface RuleBlockProps {
    title: string;
    count: number;
    subtitle?: string;
    collapsible?: boolean;
    open?: boolean;
    onToggle?: (open: boolean) => void;
    children: React.ReactNode;
}

function RuleBlock({
    title,
    count,
    subtitle,
    collapsible = false,
    open: controlledOpen,
    onToggle,
    children
}: RuleBlockProps) {
    const isOpen = collapsible ? (controlledOpen ?? true) : true;

    const header = (
        <div
            className={styles.ruleBlockHeader}
            role={collapsible ? "button" : undefined}
            tabIndex={collapsible ? 0 : undefined}
            onClick={collapsible ? () => onToggle?.(!isOpen) : undefined}
            onKeyDown={collapsible ? e => { if (e.key === "Enter") onToggle?.(!isOpen); } : undefined}
        >
            <div className={styles.ruleBlockHeaderLeft}>
                <div className={styles.ruleBlockHeaderText}>
                    <div className={styles.ruleBlockTitleRow}>
                        <Text variant="body-sm" weight={700}>{title}</Text>
                        <span className={styles.ruleBlockCount}>{count}</span>
                    </div>
                    {subtitle && (
                        <Text variant="caption" colorVariant="muted">{subtitle}</Text>
                    )}
                </div>
            </div>
            {collapsible && (
                <span className={styles.ruleBlockChevron}>
                    <ChevronDown size={14} style={isOpen ? undefined : { transform: "rotate(-90deg)" }} />
                </span>
            )}
        </div>
    );

    /* Etichette colonna: stessa grid delle righe dati via `--rule-row-grid`,
       ereditata da `.ruleBlock`. Le celle vuote (pallino stato, checkbox)
       servono solo a far cadere "Regola" e "Target" sulla loro colonna;
       toggle e menu azioni non hanno etichetta e restano fuori. */
    const columnLabels = (
        <div className={styles.ruleColumnHeader} aria-hidden="true">
            <span />
            <span />
            <span>Regola</span>
            <span>Dove si applica</span>
        </div>
    );

    return (
        <div className={styles.ruleBlock}>
            {header}
            {isOpen && (
                <>
                    {columnLabels}
                    {children}
                </>
            )}
        </div>
    );
}


export default function Programming() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const currentTenantId = useTenantId();
    const { showToast } = useToast();
    const { catalogLabel } = useVerticalConfig();
    const typeOptions = useMemo(() => ruleTypeOptions(catalogLabel), [catalogLabel]);
    const emptyCopy = useMemo(() => emptyStateCopy(catalogLabel.toLowerCase()), [catalogLabel]);
    const sedeScope = useSedeScope();
    const { permissions } = usePermissions();
    // `canEdit` usa la stessa allowlist (trialing|active|past_due) di
    // VALID_SUBSCRIPTION_STATUSES in resolve-public-catalog: se è false la
    // pagina pubblica risponde `subscription_inactive`.
    const { canEdit } = useSubscriptionGuard();
    const subscriptionInactive = !canEdit;

    const [rules, setRules] = useState<LayoutRule[]>([]);
    const [activities, setActivities] = useState<LayoutRuleOption[]>([]);
    const [activityGroups, setActivityGroups] = useState<LayoutRuleOption[]>([]);
    const [catalogs, setCatalogs] = useState<LayoutRuleOption[]>([]);
    const [stylesOptions, setStylesOptions] = useState<LayoutRuleOption[]>([]);
    const [activityIdsByGroupId, setActivityIdsByGroupId] = useState<Record<string, string[]>>({});

    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isSimulatorDrawerOpen, setIsSimulatorDrawerOpen] = useState(false);
    // Spiegazione "Come funziona": puramente on-demand, nessuno stato persistito.
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
    const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
    const [updatingRules, setUpdatingRules] = useState<Set<string>>(new Set());

    const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
    const [searchTerm, setSearchTerm] = useState("");
    // Filtro sede deriva da useSedeScope (navbar). SCOPE_ALL → nessun filtro.
    const filterActivityId = sedeScope.value === SCOPE_ALL ? null : sedeScope.value;
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "scheduling.write") : false;
    // Stessa regola di PageGate: sulla sede del filtro, se c'è.
    const canRead = permissions
        ? filterActivityId
            ? canDoOnActivity(permissions, "scheduling.read", filterActivityId)
            : canDoOnAnyActivity(permissions, "scheduling.read")
        : false;
    const typeFromUrl = searchParams.get("type") as RuleType | null;
    const [ruleTypeFilter, setRuleTypeFilter] = useState<RuleTypeFilter>(
        typeFromUrl && ["layout", "featured", "price", "visibility", "all"].includes(typeFromUrl)
            ? (typeFromUrl as RuleTypeFilter)
            : "layout"
    );
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
    const handleRuleTypeFilterChange = useCallback((next: RuleTypeFilter) => {
        setRuleTypeFilter(next);
        setSelectedRuleIds(new Set());
        setIsHelpModalOpen(false);
        setSearchParams(prev => {
            prev.set("type", next);
            return prev;
        }, { replace: true });
    }, [setSearchParams]);

    /* Un solo link "Come funziona" è montato per volta (sopra la lista, oppure
       in uno dei due empty state): un ref solo basta per restituirgli il focus. */
    const helpTriggerRef = useRef<HTMLButtonElement | null>(null);
    const [returnHelpFocus, setReturnHelpFocus] = useState(true);

    const openHelpModal = useCallback(() => {
        setReturnHelpFocus(true);
        setIsHelpModalOpen(true);
    }, []);

    const [simActivityId, setSimActivityId] = useState("");
    // Stato sede selezionata nel simulatore: mirror di resolve-public-catalog
    // (`activity.status !== "active"` → pagina pubblica senza catalogo).
    const simActivity = activities.find(a => a.id === simActivityId) ?? null;
    const simActivityInactive = simActivity !== null && simActivity.status !== "active";
    const [simDateTime, setSimDateTime] = useState(() => toDateTimeLocalValue(new Date()));
    const [simResult, setSimResult] = useState<ResolveRulesForActivityResult | null>(null);
    const [isSimLoading, setIsSimLoading] = useState(false);
    const [simError, setSimError] = useState<string | null>(null);
    const [simTimelineOpen, setSimTimelineOpen] = useState(false);
    const [isDailyTimelineLoading, setIsDailyTimelineLoading] = useState(false);
    const [dailyTimelineError, setDailyTimelineError] = useState<string | null>(null);
    const [dailyTimelineBlocks, setDailyTimelineBlocks] = useState<DailyTimelineBlock[]>([]);

    const activityById = useMemo(
        () => new Map(activities.map(item => [item.id, item])),
        [activities]
    );
    const catalogById = useMemo(() => new Map(catalogs.map(item => [item.id, item])), [catalogs]);
    const styleById = useMemo(
        () => new Map(stylesOptions.map(item => [item.id, item])),
        [stylesOptions]
    );
    const loadRules = useCallback(async () => {
        const rulesData = await listLayoutRules(currentTenantId!);
        setRules(rulesData);
    }, [currentTenantId]);

    const loadInitialData = useCallback(async () => {
        // Gate prima della fetch: senza lettura (o coi permessi ancora in
        // arrivo) non si chiede niente; PageGate mostra il blocco.
        if (!currentTenantId || !canRead) return;
        try {
            setIsLoading(true);
            const [rulesData, optionsData] = await Promise.all([
                listLayoutRules(currentTenantId),
                listLayoutRuleOptions(currentTenantId)
            ]);
            setRules(rulesData);
            setActivities(optionsData.activities);
            setActivityGroups(optionsData.activityGroups);
            setCatalogs(optionsData.catalogs);
            setStylesOptions(optionsData.styles);

            setActivityIdsByGroupId(
                await listActivityIdsByGroup(optionsData.activityGroups.map(group => group.id))
            );
        } catch (error) {
            console.error("Errore caricamento Programmazione:", error);
            showToast({
                type: "error",
                message: "Non riusciamo a caricare le regole.",
                duration: 3000
            });
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, canRead, showToast]);

    useEffect(() => {
        void loadInitialData();
    }, [loadInitialData]);

    // Auto-select activity if tenant has exactly one
    useEffect(() => {
        if (activities.length === 1 && !simActivityId) {
            setSimActivityId(activities[0].id);
        }
    }, [activities, simActivityId]);

    const filteredRules = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        // 1. Filter by rule type (tab)
        let result = ruleTypeFilter === "all"
            ? rules
            : rules.filter(rule => rule.rule_type === ruleTypeFilter);

        // 2. Filter by selected activity
        if (filterActivityId) {
            result = result.filter(rule => {
                if (rule.applyToAll) return true;
                if (rule.activityIds.includes(filterActivityId)) return true;
                return rule.groupIds.some(gId =>
                    (activityIdsByGroupId[gId] ?? []).includes(filterActivityId)
                );
            });
        }

        // 3. Filter by search term
        if (!query) return result;

        return result.filter(rule => {
            const targetLabel = getRuleTargetLabel(rule, activityById);
            const catalogName = rule.layout?.catalog_id
                ? (catalogById.get(rule.layout.catalog_id)?.name ?? rule.layout.catalog_id)
                : "";
            const styleLabel = rule.layout?.style_id
                ? (styleById.get(rule.layout.style_id)?.name ?? rule.layout.style_id)
                : "";
            const ruleName = rule.name ?? "";

            return [
                ruleName,
                rule.id,
                ruleTypeLabel(rule.rule_type, catalogLabel),
                rule.rule_type,
                targetLabel,
                rule.target_type,
                rule.target_id,
                catalogName,
                styleLabel,
                rule.priority
            ]
                .join(" ")
                .toLowerCase()
                .includes(query);
        });
    }, [activityById, activityIdsByGroupId, catalogById, catalogLabel, filterActivityId, ruleTypeFilter, rules, searchTerm, styleById]);

    const handleSelectionChange = useCallback((id: string, checked: boolean) => {
        setSelectedRuleIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);

    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 15000); // Check every 15s to be responsive
        return () => clearInterval(interval);
    }, []);

    const reachCtx = useMemo(() => {
        const activityIdSet = new Set(activities.map(activity => activity.id));
        return {
            activityExists: (id: string) => activityIdSet.has(id),
            groupMemberCount: (id: string) => (activityIdsByGroupId[id] ?? []).length
        };
    }, [activities, activityIdsByGroupId]);

    const groupNameById = useMemo(
        () => new Map(activityGroups.map(group => [group.id, group.name])),
        [activityGroups]
    );

    const ruleInsightsById = useMemo(() => {
        const insights = new Map<string, RuleInsight>();
        const allActivityIds = activities.map(activity => activity.id);

        const ruleAppliesToActivityWithSpecificity = (
            rule: LayoutRule,
            activityId: string
        ): 0 | 1 | 2 | null => {
            const legacyActivityMatch =
                rule.target_type === "activity" && rule.target_id === activityId;
            const activityMatch = legacyActivityMatch || rule.activityIds.includes(activityId);
            if (activityMatch) return 2;

            const allGroupIds = new Set<string>(rule.groupIds);
            if (rule.target_type === "activity_group") allGroupIds.add(rule.target_id);
            for (const groupId of allGroupIds) {
                if ((activityIdsByGroupId[groupId] ?? []).includes(activityId)) return 1;
            }

            if (rule.applyToAll) return 0;
            return null;
        };

        const ruleTargetsAnyActivity = (rule: LayoutRule): boolean =>
            ruleReachesAnyActivity(rule, reachCtx);

        const activeNowRules = rules.filter(
            rule => rule.enabled && isRuleCurrentlyActive(rule, currentTime)
        );

        const ruleWinsNow = new Set<string>();
        const ruleParticipatesNow = new Set<string>();
        const ruleOverriddenByName = new Map<string, string>();
        // Per regole con target ampio (tutte/gruppo): sedi dove perdono vs regola più specifica
        const ruleExcludedActivityIds = new Map<string, Set<string>>();

        (["layout", "featured", "price", "visibility"] as RuleType[]).forEach(type => {
            for (const activityId of allActivityIds) {
                const candidates = activeNowRules
                    .filter(rule => rule.rule_type === type)
                    .map(rule => ({
                        rule,
                        specificity: ruleAppliesToActivityWithSpecificity(rule, activityId)
                    }))
                    .filter(
                        (entry): entry is { rule: LayoutRule; specificity: 0 | 1 | 2 } =>
                            entry.specificity !== null
                    );

                if (candidates.length === 0) continue;

                for (const entry of candidates) {
                    ruleParticipatesNow.add(entry.rule.id);
                }

                candidates.sort(compareCandidateSpecificityFirst);
                const winnerEntry = candidates[0];
                ruleWinsNow.add(winnerEntry.rule.id);

                for (const candidate of candidates.slice(1)) {
                    if (!ruleOverriddenByName.has(candidate.rule.id)) {
                        ruleOverriddenByName.set(candidate.rule.id, getRuleDisplayName(winnerEntry.rule, catalogLabel));
                    }

                    // Traccia la sede esclusa per regole con target ampio
                    const excluded = ruleExcludedActivityIds.get(candidate.rule.id) ?? new Set();
                    excluded.add(activityId);
                    ruleExcludedActivityIds.set(candidate.rule.id, excluded);
                }
            }
        });

        for (const rule of rules) {
            const isActiveNow = rule.enabled && isRuleCurrentlyActive(rule, currentTime);
            const canTargetAnyActivity = ruleTargetsAnyActivity(rule);
            const participatesNow = ruleParticipatesNow.has(rule.id);
            const winsNow = ruleWinsNow.has(rule.id);

            const excludedIds = ruleExcludedActivityIds.get(rule.id);
            const excludedActivityNames = excludedIds && excludedIds.size > 0
                ? [...excludedIds].map(id => activityById.get(id)?.name ?? id)
                : undefined;

            insights.set(rule.id, {
                isActiveNow,
                isOverridden: isActiveNow && participatesNow && !winsNow,
                isNeverUsed: !canTargetAnyActivity,
                zeroReachReason: canTargetAnyActivity
                    ? undefined
                    : describeZeroReach(rule, {
                          ...reachCtx,
                          groupName: id => groupNameById.get(id) ?? id
                      }),
                overriddenByName: ruleOverriddenByName.get(rule.id),
                excludedActivityNames
            });
        }

        return insights;
    }, [activities, activityById, activityIdsByGroupId, catalogLabel, currentTime, rules, reachCtx, groupNameById]);

    const { activeRules, scheduledRules, draftRules, expiredRules, disabledRules } = useMemo(() => {
        const active: LayoutRule[] = [];
        const scheduled: LayoutRule[] = [];
        const drafts: LayoutRule[] = [];
        const expired: LayoutRule[] = [];
        const disabled: LayoutRule[] = [];

        for (const rule of filteredRules) {
            const insight = ruleInsightsById.get(rule.id);
            const status = deriveScheduleStatus({
                enabled: rule.enabled,
                endAt: rule.end_at,
                isConfigDraft: isLayoutRuleDraft(rule),
                isZeroReach: Boolean(insight?.zeroReachReason),
                isActiveNow: insight?.isActiveNow ?? false,
                isOverridden: insight?.isOverridden ?? false
            });

            if (status === "draft") {
                // Bozza copre due cause distinte (deriveScheduleStatus):
                // config incompleta, o portata zero (Passo 4) — il target
                // esiste formalmente (un gruppo, di solito) ma non raggiunge
                // nessuna sede reale ora. Nel secondo caso resta enabled=true
                // nel DB, è derivato non scritto (§33.7): torna attiva da
                // sola se il gruppo si ripopola.
                drafts.push(rule);
            } else if (status === "disabled") {
                disabled.push(rule);
            } else if (status === "expired") {
                expired.push(rule);
            } else if (status === "active") {
                active.push(rule);
            } else {
                scheduled.push(rule);
            }
        }

        const temporalScore = (r: LayoutRule): number => {
            let score = 0;
            if (r.start_at || r.end_at) score += 2;
            if (r.time_from || r.time_to) score += 1;
            return score;
        };

        const getTargetSpecificity = (r: LayoutRule): number => {
            if (r.activityIds.length > 0) return 2;
            if (r.groupIds.length > 0) return 1;
            return 0;
        };

        const RULE_TYPE_ORDER: Record<string, number> = { layout: 0, featured: 1, price: 2, visibility: 3 };

        const resolverSort = (a: LayoutRule, b: LayoutRule): number => {
            // 0. Group by type in "Tutte" tab
            const typeDiff = (RULE_TYPE_ORDER[a.rule_type] ?? 9) - (RULE_TYPE_ORDER[b.rule_type] ?? 9);
            if (typeDiff !== 0) return typeDiff;

            const insightA = ruleInsightsById.get(a.id);
            const insightB = ruleInsightsById.get(b.id);

            // 1. Regole sovrascritta ora in cima (attive e in competizione)
            const aOverridden = insightA?.isOverridden ? 1 : 0;
            const bOverridden = insightB?.isOverridden ? 1 : 0;
            if (aOverridden !== bOverridden) return bOverridden - aOverridden;

            // 2. Specificità target DESC
            const specDiff = getTargetSpecificity(b) - getTargetSpecificity(a);
            if (specDiff !== 0) return specDiff;

            // 3. Specificità temporale DESC
            const tempDiff = temporalScore(b) - temporalScore(a);
            if (tempDiff !== 0) return tempDiff;

            // 4. created_at ASC
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        };

        active.sort(resolverSort);
        scheduled.sort(resolverSort);

        expired.sort((a, b) =>
            new Date(b.end_at!).getTime() - new Date(a.end_at!).getTime()
        );

        drafts.sort((a, b) => {
            const typeDiff = (RULE_TYPE_ORDER[a.rule_type] ?? 9) - (RULE_TYPE_ORDER[b.rule_type] ?? 9);
            if (typeDiff !== 0) return typeDiff;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        disabled.sort((a, b) => {
            const typeDiff = (RULE_TYPE_ORDER[a.rule_type] ?? 9) - (RULE_TYPE_ORDER[b.rule_type] ?? 9);
            if (typeDiff !== 0) return typeDiff;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return { activeRules: active, scheduledRules: scheduled, draftRules: drafts, expiredRules: expired, disabledRules: disabled };
    }, [filteredRules, ruleInsightsById]);

    const [showDrafts, setShowDrafts] = useState(true);
    const [showExpired, setShowExpired] = useState(false);
    const [showDisabled, setShowDisabled] = useState(false);

    const ruleNameOf = (id: string): string => {
        const found = rules.find(r => r.id === id);
        return found ? getRuleDisplayName(found, catalogLabel) : "la regola";
    };

    const handleToggleEnabled = async (ruleId: string, enabled: boolean) => {
        // Optimistic update
        setRules(prev => prev.map(r => (r.id === ruleId ? { ...r, enabled } : r)));
        setUpdatingRules(prev => {
            const next = new Set(prev);
            next.add(ruleId);
            return next;
        });

        try {
            await updateScheduleEnabled(ruleId, enabled);
            showToast({
                type: "success",
                message: enabled ? "Regola abilitata." : "Regola disabilitata.",
                duration: 2000
            });
        } catch (error) {
            console.error("Errore update stato regola:", error);
            // Revert
            setRules(prev => prev.map(r => (r.id === ruleId ? { ...r, enabled: !enabled } : r)));
            showToast({
                type: "error",
                message: `Non siamo riusciti a cambiare lo stato di ${ruleNameOf(ruleId)}.`,
                duration: 3000
            });
        } finally {
            setUpdatingRules(prev => {
                const next = new Set(prev);
                next.delete(ruleId);
                return next;
            });
        }
    };



    const runSimulation = useCallback(async () => {
        if (!simActivityId || !simDateTime) {
            setSimResult(null);
            setSimError(null);
            return;
        }

        const selectedDate = new Date(simDateTime);
        if (Number.isNaN(selectedDate.getTime())) {
            setSimResult(null);
            setSimError("Data e ora non valide.");
            return;
        }

        try {
            setIsSimLoading(true);
            setSimError(null);
            const result = await resolveRulesForActivity({
                supabase,
                activityId: simActivityId,
                tenantId: currentTenantId!,
                now: toRomeDateTime(selectedDate),
                includeLayoutStyle: true
            });
            setSimResult(result);
        } catch (error) {
            console.error("Errore simulazione regole:", error);
            setSimResult(null);
            setSimError("Non riusciamo a simulare questo momento.");
        } finally {
            setIsSimLoading(false);
        }
    }, [simActivityId, simDateTime]);

    const runDailyTimeline = useCallback(async () => {
        if (!simActivityId || !simDateTime) {
            setDailyTimelineBlocks([]);
            setDailyTimelineError(null);
            return;
        }

        const selectedDate = new Date(simDateTime);
        if (Number.isNaN(selectedDate.getTime())) {
            setDailyTimelineBlocks([]);
            setDailyTimelineError("Data e ora non valide.");
            return;
        }

        const dayStart = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            0,
            0,
            0,
            0
        );

        const slotOffsets: number[] = [];
        for (let minutes = 0; minutes < 24 * 60; minutes += DAILY_TIMELINE_STEP_MINUTES) {
            slotOffsets.push(minutes);
        }

        setIsDailyTimelineLoading(true);
        setDailyTimelineError(null);

        const settled = await Promise.allSettled(
            slotOffsets.map(async minutesOffset => {
                const slotTime = new Date(dayStart);
                slotTime.setMinutes(minutesOffset);

                const result = await resolveRulesForActivity({
                    supabase,
                    activityId: simActivityId,
                    tenantId: currentTenantId!,
                    now: toRomeDateTime(slotTime),
                    includeLayoutStyle: false
                });

                return {
                    minutesOffset,
                    layoutCatalogId: result.layout.catalogId,
                    layoutScheduleId: result.layout.scheduleId,
                    priceRuleId: result.priceRuleId,
                    visibilityScheduleId: result.visibilityRule?.scheduleId ?? null,
                    visibilityMode: result.visibilityRule?.mode ?? null,
                    featuredScheduleId: result.featuredRule?.scheduleId ?? null,
                    layoutSpecificity: result.debug?.selectedLayoutRuleSpecificity ?? null,
                    priceSpecificity: result.debug?.selectedPriceRuleSpecificity ?? null,
                    visibilitySpecificity: result.debug?.selectedVisibilityRuleSpecificity ?? null
                };
            })
        );

        const slotResults = settled
            .filter((r): r is PromiseFulfilledResult<typeof settled extends PromiseSettledResult<infer T>[] ? T : never> => r.status === "fulfilled")
            .map(r => r.value);

        const failedCount = settled.length - slotResults.length;
        if (failedCount > 0) {
            console.warn(`Timeline: ${failedCount}/${settled.length} slot falliti`);
        }

        if (slotResults.length === 0) {
            setDailyTimelineBlocks([]);
            setDailyTimelineError("Impossibile calcolare l'andamento giornaliero.");
            setIsDailyTimelineLoading(false);
            return;
        }

        const merged: DailyTimelineBlock[] = [];
        for (const slot of slotResults) {
            const currentKey = [
                slot.layoutCatalogId ?? "",
                slot.layoutScheduleId ?? "",
                slot.priceRuleId ?? "",
                slot.visibilityScheduleId ?? "",
                slot.visibilityMode ?? "",
                slot.featuredScheduleId ?? "",
                String(slot.layoutSpecificity ?? ""),
                String(slot.priceSpecificity ?? ""),
                String(slot.visibilitySpecificity ?? "")
            ].join("|");

            const last = merged[merged.length - 1];
            if (last) {
                const lastKey = [
                    last.layoutCatalogId ?? "",
                    last.layoutScheduleId ?? "",
                    last.priceRuleId ?? "",
                    last.visibilityScheduleId ?? "",
                    last.visibilityMode ?? "",
                    last.featuredScheduleId ?? "",
                    String(last.layoutSpecificity ?? ""),
                    String(last.priceSpecificity ?? ""),
                    String(last.visibilitySpecificity ?? "")
                ].join("|");

                if (lastKey === currentKey && last.endMinutes === slot.minutesOffset) {
                    last.endMinutes += DAILY_TIMELINE_STEP_MINUTES;
                    continue;
                }
            }

            merged.push({
                startMinutes: slot.minutesOffset,
                endMinutes: slot.minutesOffset + DAILY_TIMELINE_STEP_MINUTES,
                layoutCatalogId: slot.layoutCatalogId,
                layoutScheduleId: slot.layoutScheduleId,
                priceRuleId: slot.priceRuleId,
                visibilityScheduleId: slot.visibilityScheduleId,
                visibilityMode: slot.visibilityMode,
                featuredScheduleId: slot.featuredScheduleId,
                layoutSpecificity: slot.layoutSpecificity,
                priceSpecificity: slot.priceSpecificity,
                visibilitySpecificity: slot.visibilitySpecificity
            });
        }

        setDailyTimelineBlocks(merged);
        setIsDailyTimelineLoading(false);
    }, [simActivityId, simDateTime]);

    const hasAnyRuleActiveInDay = useMemo(
        () =>
            dailyTimelineBlocks.some(
                block =>
                    block.layoutScheduleId !== null ||
                    block.priceRuleId !== null ||
                    block.visibilityScheduleId !== null ||
                    block.featuredScheduleId !== null
            ),
        [dailyTimelineBlocks]
    );

    useEffect(() => {
        if (!isSimulatorDrawerOpen) return;
        if (!simActivityId || !simDateTime) return;
        void runSimulation();
        void runDailyTimeline();
    }, [isSimulatorDrawerOpen, simActivityId, simDateTime, runSimulation, runDailyTimeline]);

    const handleDeleteConfirm = async () => {
        if (!ruleToDelete) return;

        try {
            await deleteLayoutRule(ruleToDelete);
            showToast({
                type: "success",
                message: "Regola eliminata.",
                duration: 2200
            });
            setIsDeleteModalOpen(false);
            setRuleToDelete(null);
            await loadRules();
        } catch (error) {
            console.error("Errore eliminazione regola:", error);
            showToast({
                type: "error",
                message: `Non siamo riusciti a eliminare ${ruleNameOf(ruleToDelete)}.`,
                duration: 3000
            });
        }
    };

    const handleDuplicate = async (ruleId: string) => {
        try {
            await duplicateRule(ruleId, currentTenantId!);
            showToast({
                type: "success",
                message: "Regola duplicata: la copia è spenta.",
                duration: 2200
            });
            await loadRules();
        } catch (error) {
            console.error("Errore duplicazione regola:", error);
            showToast({
                type: "error",
                message: `Non siamo riusciti a duplicare ${ruleNameOf(ruleId)}.`,
                duration: 3000
            });
        }
    };

    /* Esito per regola: con un errore a metà le altre sono già eliminate,
       quindi il messaggio dice quali restano, e restano selezionate. */
    const handleBulkDelete = async (): Promise<boolean> => {
        const ids = Array.from(selectedRuleIds);
        if (ids.length === 0) return true;
        const results = await Promise.allSettled(ids.map(id => deleteLayoutRule(id)));
        const failedIds = ids.filter((_, i) => results[i].status === "rejected");
        const deleted = ids.length - failedIds.length;

        if (failedIds.length > 0) {
            console.error(
                "Errore eliminazione multipla regole:",
                results.filter(r => r.status === "rejected")
            );
            const names = failedIds.map(id => ruleNameOf(id)).join(", ");
            showToast({
                type: "error",
                message: `${failedIds.length === 1 ? "1 regola non eliminata" : `${failedIds.length} regole non eliminate`}: ${names}.`,
                duration: 4000
            });
        } else {
            showToast({
                type: "success",
                message: deleted === 1 ? "1 regola eliminata." : `${deleted} regole eliminate.`,
                duration: 2200
            });
        }
        setSelectedRuleIds(new Set(failedIds));
        await loadRules();
        return true;
    };

    const bulkCount = selectedRuleIds.size;
    const bulkNames = Array.from(selectedRuleIds).map(ruleNameOf);
    const bulkNamesLine =
        bulkNames.length > 5
            ? `${bulkNames.slice(0, 5).join(", ")} e altre ${bulkNames.length - 5}.`
            : `${bulkNames.join(", ")}.`;

    // Cleanup bozze abbandonate: gestito da edge function
    // cleanup-draft-schedules (elimina bozze > 7 giorni)
    const handleCreateRule = useCallback(async (overrideType?: RuleType) => {
        const effectiveType = overrideType ?? (ruleTypeFilter === "all" ? undefined : ruleTypeFilter as RuleType);
        if (!effectiveType) return;
        setIsCreating(true);
        try {
            const timestamp = new Date().toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit"
            });
            const typeLabel = ruleTypeLabel(effectiveType, catalogLabel);
            const name = `Nuova regola ${typeLabel} · ${timestamp}`;

            if (effectiveType === "featured") {
                const newRuleId = await createFeaturedRuleDraft({
                    tenantId: currentTenantId!,
                    name
                });
                navigate(`/business/${currentTenantId}/scheduling/featured/${newRuleId}?fromType=featured`);
            } else {
                const newRuleId = await createRuleDraft({
                    tenantId: currentTenantId!,
                    ruleType: effectiveType,
                    name
                });
                navigate(`/business/${currentTenantId}/scheduling/${newRuleId}?fromType=${effectiveType}`);
            }
        } catch {
            showToast({ message: "Non siamo riusciti a creare la regola.", type: "error" });
        } finally {
            setIsCreating(false);
        }
    }, [currentTenantId, catalogLabel, ruleTypeFilter, navigate, showToast]);

    // Azioni della banda in ordine di lettura: la primaria è l'ultima ("Nuova
    // regola"), "Simula regole" resta raggiungibile dal caret. Sulla tab "Tutte"
    // la primaria non ha un tipo implicito da creare → apre lei stessa il menu
    // dei quattro tipi, come faceva prima del passaggio a SplitButton.
    const headerSplitActions = useMemo<SplitButtonAction[]>(() => {
        const actions: SplitButtonAction[] = [
            {
                label: "Simula regole",
                onClick: () => setIsSimulatorDrawerOpen(true),
                disabled: !currentTenantId
            }
        ];

        if (!canWrite) return actions;

        const label = isCreating ? "Creazione..." : "Nuova regola";
        const disabled = !currentTenantId || isCreating || !canEdit;

        actions.push(
            ruleTypeFilter === "all"
                ? {
                      label,
                      disabled,
                      items: [
                          { label: ruleTypeLabel("layout", catalogLabel), onClick: () => void handleCreateRule("layout") },
                          { label: "In evidenza", onClick: () => void handleCreateRule("featured") },
                          { label: "Prezzi", onClick: () => void handleCreateRule("price") },
                          { label: "Disponibilità", onClick: () => void handleCreateRule("visibility") }
                      ]
                  }
                : { label, disabled, onClick: () => void handleCreateRule() }
        );

        return actions;
    }, [currentTenantId, canWrite, canEdit, catalogLabel, isCreating, ruleTypeFilter, handleCreateRule]);

    const headerActions = useMemo(() => (
        <div className={styles.headerActions}>
            {viewMode === "list" && (
                <ToolbarSearch
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Cerca per nome, tipo, sede o id…"
                />
            )}
            <SegmentedControl<"list" | "calendar">
                value={viewMode}
                onChange={setViewMode}
                iconsOnly
                options={[
                    { value: "list", label: "Vista lista", icon: <List size={16} /> },
                    { value: "calendar", label: "Vista calendario", icon: <CalendarDays size={16} /> }
                ]}
            />
            <SplitButton actions={headerSplitActions} loading={isCreating} />
        </div>
    ), [viewMode, searchTerm, headerSplitActions, isCreating]);

    const headerLeading = useMemo(() => (
        <Tabs<RuleTypeFilter>
            value={ruleTypeFilter}
            onChange={handleRuleTypeFilterChange}
            variant="line"
        >
            <Tabs.List>
                {typeOptions.map(option => (
                    <Tabs.Tab key={option.value} value={option.value}>
                        {option.label}
                    </Tabs.Tab>
                ))}
            </Tabs.List>
        </Tabs>
    ), [ruleTypeFilter, handleRuleTypeFilterChange, typeOptions]);

    // Stessa toolbar dichiarata a dati, per lo stato compatto: le 5 tab
    // diventano un picker, "Simula regole" scende nel kebab, il toggle
    // lista/calendario resta un'icona a vista (azione frequente) e "Nuova
    // regola" resta il bottone pieno.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        sections: typeOptions.map(option => ({
            value: option.value,
            label: option.label
        })),
        activeSection: ruleTypeFilter,
        onSectionChange: value => handleRuleTypeFilterChange(value as RuleTypeFilter),
        // La ricerca filtra la lista: nella vista calendario non ha bersaglio.
        search: viewMode === "list"
            ? {
                  value: searchTerm,
                  onChange: setSearchTerm,
                  placeholder: "Cerca per nome, tipo, sede o id…"
              }
            : undefined,
        persistentIcons: [
            viewMode === "list"
                ? {
                      icon: <CalendarDays size={18} />,
                      label: "Vista calendario",
                      onClick: () => setViewMode("calendar")
                  }
                : {
                      icon: <List size={18} />,
                      label: "Vista lista",
                      onClick: () => setViewMode("list")
                  }
        ],
        // `headerSplitActions` è già in ordine di lettura: le secondarie
        // precedono la primaria, che è l'ultima.
        secondaryActions: headerSplitActions.slice(0, -1),
        primaryAction: headerSplitActions[headerSplitActions.length - 1],
        loading: isCreating
    }), [ruleTypeFilter, handleRuleTypeFilterChange, typeOptions, viewMode, searchTerm, headerSplitActions, isCreating]);

    usePageHeader({
        leading: headerLeading,
        actions: headerActions,
        compact: headerCompact,
    });

    return (
        <PageGate readPermission="scheduling.read" activityId={filterActivityId}>
            {() => (
        <section className={styles.programming}>
            {viewMode === "list" ? (
                <div className={styles.tableCard}>
                    {/* Sottotitolo della tab: ha senso sopra una lista popolata,
                        non sopra un empty state (che porta già il proprio testo). */}
                    {(isLoading || filteredRules.length > 0) && (
                        <div className={styles.tabDescription}>
                            <Text variant="body-sm" colorVariant="muted">
                                {typeOptions.find(o => o.value === ruleTypeFilter)?.description}
                            </Text>
                            <HowItWorksLink
                                ref={helpTriggerRef}
                                ruleType={ruleTypeFilter}
                                onClick={openHelpModal}
                            />
                        </div>
                    )}

                        {isLoading ? (
                            <div className={styles.emptyState}>
                                <Text colorVariant="muted">Caricamento regole...</Text>
                            </div>
                        ) : filteredRules.length === 0 ? (
                            (searchTerm || filterActivityId) ? (
                                <EmptyState
                                    icon={<Calendar size={40} strokeWidth={1.5} />}
                                    title="Nessun risultato"
                                    description={
                                        filterActivityId && searchTerm
                                            ? "Nessuna regola corrisponde alla ricerca per questa sede."
                                            : filterActivityId
                                            ? "Nessuna regola per questa sede."
                                            : "Nessuna regola corrisponde alla ricerca."
                                    }
                                    action={
                                        <HowItWorksLink
                                            ref={helpTriggerRef}
                                            ruleType={ruleTypeFilter}
                                            onClick={openHelpModal}
                                        />
                                    }
                                />
                            ) : (
                                <EmptyState
                                    icon={<Calendar size={40} strokeWidth={1.5} />}
                                    title={emptyCopy[ruleTypeFilter].title}
                                    description={emptyCopy[ruleTypeFilter].description}
                                    action={
                                        /* Ordine di lettura: cos'è questa cosa (titolo +
                                           descrizione) → come funziona → creane una. */
                                        <div className={styles.emptyStateActions}>
                                            <HowItWorksLink
                                                ref={helpTriggerRef}
                                                ruleType={ruleTypeFilter}
                                                onClick={openHelpModal}
                                            />
                                            {canWrite && (
                                                ruleTypeFilter === "all" ? (
                                                    <div className={styles.newRuleDropdown}>
                                                        <Menu
                                                            trigger={
                                                                <Button
                                                                    variant="primary"
                                                                    disabled={!currentTenantId || isCreating || !canEdit}
                                                                    loading={isCreating}
                                                                >
                                                                    {isCreating ? "Creazione..." : "Crea la prima regola"}
                                                                </Button>
                                                            }
                                                            align="start"
                                                        >
                                                            <Menu.Item onSelect={() => void handleCreateRule("layout")}>
                                                                Layout
                                                            </Menu.Item>
                                                            <Menu.Item onSelect={() => void handleCreateRule("featured")}>
                                                                In evidenza
                                                            </Menu.Item>
                                                            <Menu.Item onSelect={() => void handleCreateRule("price")}>
                                                                Prezzi
                                                            </Menu.Item>
                                                            <Menu.Item onSelect={() => void handleCreateRule("visibility")}>
                                                                Disponibilità
                                                            </Menu.Item>
                                                        </Menu>
                                                    </div>
                                                ) : (
                                                    <Button
                                                        variant="primary"
                                                        onClick={() => void handleCreateRule()}
                                                        disabled={isCreating || !canEdit}
                                                        loading={isCreating}
                                                    >
                                                        Crea la prima regola
                                                    </Button>
                                                )
                                            )}
                                        </div>
                                    }
                                />
                            )
                        ) : (
                            <div className={styles.groupedList}>
                                {activeRules.length > 0 && (
                                    <RuleBlock title="In esecuzione" count={activeRules.length}>
                                        {activeRules.map(rule => (
                                            <RuleRow
                                                key={rule.id}
                                                rule={rule}
                                                isSelected={selectedRuleIds.has(rule.id)}
                                                insight={ruleInsightsById.get(rule.id)}
                                                isUpdating={updatingRules.has(rule.id)}
                                                showTypeBadge={ruleTypeFilter === "all"}
                                                activityById={activityById}
                                                activityGroups={activityGroups}
                                                onSelect={canWrite ? handleSelectionChange : undefined}
                                                onClick={r => navigate(r.rule_type === "featured" ? `/business/${currentTenantId}/scheduling/featured/${r.id}` : `/business/${currentTenantId}/scheduling/${r.id}`)}
                                                onDelete={canWrite ? id => { setRuleToDelete(id); setIsDeleteModalOpen(true); } : undefined}
                                                onDuplicate={canWrite ? handleDuplicate : undefined}
                                                onToggleEnabled={canWrite ? handleToggleEnabled : undefined}
                                            />
                                        ))}
                                    </RuleBlock>
                                )}

                                {scheduledRules.length > 0 && (
                                    <RuleBlock title="Programmate" count={scheduledRules.length}>
                                        {scheduledRules.map(rule => (
                                            <RuleRow
                                                key={rule.id}
                                                rule={rule}
                                                isSelected={selectedRuleIds.has(rule.id)}
                                                insight={ruleInsightsById.get(rule.id)}
                                                isUpdating={updatingRules.has(rule.id)}
                                                showTypeBadge={ruleTypeFilter === "all"}
                                                activityById={activityById}
                                                activityGroups={activityGroups}
                                                onSelect={canWrite ? handleSelectionChange : undefined}
                                                onClick={r => navigate(r.rule_type === "featured" ? `/business/${currentTenantId}/scheduling/featured/${r.id}` : `/business/${currentTenantId}/scheduling/${r.id}`)}
                                                onDelete={canWrite ? id => { setRuleToDelete(id); setIsDeleteModalOpen(true); } : undefined}
                                                onDuplicate={canWrite ? handleDuplicate : undefined}
                                                onToggleEnabled={canWrite ? handleToggleEnabled : undefined}
                                            />
                                        ))}
                                    </RuleBlock>
                                )}

                                {draftRules.length > 0 && (
                                    <RuleBlock
                                        title="Bozze"
                                        count={draftRules.length}
                                        subtitle="Regole incomplete o senza sedi raggiungibili"
                                        collapsible
                                        open={showDrafts}
                                        onToggle={setShowDrafts}
                                    >
                                        {draftRules.map(rule => (
                                            <RuleRow
                                                key={rule.id}
                                                rule={rule}
                                                isSelected={selectedRuleIds.has(rule.id)}
                                                insight={ruleInsightsById.get(rule.id)}
                                                isUpdating={updatingRules.has(rule.id)}
                                                showTypeBadge={ruleTypeFilter === "all"}
                                                activityById={activityById}
                                                activityGroups={activityGroups}
                                                onSelect={canWrite ? handleSelectionChange : undefined}
                                                onClick={r => navigate(r.rule_type === "featured" ? `/business/${currentTenantId}/scheduling/featured/${r.id}` : `/business/${currentTenantId}/scheduling/${r.id}`)}
                                                onDelete={canWrite ? id => { setRuleToDelete(id); setIsDeleteModalOpen(true); } : undefined}
                                                onDuplicate={canWrite ? handleDuplicate : undefined}
                                                onToggleEnabled={canWrite ? handleToggleEnabled : undefined}
                                            />
                                        ))}
                                    </RuleBlock>
                                )}

                                {disabledRules.length > 0 && (
                                    <RuleBlock
                                        title="Disabilitate"
                                        count={disabledRules.length}
                                        collapsible
                                        open={showDisabled}
                                        onToggle={setShowDisabled}
                                    >
                                        {disabledRules.map(rule => (
                                            <RuleRow
                                                key={rule.id}
                                                rule={rule}
                                                isSelected={selectedRuleIds.has(rule.id)}
                                                insight={ruleInsightsById.get(rule.id)}
                                                isUpdating={updatingRules.has(rule.id)}
                                                showTypeBadge={ruleTypeFilter === "all"}
                                                activityById={activityById}
                                                activityGroups={activityGroups}
                                                onSelect={canWrite ? handleSelectionChange : undefined}
                                                onClick={r => navigate(r.rule_type === "featured" ? `/business/${currentTenantId}/scheduling/featured/${r.id}` : `/business/${currentTenantId}/scheduling/${r.id}`)}
                                                onDelete={canWrite ? id => { setRuleToDelete(id); setIsDeleteModalOpen(true); } : undefined}
                                                onDuplicate={canWrite ? handleDuplicate : undefined}
                                                onToggleEnabled={canWrite ? handleToggleEnabled : undefined}
                                            />
                                        ))}
                                    </RuleBlock>
                                )}

                                {expiredRules.length > 0 && (
                                    <RuleBlock
                                        title="Scadute"
                                        count={expiredRules.length}
                                        collapsible
                                        open={showExpired}
                                        onToggle={setShowExpired}
                                    >
                                        {expiredRules.map(rule => (
                                            <RuleRow
                                                key={rule.id}
                                                rule={rule}
                                                isSelected={selectedRuleIds.has(rule.id)}
                                                insight={ruleInsightsById.get(rule.id)}
                                                isUpdating={updatingRules.has(rule.id)}
                                                showTypeBadge={ruleTypeFilter === "all"}
                                                activityById={activityById}
                                                activityGroups={activityGroups}
                                                onSelect={canWrite ? handleSelectionChange : undefined}
                                                onClick={r => navigate(r.rule_type === "featured" ? `/business/${currentTenantId}/scheduling/featured/${r.id}` : `/business/${currentTenantId}/scheduling/${r.id}`)}
                                                onDelete={canWrite ? id => { setRuleToDelete(id); setIsDeleteModalOpen(true); } : undefined}
                                                onDuplicate={canWrite ? handleDuplicate : undefined}
                                                onToggleEnabled={canWrite ? handleToggleEnabled : undefined}
                                            />
                                        ))}
                                    </RuleBlock>
                                )}
                            </div>
                        )}
                    </div>
            ) : (
                <CalendarView
                    rules={rules}
                    ruleTypeFilter={ruleTypeFilter}
                    onRuleClick={rule =>
                        navigate(
                            rule.rule_type === "featured"
                                ? `/business/${currentTenantId}/scheduling/featured/${rule.id}`
                                : `/business/${currentTenantId}/scheduling/${rule.id}`
                        )
                    }
                />
            )}

            <BulkBar
                selectedCount={selectedRuleIds.size}
                onDelete={canWrite ? () => setIsBulkDeleteOpen(true) : undefined}
                onClearSelection={() => setSelectedRuleIds(new Set())}
            />

            <SystemDrawer
                open={isSimulatorDrawerOpen}
                onClose={() => setIsSimulatorDrawerOpen(false)}
                width={560}
                aria-labelledby="simulate-rules-title"
            >
                <DrawerLayout
                    header={
                        <div className={styles.drawerHeader}>
                            <Text as="h3" variant="title-sm" id="simulate-rules-title">
                                Simula regole
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Scegli una sede e un momento: vedi cosa decide ogni regola.
                            </Text>
                        </div>
                    }
                    footer={
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setIsSimulatorDrawerOpen(false)}
                            >
                                Chiudi
                            </Button>
                            {(() => {
                                const activitySlug = simActivity?.slug;
                                if (!simResult || !activitySlug || !simDateTime) return null;
                                // L'anteprima apre la pagina pubblica: negli stessi casi in
                                // cui resolve-public-catalog non serve il catalogo il link
                                // sarebbe fuorviante. La simulazione (card) resta calcolata.
                                const previewBlockedReason = subscriptionInactive
                                    ? "Anteprima non disponibile: l'abbonamento non è attivo, la pagina pubblica non mostra il catalogo."
                                    : simActivityInactive
                                        ? "Anteprima non disponibile: la sede è sospesa, la pagina pubblica non mostra il catalogo."
                                        : null;
                                const previewButton = (
                                    <Button
                                        variant="primary"
                                        disabled={previewBlockedReason !== null}
                                        onClick={() => {
                                            const simDate = new Date(simDateTime);
                                            const url = `/${activitySlug}?simulate=${simDate.toISOString()}`;
                                            window.open(url, "_blank");
                                        }}
                                    >
                                        Apri l'anteprima
                                    </Button>
                                );
                                if (!previewBlockedReason) return previewButton;
                                // Un <button disabled> non emette eventi pointer: il wrapper
                                // focusabile fa da trigger al tooltip (hover + tastiera).
                                return (
                                    <Tooltip content={previewBlockedReason}>
                                        <span className={styles.previewTooltipWrap} tabIndex={0}>
                                            {previewButton}
                                        </span>
                                    </Tooltip>
                                );
                            })()}
                        </>
                    }
                >
                    <div className={styles.form}>
                        <Select
                            label="Sede"
                            value={simActivityId}
                            onChange={event => setSimActivityId(event.target.value)}
                            required
                        >
                            <option value="" disabled>
                                Seleziona una sede
                            </option>
                            {activities.map(activity => (
                                <option key={activity.id} value={activity.id}>
                                    {activity.name}
                                </option>
                            ))}
                        </Select>

                        {simActivity && (
                            <div className={styles.simActivityStatusRow}>
                                <Text variant="caption" colorVariant="muted">Stato sede</Text>
                                {simActivityInactive ? (
                                    <StatusBadge
                                        variant="neutral"
                                        label={formatInactiveReason(simActivity.inactive_reason ?? null)}
                                    />
                                ) : (
                                    <StatusBadge variant="success" label="Pubblicata" />
                                )}
                            </div>
                        )}

                        {simActivity && subscriptionInactive && (
                            <InlineBanner variant="warning">
                                Abbonamento non attivo: la pagina pubblica di questa sede non mostra il catalogo
                                finché l'abbonamento non viene riattivato. La simulazione e l'anteprima restano disponibili.
                            </InlineBanner>
                        )}

                        {simActivity && simActivityInactive && !subscriptionInactive && (
                            <InlineBanner variant="warning">
                                Sede sospesa: la pagina pubblica mostra solo le informazioni della sede, senza catalogo.
                                La simulazione e l'anteprima restano disponibili.
                            </InlineBanner>
                        )}

                        <TextInput
                            label="Data e ora"
                            type="datetime-local"
                            value={simDateTime}
                            onChange={event => setSimDateTime(event.target.value)}
                            required
                        />

                        {!simActivityId || !simDateTime ? (
                            <div className={styles.simResultCard}>
                                <Text variant="body-sm" colorVariant="muted">
                                    Scegli sede e momento.
                                </Text>
                            </div>
                        ) : isSimLoading ? (
                            <div className={styles.simResultCard}>
                                <Text variant="body-sm" colorVariant="muted">
                                    Simulazione in corso...
                                </Text>
                            </div>
                        ) : simError ? (
                            <div className={styles.simResultCard}>
                                <Text variant="body-sm" colorVariant="error">
                                    {simError}
                                </Text>
                            </div>
                        ) : simResult ? (
                            <div className={styles.simResultBlock}>
                                <div className={styles.simResultGrid}>
                                    {/* Catalogo */}
                                    <div
                                        className={`${styles.simResultCard} ${simResult.layout.scheduleId ? styles.simResultCardClickable : ""}`}
                                        onClick={simResult.layout.scheduleId ? () => {
                                            setIsSimulatorDrawerOpen(false);
                                            navigate(`/business/${currentTenantId}/scheduling/${simResult.layout.scheduleId}`);
                                        } : undefined}
                                    >
                                        <Text variant="caption" colorVariant="muted">{ruleTypeLabel("layout", catalogLabel)}</Text>
                                        <Text variant="body-sm" weight={700}>
                                            {simResult.layout.scheduleId
                                                ? (rules.find(r => r.id === simResult.layout.scheduleId)?.name ?? simResult.layout.scheduleId)
                                                : "Nessuna regola"}
                                        </Text>
                                        {simResult.layout.catalogId && (
                                            <Text variant="caption" colorVariant="muted">
                                                {catalogLabel}: {catalogById.get(simResult.layout.catalogId)?.name ?? simResult.layout.catalogId}
                                            </Text>
                                        )}
                                    </div>

                                    {/* In evidenza */}
                                    {(() => {
                                        const featuredRule = simResult.featuredRule?.scheduleId
                                            ? rules.find(r => r.id === simResult.featuredRule?.scheduleId)
                                            : null;
                                        const contentCount = featuredRule?.featured_contents.length ?? 0;
                                        return (
                                            <div
                                                className={`${styles.simResultCard} ${featuredRule ? styles.simResultCardClickable : ""}`}
                                                onClick={featuredRule ? () => {
                                                    setIsSimulatorDrawerOpen(false);
                                                    navigate(`/business/${currentTenantId}/scheduling/featured/${featuredRule.id}`);
                                                } : undefined}
                                            >
                                                <Text variant="caption" colorVariant="muted">In evidenza</Text>
                                                <Text variant="body-sm" weight={700}>
                                                    {featuredRule?.name ?? simResult.featuredRule?.scheduleId ?? "Nessuna regola"}
                                                </Text>
                                                {featuredRule && (
                                                    <Text variant="caption" colorVariant="muted">
                                                        {contentCount} {contentCount === 1 ? "contenuto" : "contenuti"}
                                                    </Text>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Prezzi */}
                                    {(() => {
                                        const priceRule = simResult.priceRuleId
                                            ? rules.find(r => r.id === simResult.priceRuleId)
                                            : null;
                                        const overrideCount = priceRule?.price_overrides.length ?? 0;
                                        return (
                                            <div
                                                className={`${styles.simResultCard} ${priceRule ? styles.simResultCardClickable : ""}`}
                                                onClick={priceRule ? () => {
                                                    setIsSimulatorDrawerOpen(false);
                                                    navigate(`/business/${currentTenantId}/scheduling/${priceRule.id}`);
                                                } : undefined}
                                            >
                                                <Text variant="caption" colorVariant="muted">Prezzi</Text>
                                                <Text variant="body-sm" weight={700}>
                                                    {priceRule?.name ?? simResult.priceRuleId ?? "Nessuna regola"}
                                                </Text>
                                                {priceRule && (
                                                    <Text variant="caption" colorVariant="muted">
                                                        {overrideCount} {overrideCount === 1 ? "prodotto" : "prodotti"}
                                                    </Text>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Disponibilità */}
                                    {(() => {
                                        const visRule = simResult.visibilityRule?.scheduleId
                                            ? rules.find(r => r.id === simResult.visibilityRule?.scheduleId)
                                            : null;
                                        const visCount = visRule?.visibility_overrides.length ?? 0;
                                        return (
                                            <div
                                                className={`${styles.simResultCard} ${visRule ? styles.simResultCardClickable : ""}`}
                                                onClick={visRule ? () => {
                                                    setIsSimulatorDrawerOpen(false);
                                                    navigate(`/business/${currentTenantId}/scheduling/${visRule.id}`);
                                                } : undefined}
                                            >
                                                <Text variant="caption" colorVariant="muted">Disponibilità</Text>
                                                <Text variant="body-sm" weight={700}>
                                                    {visRule?.name ?? simResult.visibilityRule?.scheduleId ?? "Nessuna regola"}
                                                </Text>
                                                {visRule && (
                                                    <Text variant="caption" colorVariant="muted">
                                                        {visCount} {visCount === 1 ? "prodotto" : "prodotti"}
                                                    </Text>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>

                                <button
                                    type="button"
                                    className={styles.simTimelineToggle}
                                    onClick={() => setSimTimelineOpen(prev => !prev)}
                                    aria-expanded={simTimelineOpen}
                                >
                                    <ChevronDown
                                        size={14}
                                        className={simTimelineOpen ? styles.simTimelineChevronOpen : styles.simTimelineChevronClosed}
                                    />
                                    <Text variant="body-sm" weight={600} as="span">
                                        Andamento della giornata
                                    </Text>
                                    {isDailyTimelineLoading && (
                                        <Loader2 size={12} className={styles.miniLoader} />
                                    )}
                                </button>

                                {simTimelineOpen && (
                                    <div className={styles.simTimelineContent}>
                                        {isDailyTimelineLoading ? (
                                            <Text variant="caption" colorVariant="muted">
                                                Calcolo andamento giornaliero...
                                            </Text>
                                        ) : dailyTimelineError ? (
                                            <Text variant="caption" colorVariant="error">
                                                {dailyTimelineError}
                                            </Text>
                                        ) : dailyTimelineBlocks.length === 0 ||
                                          !hasAnyRuleActiveInDay ? (
                                            <Text variant="caption" colorVariant="muted">
                                                Nessuna regola attiva durante la giornata.
                                            </Text>
                                        ) : (
                                            <div className={styles.timelineList}>
                                                {dailyTimelineBlocks.map((block, index) => {
                                                    const layoutName = block.layoutCatalogId
                                                        ? (catalogById.get(block.layoutCatalogId)?.name ??
                                                          block.layoutCatalogId)
                                                        : `Nessun ${catalogLabel.toLowerCase()}`;
                                                    const layoutClassName = block.layoutCatalogId
                                                        ? styles.timelineBlockActive
                                                        : styles.timelineBlockNoLayout;
                                                    const visibilityBadgeClassName =
                                                        block.visibilityMode === "disable"
                                                            ? styles.timelineBadgeDisable
                                                            : block.visibilityMode === "hide"
                                                              ? styles.timelineBadgeHide
                                                              : styles.timelineBadgeNeutral;

                                                    return (
                                                        <div
                                                            key={`${block.startMinutes}-${block.endMinutes}-${index}`}
                                                            className={`${styles.timelineBlock} ${layoutClassName}`}
                                                        >
                                                            <Text variant="caption" weight={700}>
                                                                {formatMinutesToHourLabel(
                                                                    block.startMinutes
                                                                )}
                                                                –{formatMinutesToHourLabel(block.endMinutes)}
                                                            </Text>
                                                            <Text variant="body-sm" weight={600}>
                                                                {layoutName}
                                                            </Text>
                                                            <div className={styles.timelineBadges}>
                                                                <span className={styles.timelineBadgeNeutral}>
                                                                    Dove si applica:{" "}
                                                                    {getSpecificityLabel(
                                                                        block.layoutSpecificity
                                                                    )}
                                                                </span>
                                                                <span className={visibilityBadgeClassName}>
                                                                    {block.visibilityMode === "hide"
                                                                        ? "Nascosti"
                                                                        : block.visibilityMode === "disable"
                                                                          ? "Non disponibili"
                                                                          : "Disponibilità invariata"}
                                                                </span>
                                                                {block.priceRuleId && (
                                                                    <span className={styles.timelineBadgeNeutral}>
                                                                        Prezzi
                                                                    </span>
                                                                )}
                                                                {block.featuredScheduleId && (
                                                                    <span className={styles.timelineBadgeNeutral}>
                                                                        In evidenza: {rules.find(r => r.id === block.featuredScheduleId)?.name ?? "attiva"}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </DrawerLayout>
            </SystemDrawer>
            <RuleTypeHelpModal
                isOpen={isHelpModalOpen}
                ruleType={ruleTypeFilter}
                triggerRef={helpTriggerRef}
                returnFocusOnClose={returnHelpFocus}
                onClose={() => setIsHelpModalOpen(false)}
                onSimulate={() => {
                    /* Il focus va al simulatore che si apre, non indietro
                       al link che ha aperto la spiegazione. */
                    setReturnHelpFocus(false);
                    setIsHelpModalOpen(false);
                    setIsSimulatorDrawerOpen(true);
                }}
            />
            <ConfirmDialog
                isOpen={isBulkDeleteOpen}
                onClose={() => setIsBulkDeleteOpen(false)}
                onConfirm={handleBulkDelete}
                title={bulkCount === 1 ? "Eliminare 1 regola?" : `Eliminare ${bulkCount} regole?`}
                message="Le regole spariscono da tutte le sedi a cui si applicano. Non si può annullare."
                confirmLabel={bulkCount === 1 ? "Elimina 1 regola" : `Elimina ${bulkCount} regole`}
                confirmVariant="danger"
            >
                <Text variant="body-sm">{bulkNamesLine}</Text>
            </ConfirmDialog>
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteConfirm}
                title="Eliminare regola?"
                message="Questa azione è irreversibile."
                confirmLabel="Elimina"
                confirmVariant="danger"
            />
        </section>
            )}
        </PageGate>
    );
}
