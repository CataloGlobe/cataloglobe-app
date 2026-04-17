import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Globe, Building2, Users, AlertCircle, FileText, Loader2, Calendar, ChevronDown, List, CalendarDays } from "lucide-react";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { Button } from "@/components/ui/Button/Button";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { BulkBar } from "@/components/ui/BulkBar/BulkBar";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@/components/ui/DropdownMenu/DropdownItem";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
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
import { RuleRow } from "./components/RuleRow";
import { CalendarView } from "./components/CalendarView";
import {
    resolveRulesForActivity,
    type ResolveRulesForActivityResult
} from "@/services/supabase/scheduleResolver";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { buildRuleSummary, isRuleCurrentlyActive } from "@/utils/ruleHelpers";
import styles from "./Programming.module.scss";

type RuleTypeFilter = RuleType | "all";

type RuleInsight = {
    isActiveNow: boolean;
    isOverridden: boolean;
    hasConflict: boolean;
    isNeverUsed: boolean;
    conflictingWithName?: string;
    overriddenByName?: string;
    /** Nomi delle sedi dove questa regola è sovrascritta da una più specifica. */
    excludedActivityNames?: string[];
};

type RuleSuggestion = {
    type: "conflict" | "override" | "unused";
    message: string;
    actionLabel?: string;
    action?: () => void;
    fixSuggestion?: string;
};

type VisibilityModeLabel = "hide" | "disable";

function formatVisibilityMode(mode: VisibilityModeLabel | string | null | undefined, short = false): string {
    if (mode === "hide") return short ? "Nascosti" : "Nasconde i prodotti selezionati";
    if (mode === "disable") return short ? "Non disponibile" : "Mostra come non disponibile";
    return "—";
}

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

type ActivityGroupMemberRow = {
    group_id: string;
    activity_id: string;
};

const RULE_TYPE_TAB_OPTIONS: Array<{ value: RuleTypeFilter; label: string; description: string }> = [
    { value: "layout", label: "Layout", description: "Definiscono quale catalogo e stile mostrare" },
    { value: "featured", label: "In evidenza", description: "Programmano quando mostrare contenuti in evidenza" },
    { value: "price", label: "Prezzi", description: "Sovrascrivono il prezzo di prodotti specifici" },
    { value: "visibility", label: "Visibilità", description: "Nascondono prodotti specifici per sede o orario" },
    { value: "all", label: "Tutte", description: "Panoramica di tutte le regole di programmazione" }
];

const DAILY_TIMELINE_STEP_MINUTES = 30;

function getRuleTypeLabel(ruleType: RuleType): string {
    if (ruleType === "layout") return "Layout";
    if (ruleType === "price") return "Prezzi";
    if (ruleType === "featured") return "In evidenza";
    return "Visibilità";
}

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
    if (value === 2) return "Sede specifica";
    if (value === 1) return "Gruppo di sedi";
    if (value === 0) return "Tutte le sedi";
    return "-";
}

function getRuleDisplayName(rule: LayoutRule): string {
    return (rule.name ?? `${getRuleTypeLabel(rule.rule_type)} · ${rule.id.slice(0, 6)}`).trim();
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

    return (
        <div className={styles.ruleBlock}>
            {header}
            {isOpen && children}
        </div>
    );
}

function isDraft(rule: LayoutRule): boolean {
    // Target vuoti (non "tutte le sedi" ma nessun target specifico)
    if (!rule.applyToAll && rule.activityIds.length === 0 && rule.groupIds.length === 0) {
        return true;
    }
    if (rule.rule_type === "layout") {
        return !rule.layout?.catalog_id || !rule.layout?.style_id;
    }
    if (rule.rule_type === "featured") {
        return rule.featured_contents.length === 0;
    }
    if (rule.rule_type === "price") {
        return rule.price_overrides.length === 0;
    }
    if (rule.rule_type === "visibility") {
        return rule.visibility_overrides.length === 0;
    }
    return false;
}

export default function Programming() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const currentTenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const { showToast } = useToast();

    const [rules, setRules] = useState<LayoutRule[]>([]);
    const [activities, setActivities] = useState<LayoutRuleOption[]>([]);
    const [activityGroups, setActivityGroups] = useState<LayoutRuleOption[]>([]);
    const [catalogs, setCatalogs] = useState<LayoutRuleOption[]>([]);
    const [stylesOptions, setStylesOptions] = useState<LayoutRuleOption[]>([]);
    const [activityIdsByGroupId, setActivityIdsByGroupId] = useState<Record<string, string[]>>({});

    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isSimulatorDrawerOpen, setIsSimulatorDrawerOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
    const [updatingRules, setUpdatingRules] = useState<Set<string>>(new Set());

    const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
    const [searchTerm, setSearchTerm] = useState("");
    const typeFromUrl = searchParams.get("type") as RuleType | null;
    const [ruleTypeFilter, setRuleTypeFilter] = useState<RuleTypeFilter>(
        typeFromUrl && ["layout", "featured", "price", "visibility", "all"].includes(typeFromUrl)
            ? (typeFromUrl as RuleTypeFilter)
            : "layout"
    );
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());

    const [simActivityId, setSimActivityId] = useState("");
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
        if (!currentTenantId) return;
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

            const groupIds = optionsData.activityGroups.map(group => group.id);
            if (groupIds.length > 0) {
                const membershipsRes = await supabase
                    .from("activity_group_members")
                    .select("group_id, activity_id")
                    .in("group_id", groupIds);
                if (membershipsRes.error) throw membershipsRes.error;

                const grouped: Record<string, string[]> = {};
                for (const row of (membershipsRes.data ?? []) as ActivityGroupMemberRow[]) {
                    if (!grouped[row.group_id]) grouped[row.group_id] = [];
                    grouped[row.group_id].push(row.activity_id);
                }
                setActivityIdsByGroupId(grouped);
            } else {
                setActivityIdsByGroupId({});
            }
        } catch (error) {
            console.error("Errore caricamento Programmazione:", error);
            showToast({
                type: "error",
                message: "Impossibile caricare la programmazione.",
                duration: 3000
            });
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, showToast]);

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
        const typeFilteredRules = ruleTypeFilter === "all"
            ? rules
            : rules.filter(rule => rule.rule_type === ruleTypeFilter);

        if (!query) return typeFilteredRules;

        return typeFilteredRules.filter(rule => {
            const targetLabel = getRuleTargetLabel(rule, activityById);
            const catalogLabel = rule.layout?.catalog_id
                ? (catalogById.get(rule.layout.catalog_id)?.name ?? rule.layout.catalog_id)
                : "";
            const styleLabel = rule.layout?.style_id
                ? (styleById.get(rule.layout.style_id)?.name ?? rule.layout.style_id)
                : "";
            const ruleName = rule.name ?? "";

            return [
                ruleName,
                rule.id,
                getRuleTypeLabel(rule.rule_type),
                rule.rule_type,
                targetLabel,
                rule.target_type,
                rule.target_id,
                catalogLabel,
                styleLabel,
                rule.priority
            ]
                .join(" ")
                .toLowerCase()
                .includes(query);
        });
    }, [activityById, catalogById, ruleTypeFilter, rules, searchTerm, styleById]);

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

        const ruleTargetsAnyActivity = (rule: LayoutRule): boolean => {
            if (rule.applyToAll) return true;
            return allActivityIds.some(activityId => {
                return ruleAppliesToActivityWithSpecificity(rule, activityId) !== null;
            });
        };

        const activeNowRules = rules.filter(
            rule => rule.enabled && isRuleCurrentlyActive(rule, currentTime)
        );

        const ruleWinsNow = new Set<string>();
        const ruleParticipatesNow = new Set<string>();
        const ruleConflictsNow = new Set<string>();
        const ruleConflictingWithNames = new Map<string, Set<string>>();
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
                if (candidates.length > 1) {
                    for (const entry of candidates) {
                        ruleConflictsNow.add(entry.rule.id);
                    }
                }

                for (const entry of candidates) {
                    ruleParticipatesNow.add(entry.rule.id);
                }

                candidates.sort(compareCandidateSpecificityFirst);
                const winnerEntry = candidates[0];
                ruleWinsNow.add(winnerEntry.rule.id);

                if (candidates.length > 1) {
                    const secondEntry = candidates[1];
                    const winnerSet = ruleConflictingWithNames.get(winnerEntry.rule.id) ?? new Set();
                    winnerSet.add(getRuleDisplayName(secondEntry.rule));
                    ruleConflictingWithNames.set(winnerEntry.rule.id, winnerSet);
                }

                for (const candidate of candidates.slice(1)) {
                    if (!ruleOverriddenByName.has(candidate.rule.id)) {
                        ruleOverriddenByName.set(candidate.rule.id, getRuleDisplayName(winnerEntry.rule));
                    }

                    const conflictSet = ruleConflictingWithNames.get(candidate.rule.id) ?? new Set();
                    conflictSet.add(getRuleDisplayName(winnerEntry.rule));
                    ruleConflictingWithNames.set(candidate.rule.id, conflictSet);

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
                hasConflict: isActiveNow && ruleConflictsNow.has(rule.id),
                isNeverUsed: !canTargetAnyActivity,
                conflictingWithName: Array.from(ruleConflictingWithNames.get(rule.id) ?? [])[0],
                overriddenByName: ruleOverriddenByName.get(rule.id),
                excludedActivityNames
            });
        }

        return insights;
    }, [activities, activityById, activityIdsByGroupId, currentTime, rules]);

    const { activeRules, scheduledRules, draftRules, expiredRules, disabledRules } = useMemo(() => {
        const active: LayoutRule[] = [];
        const scheduled: LayoutRule[] = [];
        const drafts: LayoutRule[] = [];
        const expired: LayoutRule[] = [];
        const disabled: LayoutRule[] = [];

        const isExpired = (rule: LayoutRule): boolean => {
            if (!rule.end_at) return false;
            return new Date(rule.end_at) <= new Date();
        };

        for (const rule of filteredRules) {
            if (!rule.enabled && isDraft(rule)) {
                drafts.push(rule);
            } else if (!rule.enabled) {
                disabled.push(rule);
            } else if (isExpired(rule)) {
                expired.push(rule);
            } else {
                const insight = ruleInsightsById.get(rule.id);
                if (insight?.isActiveNow && !insight?.isOverridden) {
                    active.push(rule);
                } else {
                    scheduled.push(rule);
                }
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
                message: "Impossibile aggiornare lo stato.",
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


    const getRuleSuggestions = (
        rule: LayoutRule,
        insight: RuleInsight | undefined
    ): RuleSuggestion[] => {
        if (!insight) return [];

        const openRule = () => navigate(`/business/${currentTenantId}/scheduling/${rule.id}`);
        if (insight.hasConflict) {
            const suggestedPriority = Math.max(1, rule.priority - 1);
            return [
                {
                    type: "conflict",
                    message: `In conflitto con: ${insight.conflictingWithName ?? "un'altra regola"}`,
                    actionLabel: "Modifica priorità",
                    action: openRule,
                    fixSuggestion:
                        suggestedPriority !== rule.priority
                            ? `Imposta priorità ${suggestedPriority} oppure riduci il target per evitare sovrapposizioni.`
                            : "La priorità è già al massimo (1): separa il target o la fascia oraria."
                }
            ];
        }

        if (insight.isOverridden) {
            const suggestedPriority = Math.max(1, rule.priority - 2);
            return [
                {
                    type: "override",
                    message: `Superata da: ${insight.overriddenByName ?? "un'altra regola"}`,
                    actionLabel: "Modifica priorità",
                    action: openRule,
                    fixSuggestion:
                        suggestedPriority !== rule.priority
                            ? `Prova priorità ${suggestedPriority} o un target più specifico (Attività).`
                            : "Usa un target più specifico o restringi la finestra temporale."
                }
            ];
        }

        if (insight.isNeverUsed) {
            return [
                {
                    type: "unused",
                    message: "Non utilizzata nelle condizioni attuali",
                    actionLabel: "Modifica target",
                    action: openRule,
                    fixSuggestion:
                        "Associa almeno una sede o un gruppo valido, oppure imposta il target globale."
                }
            ];
        }

        return [];
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
            setSimError("Data/ora non valida.");
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
            setSimError("Impossibile simulare le regole per i parametri selezionati.");
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
            setDailyTimelineError("Data/ora non valida per la timeline.");
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
                message: "Regola eliminata con successo.",
                duration: 2200
            });
            setIsDeleteModalOpen(false);
            setRuleToDelete(null);
            await loadRules();
        } catch (error) {
            console.error("Errore eliminazione regola:", error);
            showToast({
                type: "error",
                message: "Errore durante l'eliminazione della regola.",
                duration: 3000
            });
        }
    };

    const handleDuplicate = async (ruleId: string) => {
        try {
            await duplicateRule(ruleId, currentTenantId!);
            showToast({
                type: "success",
                message: "Regola duplicata e disabilitata.",
                duration: 2200
            });
            await loadRules();
        } catch (error) {
            console.error("Errore duplicazione regola:", error);
            showToast({
                type: "error",
                message: "Errore durante la duplicazione della regola.",
                duration: 3000
            });
        }
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedRuleIds);
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map(id => deleteLayoutRule(id)));
            showToast({
                type: "success",
                message: `${ids.length} regole eliminate con successo.`,
                duration: 2200
            });
            setSelectedRuleIds(new Set());
            await loadRules();
        } catch (error) {
            console.error("Errore eliminazione multipla regole:", error);
            showToast({
                type: "error",
                message: "Errore durante l'eliminazione di alcune regole.",
                duration: 3000
            });
        }
    };

    // TODO: implementare cleanup bozze abbandonate.
    // Le regole create con "Nuova regola" e mai completate
    // restano nel DB con enabled=false. Possibile soluzione:
    // edge function schedulata che elimina regole con
    // enabled=false + created_at > 7 giorni + nessun update.
    const handleCreateRule = useCallback(async (overrideType?: RuleType) => {
        const effectiveType = overrideType ?? (ruleTypeFilter === "all" ? undefined : ruleTypeFilter as RuleType);
        if (!effectiveType) return;
        setIsCreating(true);
        try {
            const timestamp = new Date().toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit"
            });
            const typeLabel =
                RULE_TYPE_TAB_OPTIONS.find(o => o.value === effectiveType)?.label ?? effectiveType;
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
            showToast({ message: "Errore nella creazione della regola.", type: "error" });
        } finally {
            setIsCreating(false);
        }
    }, [currentTenantId, ruleTypeFilter, navigate, showToast]);

    return (
        <section className={styles.programming}>
            <div className={styles.topArea}>
                <PageHeader
                    title="Programmazione"
                    businessName={selectedTenant?.name}
                    subtitle="Gestisci le regole del Rule Engine."
                    actions={
                        <div className={styles.headerActions}>
                            <div className={styles.viewToggle}>
                                <Tooltip content="Vista lista" side="bottom">
                                    <button
                                        type="button"
                                        className={`${styles.viewToggleBtn} ${viewMode === "list" ? styles.viewToggleBtnActive : ""}`}
                                        onClick={() => setViewMode("list")}
                                        aria-label="Vista lista"
                                    >
                                        <List size={16} />
                                    </button>
                                </Tooltip>
                                <Tooltip content="Vista calendario" side="bottom">
                                    <button
                                        type="button"
                                        className={`${styles.viewToggleBtn} ${viewMode === "calendar" ? styles.viewToggleBtnActive : ""}`}
                                        onClick={() => setViewMode("calendar")}
                                        aria-label="Vista calendario"
                                    >
                                        <CalendarDays size={16} />
                                    </button>
                                </Tooltip>
                            </div>
                            <Button
                                variant="secondary"
                                onClick={() => setIsSimulatorDrawerOpen(true)}
                                disabled={!currentTenantId}
                            >
                                Simula regole
                            </Button>
                            {ruleTypeFilter === "all" ? (
                                <div className={styles.newRuleDropdown}>
                                    <DropdownMenu
                                        trigger={
                                            <Button
                                                variant="primary"
                                                disabled={!currentTenantId || isCreating}
                                                loading={isCreating}
                                            >
                                                {isCreating ? "Creazione..." : "Nuova regola"}
                                            </Button>
                                        }
                                        placement="bottom-end"
                                    >
                                        <DropdownItem onClick={() => void handleCreateRule("layout")}>
                                            Layout
                                        </DropdownItem>
                                        <DropdownItem onClick={() => void handleCreateRule("featured")}>
                                            In evidenza
                                        </DropdownItem>
                                        <DropdownItem onClick={() => void handleCreateRule("price")}>
                                            Prezzi
                                        </DropdownItem>
                                        <DropdownItem onClick={() => void handleCreateRule("visibility")}>
                                            Visibilità
                                        </DropdownItem>
                                    </DropdownMenu>
                                </div>
                            ) : (
                                <Button
                                    variant="primary"
                                    onClick={() => void handleCreateRule()}
                                    disabled={!currentTenantId || isCreating}
                                    loading={isCreating}
                                >
                                    {isCreating ? "Creazione..." : "Nuova regola"}
                                </Button>
                            )}
                        </div>
                    }
                />
            </div>

            {viewMode === "list" ? (
                <>
                    <Tabs<RuleTypeFilter>
                        value={ruleTypeFilter}
                        onChange={tab => {
                            setRuleTypeFilter(tab);
                            setSelectedRuleIds(new Set());
                        }}
                    >
                        <Tabs.List>
                            {RULE_TYPE_TAB_OPTIONS.map(option => (
                                <Tabs.Tab key={option.value} value={option.value}>
                                    {option.label}
                                </Tabs.Tab>
                            ))}
                        </Tabs.List>
                    </Tabs>

                    <FilterBar
                        search={{
                            value: searchTerm,
                            onChange: setSearchTerm,
                            placeholder: "Cerca per nome, tipo, target o id..."
                        }}
                    />

                    <div className={styles.tableCard}>
                        <div className={styles.tabDescription}>
                            <Text variant="body-sm" colorVariant="muted">
                                {RULE_TYPE_TAB_OPTIONS.find(o => o.value === ruleTypeFilter)?.description}
                            </Text>
                        </div>

                        {isLoading ? (
                            <div className={styles.emptyState}>
                                <Text colorVariant="muted">Caricamento regole...</Text>
                            </div>
                        ) : filteredRules.length === 0 ? (
                            searchTerm ? (
                                <div className={styles.emptyState}>
                                    <Text colorVariant="muted">Nessuna regola corrisponde alla ricerca.</Text>
                                </div>
                            ) : (
                                <div className={styles.tabEmptyState}>
                                    <div className={styles.tabEmptyIcon}>
                                        <Calendar size={48} strokeWidth={1.2} />
                                    </div>
                                    <p className={styles.tabEmptyDescription}>
                                        {RULE_TYPE_TAB_OPTIONS.find(o => o.value === ruleTypeFilter)?.description ?? ""}
                                    </p>
                                    {ruleTypeFilter === "all" ? (
                                        <div className={styles.newRuleDropdown}>
                                            <DropdownMenu
                                                trigger={
                                                    <Button
                                                        variant="primary"
                                                        disabled={!currentTenantId || isCreating}
                                                        loading={isCreating}
                                                    >
                                                        {isCreating ? "Creazione..." : "Crea la prima regola"}
                                                    </Button>
                                                }
                                                placement="bottom-start"
                                            >
                                                <DropdownItem onClick={() => void handleCreateRule("layout")}>
                                                    Layout
                                                </DropdownItem>
                                                <DropdownItem onClick={() => void handleCreateRule("featured")}>
                                                    In evidenza
                                                </DropdownItem>
                                                <DropdownItem onClick={() => void handleCreateRule("price")}>
                                                    Prezzi
                                                </DropdownItem>
                                                <DropdownItem onClick={() => void handleCreateRule("visibility")}>
                                                    Visibilità
                                                </DropdownItem>
                                            </DropdownMenu>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            onClick={() => void handleCreateRule()}
                                            disabled={isCreating}
                                            loading={isCreating}
                                        >
                                            Crea la prima regola
                                        </Button>
                                    )}
                                </div>
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
                                                onSelect={handleSelectionChange}
                                                onClick={r => navigate(r.rule_type === "featured" ? `/business/${currentTenantId}/scheduling/featured/${r.id}` : `/business/${currentTenantId}/scheduling/${r.id}`)}
                                                onDelete={id => { setRuleToDelete(id); setIsDeleteModalOpen(true); }}
                                                onDuplicate={handleDuplicate}
                                                onToggleEnabled={handleToggleEnabled}
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
                                                onSelect={handleSelectionChange}
                                                onClick={r => navigate(r.rule_type === "featured" ? `/business/${currentTenantId}/scheduling/featured/${r.id}` : `/business/${currentTenantId}/scheduling/${r.id}`)}
                                                onDelete={id => { setRuleToDelete(id); setIsDeleteModalOpen(true); }}
                                                onDuplicate={handleDuplicate}
                                                onToggleEnabled={handleToggleEnabled}
                                            />
                                        ))}
                                    </RuleBlock>
                                )}

                                {draftRules.length > 0 && (
                                    <RuleBlock
                                        title="Bozze"
                                        count={draftRules.length}
                                        subtitle="Regole incomplete — completa i campi obbligatori"
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
                                                onSelect={handleSelectionChange}
                                                onClick={r => navigate(r.rule_type === "featured" ? `/business/${currentTenantId}/scheduling/featured/${r.id}` : `/business/${currentTenantId}/scheduling/${r.id}`)}
                                                onDelete={id => { setRuleToDelete(id); setIsDeleteModalOpen(true); }}
                                                onDuplicate={handleDuplicate}
                                                onToggleEnabled={handleToggleEnabled}
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
                                                onSelect={handleSelectionChange}
                                                onClick={r => navigate(r.rule_type === "featured" ? `/business/${currentTenantId}/scheduling/featured/${r.id}` : `/business/${currentTenantId}/scheduling/${r.id}`)}
                                                onDelete={id => { setRuleToDelete(id); setIsDeleteModalOpen(true); }}
                                                onDuplicate={handleDuplicate}
                                                onToggleEnabled={handleToggleEnabled}
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
                                                onSelect={handleSelectionChange}
                                                onClick={r => navigate(r.rule_type === "featured" ? `/business/${currentTenantId}/scheduling/featured/${r.id}` : `/business/${currentTenantId}/scheduling/${r.id}`)}
                                                onDelete={id => { setRuleToDelete(id); setIsDeleteModalOpen(true); }}
                                                onDuplicate={handleDuplicate}
                                                onToggleEnabled={handleToggleEnabled}
                                            />
                                        ))}
                                    </RuleBlock>
                                )}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <CalendarView
                    rules={rules}
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
                onDelete={() => void handleBulkDelete()}
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
                                Simulatore regole
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Verifica quali regole sono attive in un determinato momento.
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
                                const selectedActivity = activities.find(a => a.id === simActivityId);
                                const activitySlug = selectedActivity?.slug;
                                if (!simResult || !activitySlug || !simDateTime) return null;
                                return (
                                    <Button
                                        variant="primary"
                                        onClick={() => {
                                            const simDate = new Date(simDateTime);
                                            const url = `/${activitySlug}?simulate=${simDate.toISOString()}`;
                                            window.open(url, "_blank");
                                        }}
                                    >
                                        Visualizza anteprima
                                    </Button>
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
                                    Seleziona sede e data/ora per avviare la simulazione.
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
                                        <Text variant="caption" colorVariant="muted">Catalogo</Text>
                                        <Text variant="body-sm" weight={700}>
                                            {simResult.layout.scheduleId
                                                ? (rules.find(r => r.id === simResult.layout.scheduleId)?.name ?? simResult.layout.scheduleId)
                                                : "Nessuna regola attiva"}
                                        </Text>
                                        {simResult.layout.catalogId && (
                                            <Text variant="caption" colorVariant="muted">
                                                via {catalogById.get(simResult.layout.catalogId)?.name ?? simResult.layout.catalogId}
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
                                                    {featuredRule?.name ?? simResult.featuredRule?.scheduleId ?? "Nessuna regola attiva"}
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
                                                    {priceRule?.name ?? simResult.priceRuleId ?? "Nessuna regola attiva"}
                                                </Text>
                                                {priceRule && (
                                                    <Text variant="caption" colorVariant="muted">
                                                        {overrideCount} {overrideCount === 1 ? "prodotto" : "prodotti"}
                                                    </Text>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Visibilità */}
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
                                                <Text variant="caption" colorVariant="muted">Visibilità</Text>
                                                <Text variant="body-sm" weight={700}>
                                                    {visRule?.name ?? simResult.visibilityRule?.scheduleId ?? "Nessuna regola attiva"}
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
                                        Andamento giornaliero
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
                                                        : "Nessun catalogo";
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
                                                                    Spec:{" "}
                                                                    {getSpecificityLabel(
                                                                        block.layoutSpecificity
                                                                    )}
                                                                </span>
                                                                <span className={visibilityBadgeClassName}>
                                                                    Visibilità:{" "}
                                                                    {block.visibilityMode === "hide"
                                                                        ? "Nasconde"
                                                                        : block.visibilityMode === "disable"
                                                                          ? "Non disponibile"
                                                                          : "Nessuna"}
                                                                </span>
                                                                {block.priceRuleId && (
                                                                    <span className={styles.timelineBadgeNeutral}>
                                                                        Prezzi attivi
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
            <ModalLayout
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                width="xs"
                height="fit"
            >
                <ModalLayoutHeader>
                    <Text as="h3" variant="title-sm">
                        Eliminare regola?
                    </Text>
                </ModalLayoutHeader>
                <ModalLayoutContent>
                    <Text variant="body-sm">Questa azione è irreversibile.</Text>
                </ModalLayoutContent>
                <ModalLayoutFooter>
                    <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
                        Annulla
                    </Button>
                    <Button variant="danger" onClick={handleDeleteConfirm}>
                        Elimina
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>
        </section>
    );
}
