import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Globe, Building2, Users, AlertCircle, FileText, Loader2, Calendar } from "lucide-react";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { Button } from "@/components/ui/Button/Button";
import { Switch } from "@/components/ui/Switch/Switch";
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
    listLayoutRuleOptions,
    listLayoutRules,
    reorderSchedulesInLevel,
    updateScheduleEnabled,
    type LayoutRule,
    type LayoutRuleOption,
    type RuleType
} from "@/services/supabase/layoutScheduling";
import { computePriority, PRIORITY_LEVEL_ORDER, PRIORITY_LEVEL_LABELS, type PriorityLevel } from "@utils/priorityUtils";
import { PriorityGroup } from "./components/PriorityGroup";
import {
    resolveRulesForActivity,
    type ResolveRulesForActivityResult
} from "@/services/supabase/scheduleResolver";
import { buildRuleSummary, isRuleCurrentlyActive } from "@/utils/ruleHelpers";
import styles from "./Programming.module.scss";

type RuleTypeFilter = RuleType;

type RuleInsight = {
    isActiveNow: boolean;
    isOverridden: boolean;
    hasConflict: boolean;
    isNeverUsed: boolean;
    conflictingWithName?: string;
    overriddenByName?: string;
};

type RuleSuggestion = {
    type: "conflict" | "override" | "unused";
    message: string;
    actionLabel?: string;
    action?: () => void;
    fixSuggestion?: string;
};

type RuleExplainItem = {
    ruleId: string;
    ruleName: string;
    specificity: 0 | 1 | 2;
    priority: number;
    reason: string;
};

type RuleExplainByType = {
    winner: RuleExplainItem | null;
    discarded: RuleExplainItem[];
    ambiguityCount: number;
};

type SimulationAlert = {
    id: string;
    type: "warning" | "info";
    message: string;
};

type DailyTimelineBlock = {
    startMinutes: number;
    endMinutes: number;
    layoutCatalogId: string | null;
    layoutScheduleId: string | null;
    priceRuleId: string | null;
    visibilityScheduleId: string | null;
    visibilityMode: "hide" | "disable" | null;
    layoutSpecificity: number | null;
    priceSpecificity: number | null;
    visibilitySpecificity: number | null;
};

type ActivityGroupMemberRow = {
    group_id: string;
    activity_id: string;
};

const RULE_TYPE_TAB_OPTIONS: Array<{ value: RuleType; label: string; description: string }> = [
    { value: "layout", label: "Layout", description: "Definiscono quale catalogo e stile mostrare" },
    { value: "price", label: "Prezzi", description: "Sovrascrivono il prezzo di prodotti specifici" },
    { value: "visibility", label: "Visibilità", description: "Nascondono prodotti specifici per sede o orario" }
];

const DAILY_TIMELINE_STEP_MINUTES = 30;

function getRuleTypeLabel(ruleType: RuleType): string {
    if (ruleType === "layout") return "Layout";
    if (ruleType === "price") return "Prezzi";
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
    if (value === 2) return "Attività";
    if (value === 1) return "Gruppo";
    if (value === 0) return "Globale";
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

function getDiscardReason(
    winner: { rule: LayoutRule; specificity: 0 | 1 | 2 },
    candidate: { rule: LayoutRule; specificity: 0 | 1 | 2 }
): string {
    if (candidate.specificity < winner.specificity) {
        return "Esiste una regola più specifica per questa sede";
    }
    if (candidate.rule.priority > winner.rule.priority) {
        return "Esiste una regola con priorità più alta";
    }
    const createdDelta =
        new Date(candidate.rule.created_at).getTime() - new Date(winner.rule.created_at).getTime();
    if (createdDelta > 0) {
        return "È stata creata dopo una regola con stessa priorità";
    }
    if (candidate.rule.id.localeCompare(winner.rule.id) > 0) {
        return "È stata superata da un’altra regola con stessi criteri";
    }
    return "Precedenza inferiore secondo ordinamento corrente";
}

function formatMinutesToHourLabel(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60)
        .toString()
        .padStart(2, "0");
    const m = (totalMinutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
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

    const [searchTerm, setSearchTerm] = useState("");
    const typeFromUrl = searchParams.get("type") as RuleType | null;
    const [ruleTypeFilter, setRuleTypeFilter] = useState<RuleTypeFilter>(
        typeFromUrl && ["layout", "price", "visibility"].includes(typeFromUrl)
            ? typeFromUrl
            : "layout"
    );
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());

    const [simActivityId, setSimActivityId] = useState("");
    const [simDateTime, setSimDateTime] = useState(() => toDateTimeLocalValue(new Date()));
    const [simResult, setSimResult] = useState<ResolveRulesForActivityResult | null>(null);
    const [isSimLoading, setIsSimLoading] = useState(false);
    const [simError, setSimError] = useState<string | null>(null);
    const [simActivityGroupIds, setSimActivityGroupIds] = useState<string[]>([]);
    const [simShowWarningsOnly, setSimShowWarningsOnly] = useState(false);
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

    const filteredRules = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        const typeFilteredRules = rules.filter(rule => rule.rule_type === ruleTypeFilter);

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

    const groupedRules = useMemo(() => {
        const map = new Map<PriorityLevel, LayoutRule[]>();
        for (const level of PRIORITY_LEVEL_ORDER) {
            map.set(level, []);
        }
        for (const rule of filteredRules) {
            const level = rule.priority_level ?? "medium";
            map.get(level as PriorityLevel)?.push(rule);
        }
        for (const level of PRIORITY_LEVEL_ORDER) {
            map.get(level)!.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        }
        return map;
    }, [filteredRules]);

    const handleReorder = useCallback(
        async (level: PriorityLevel, reorderedRules: LayoutRule[]) => {
            const updates = reorderedRules.map((rule, index) => ({
                id: rule.id,
                display_order: index,
                priority_level: level
            }));
            // Optimistic update
            setRules(prev => {
                const next = [...prev];
                for (const upd of updates) {
                    const idx = next.findIndex(r => r.id === upd.id);
                    if (idx !== -1) {
                        next[idx] = {
                            ...next[idx],
                            display_order: upd.display_order,
                            priority: computePriority(level, upd.display_order)
                        };
                    }
                }
                return next;
            });
            try {
                await reorderSchedulesInLevel(currentTenantId!, updates);
            } catch (error) {
                console.error("Errore riordino regole:", error);
                showToast({ type: "error", message: "Impossibile salvare l'ordine.", duration: 3000 });
                await loadRules();
            }
        },
        [currentTenantId, loadRules, showToast]
    );

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

        (["layout", "price", "visibility"] as RuleType[]).forEach(type => {
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
                }
            }
        });

        for (const rule of rules) {
            const isActiveNow = rule.enabled && isRuleCurrentlyActive(rule, currentTime);
            const canTargetAnyActivity = ruleTargetsAnyActivity(rule);
            const participatesNow = ruleParticipatesNow.has(rule.id);
            const winsNow = ruleWinsNow.has(rule.id);

            insights.set(rule.id, {
                isActiveNow,
                isOverridden: isActiveNow && participatesNow && !winsNow,
                hasConflict: isActiveNow && ruleConflictsNow.has(rule.id),
                isNeverUsed: !canTargetAnyActivity,
                conflictingWithName: Array.from(ruleConflictingWithNames.get(rule.id) ?? [])[0],
                overriddenByName: ruleOverriddenByName.get(rule.id)
            });
        }

        return insights;
    }, [activities, activityIdsByGroupId, currentTime, rules]);

    const winningRuleIds = useMemo(() => {
        return new Set(
            rules
                .filter(rule => {
                    const insight = ruleInsightsById.get(rule.id);
                    return Boolean(insight?.isActiveNow && !insight.isOverridden);
                })
                .map(rule => rule.id)
        );
    }, [rules, ruleInsightsById]);

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

    const isDraft = (rule: LayoutRule) => {
        if (rule.rule_type === "layout") {
            return !rule.layout?.catalog_id || !rule.layout?.style_id;
        }
        if (rule.rule_type === "price") {
            return rule.price_overrides.length === 0;
        }
        if (rule.rule_type === "visibility") {
            return rule.visibility_overrides.length === 0;
        }
        return false;
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
            const [result, groupMembersRes] = await Promise.all([
                resolveRulesForActivity({
                    supabase,
                    activityId: simActivityId,
                    now: selectedDate,
                    includeLayoutStyle: true
                }),
                supabase
                    .from("activity_group_members")
                    .select("group_id")
                    .eq("activity_id", simActivityId)
            ]);
            setSimResult(result);
            if (groupMembersRes.error) throw groupMembersRes.error;
            setSimActivityGroupIds(
                Array.from(new Set((groupMembersRes.data ?? []).map(row => row.group_id)))
            );
        } catch (error) {
            console.error("Errore simulazione regole:", error);
            setSimResult(null);
            setSimError("Impossibile simulare le regole per i parametri selezionati.");
            setSimActivityGroupIds([]);
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

        try {
            setIsDailyTimelineLoading(true);
            setDailyTimelineError(null);

            const slotResults = await Promise.all(
                slotOffsets.map(async minutesOffset => {
                    const slotTime = new Date(dayStart);
                    slotTime.setMinutes(minutesOffset);

                    const result = await resolveRulesForActivity({
                        supabase,
                        activityId: simActivityId,
                        now: slotTime,
                        includeLayoutStyle: false
                    });

                    return {
                        minutesOffset,
                        layoutCatalogId: result.layout.catalogId,
                        layoutScheduleId: result.layout.scheduleId,
                        priceRuleId: result.priceRuleId,
                        visibilityScheduleId: result.visibilityRule?.scheduleId ?? null,
                        visibilityMode: result.visibilityRule?.mode ?? null,
                        layoutSpecificity: result.debug?.selectedLayoutRuleSpecificity ?? null,
                        priceSpecificity: result.debug?.selectedPriceRuleSpecificity ?? null,
                        visibilitySpecificity: result.debug?.selectedVisibilityRuleSpecificity ?? null
                    };
                })
            );

            const merged: DailyTimelineBlock[] = [];
            for (const slot of slotResults) {
                const currentKey = [
                    slot.layoutCatalogId ?? "",
                    slot.layoutScheduleId ?? "",
                    slot.priceRuleId ?? "",
                    slot.visibilityScheduleId ?? "",
                    slot.visibilityMode ?? "",
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
                    layoutSpecificity: slot.layoutSpecificity,
                    priceSpecificity: slot.priceSpecificity,
                    visibilitySpecificity: slot.visibilitySpecificity
                });
            }

            setDailyTimelineBlocks(merged);
        } catch (error) {
            console.error("Errore calcolo andamento giornaliero:", error);
            setDailyTimelineBlocks([]);
            setDailyTimelineError("Impossibile calcolare l'andamento giornaliero.");
        } finally {
            setIsDailyTimelineLoading(false);
        }
    }, [simActivityId, simDateTime]);

    const simulationExplanation = useMemo(() => {
        if (!simActivityId || !simDateTime || !simResult) return null;
        const selectedDate = new Date(simDateTime);
        if (Number.isNaN(selectedDate.getTime())) return null;

        const selectedGroupIdSet = new Set(simActivityGroupIds);
        const winnerRuleIdByType: Record<RuleType, string | null> = {
            layout: simResult.layout.scheduleId ?? null,
            price: simResult.priceRuleId ?? null,
            visibility: simResult.visibilityRule?.scheduleId ?? null
        };
        const winnerSpecificityByType: Record<RuleType, 0 | 1 | 2 | null> = {
            layout: (simResult.debug?.selectedLayoutRuleSpecificity as 0 | 1 | 2 | null) ?? null,
            price: (simResult.debug?.selectedPriceRuleSpecificity as 0 | 1 | 2 | null) ?? null,
            visibility:
                (simResult.debug?.selectedVisibilityRuleSpecificity as 0 | 1 | 2 | null) ?? null
        };
        const byType: Record<RuleType, RuleExplainByType> = {
            layout: { winner: null, discarded: [], ambiguityCount: 0 },
            price: { winner: null, discarded: [], ambiguityCount: 0 },
            visibility: { winner: null, discarded: [], ambiguityCount: 0 }
        };

        (["layout", "price", "visibility"] as RuleType[]).forEach(type => {
            const typeRules = rules.filter(rule => rule.rule_type === type);
            const eligible: Array<{ rule: LayoutRule; specificity: 0 | 1 | 2 }> = [];
            const discarded: RuleExplainItem[] = [];

            for (const rule of typeRules) {
                const legacyActivityMatch =
                    rule.target_type === "activity" && rule.target_id === simActivityId;
                const legacyGroupMatch =
                    rule.target_type === "activity_group" && selectedGroupIdSet.has(rule.target_id);
                const activityMatch = rule.activityIds.includes(simActivityId) || legacyActivityMatch;
                const groupMatch =
                    rule.groupIds.some(groupId => selectedGroupIdSet.has(groupId)) || legacyGroupMatch;
                const globalMatch = rule.applyToAll;

                if (!rule.enabled) {
                    discarded.push({
                        ruleId: rule.id,
                        ruleName: getRuleDisplayName(rule),
                        specificity: 0,
                        priority: rule.priority,
                        reason: "Questa regola è disattivata"
                    });
                    continue;
                }

                let specificity: 0 | 1 | 2 | null = null;
                if (activityMatch) specificity = 2;
                else if (groupMatch) specificity = 1;
                else if (globalMatch) specificity = 0;

                if (specificity === null) {
                    discarded.push({
                        ruleId: rule.id,
                        ruleName: getRuleDisplayName(rule),
                        specificity: 0,
                        priority: rule.priority,
                        reason: "Questa regola non si applica alla sede selezionata"
                    });
                    continue;
                }

                if (!isRuleCurrentlyActive(rule, selectedDate)) {
                    discarded.push({
                        ruleId: rule.id,
                        ruleName: getRuleDisplayName(rule),
                        specificity,
                        priority: rule.priority,
                        reason: "Questa regola non è attiva nel momento selezionato"
                    });
                    continue;
                }

                eligible.push({ rule, specificity });
            }

            eligible.sort(compareCandidateSpecificityFirst);
            const resolvedWinnerId = winnerRuleIdByType[type];
            const winner =
                eligible.find(candidate => candidate.rule.id === resolvedWinnerId) ??
                (resolvedWinnerId
                    ? ({
                          rule:
                              typeRules.find(rule => rule.id === resolvedWinnerId) ??
                              ({
                                  id: resolvedWinnerId,
                                  name: resolvedWinnerId,
                                  rule_type: type,
                                  priority: 10,
                                  created_at: new Date(0).toISOString()
                              } as LayoutRule),
                          specificity: winnerSpecificityByType[type] ?? 0
                      } as { rule: LayoutRule; specificity: 0 | 1 | 2 })
                    : null);

            const winnerExplain: RuleExplainItem | null = winner
                ? {
                      ruleId: winner.rule.id,
                      ruleName: getRuleDisplayName(winner.rule),
                      specificity: winner.specificity,
                      priority: winner.rule.priority,
                      reason:
                          winner.specificity === 2
                              ? "Questa regola è stata selezionata perché è specifica per questa sede."
                              : winner.specificity === 1
                                ? "Questa regola è stata selezionata perché è la più specifica tra quelle disponibili."
                                : "Questa regola è stata selezionata perché non ci sono regole più specifiche attive in questo momento."
                  }
                : null;

            const precedenceDiscarded = eligible
                .filter(candidate => candidate.rule.id !== winner?.rule.id)
                .map(candidate => ({
                    ruleId: candidate.rule.id,
                    ruleName: getRuleDisplayName(candidate.rule),
                    specificity: candidate.specificity,
                    priority: candidate.rule.priority,
                    reason: winner ? getDiscardReason(winner, candidate) : "Precedenza inferiore"
                }));

            const ambiguityCount = winner
                ? eligible
                      .filter(candidate => candidate.rule.id !== winner.rule.id)
                      .filter(
                          candidate =>
                              candidate.specificity === winner.specificity &&
                              candidate.rule.priority === winner.rule.priority
                      ).length
                : 0;

            byType[type] = {
                winner: winnerExplain,
                discarded: [...precedenceDiscarded, ...discarded],
                ambiguityCount
            };
        });

        return byType;
    }, [rules, simActivityGroupIds, simActivityId, simDateTime, simResult]);

    const simulationAlerts = useMemo<SimulationAlert[]>(() => {
        if (!simulationExplanation || !simResult) return [];

        const rawAlerts: SimulationAlert[] = [];
        const labels: Record<RuleType, string> = {
            layout: "Layout",
            price: "Prezzi",
            visibility: "Visibilità"
        };

        const missingTypes = (["layout", "price", "visibility"] as RuleType[]).filter(
            type => !simulationExplanation[type].winner
        );

        if (missingTypes.length === 3) {
            rawAlerts.push({
                id: "no-active-rules",
                type: "warning",
                message:
                    "Nel momento selezionato non risulta attiva nessuna regola. Verifica stato, target e finestre temporali."
            });
        } else if (missingTypes.length > 0) {
            rawAlerts.push({
                id: "partial-missing-rules",
                type: "info",
                message: `Nel momento selezionato non risultano attive regole per: ${missingTypes
                    .map(type => labels[type])
                    .join(", ")}.`
            });
        }

        if (!simResult.layout.scheduleId) {
            rawAlerts.push({
                id: "missing-layout",
                type: "warning",
                message:
                    "Non c'è un layout attivo per questa sede e questo orario: il catalogo potrebbe non essere mostrato."
            });
        }

        (["layout", "price", "visibility"] as RuleType[]).forEach(type => {
            const ambiguityCount = simulationExplanation[type].ambiguityCount;
            if (ambiguityCount > 0) {
                rawAlerts.push({
                    id: `ambiguous-${type}`,
                    type: "warning",
                    message: `${labels[type]}: trovate ${
                        ambiguityCount + 1
                    } regole con stessa specificità e stessa priorità. La scelta dipende dai criteri di tie-break (data creazione/ID).`
                });
            }
        });

        if ((simResult.debug?.candidatesCount ?? 0) === 0) {
            rawAlerts.push({
                id: "no-candidates",
                type: "info",
                message:
                    "Non sono stati trovati candidati per questa simulazione. Controlla target, stato regole e configurazioni globali."
            });
        }

        // Dedup by message and keep the highest severity if duplicates exist.
        const dedupByMessage = new Map<string, SimulationAlert>();
        for (const alert of rawAlerts) {
            const key = alert.message.trim().toLowerCase();
            const current = dedupByMessage.get(key);
            if (!current) {
                dedupByMessage.set(key, alert);
                continue;
            }
            if (current.type === "info" && alert.type === "warning") {
                dedupByMessage.set(key, alert);
            }
        }

        const severityRank: Record<SimulationAlert["type"], number> = {
            warning: 0,
            info: 1
        };

        return Array.from(dedupByMessage.values()).sort((a, b) => {
            const severityDelta = severityRank[a.type] - severityRank[b.type];
            if (severityDelta !== 0) return severityDelta;
            return a.message.localeCompare(b.message, "it");
        });
    }, [simResult, simulationExplanation]);

    const displayedSimulationAlerts = useMemo(
        () =>
            simShowWarningsOnly
                ? simulationAlerts.filter(alert => alert.type === "warning")
                : simulationAlerts,
        [simShowWarningsOnly, simulationAlerts]
    );

    const hasAnyRuleActiveInDay = useMemo(
        () =>
            dailyTimelineBlocks.some(
                block =>
                    block.layoutScheduleId !== null ||
                    block.priceRuleId !== null ||
                    block.visibilityScheduleId !== null
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

    const handleCreateRule = useCallback(async () => {
        setIsCreating(true);
        try {
            const timestamp = new Date().toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit"
            });
            const typeLabel =
                RULE_TYPE_TAB_OPTIONS.find(o => o.value === ruleTypeFilter)?.label ?? ruleTypeFilter;
            const name = `Nuova regola ${typeLabel} · ${timestamp}`;

            const newRuleId = await createRuleDraft({
                tenantId: currentTenantId!,
                ruleType: ruleTypeFilter,
                name
            });
            navigate(`/business/${currentTenantId}/scheduling/${newRuleId}?fromType=${ruleTypeFilter}`);
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
                            <Button
                                variant="secondary"
                                onClick={() => setIsSimulatorDrawerOpen(true)}
                                disabled={!currentTenantId}
                            >
                                Simula regole
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => void handleCreateRule()}
                                disabled={!currentTenantId || isCreating}
                                loading={isCreating}
                            >
                                {isCreating ? "Creazione..." : "Nuova regola"}
                            </Button>
                        </div>
                    }
                />
            </div>

            <Tabs<RuleType>
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
                    <EmptyState
                        icon={<Calendar size={40} strokeWidth={1.5} />}
                        title={searchTerm ? "Nessuna regola trovata" : "Nessuna regola configurata"}
                        description={
                            searchTerm
                                ? "Nessuna regola corrisponde alla ricerca."
                                : RULE_TYPE_TAB_OPTIONS.find(o => o.value === ruleTypeFilter)
                                      ?.description ?? ""
                        }
                        action={
                            !searchTerm ? (
                                <Button
                                    variant="primary"
                                    onClick={() => void handleCreateRule()}
                                    disabled={isCreating}
                                    loading={isCreating}
                                >
                                    + Crea la prima regola
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <div className={styles.groupedList}>
                        {PRIORITY_LEVEL_ORDER.map(level => (
                            <PriorityGroup
                                key={level}
                                level={level}
                                label={PRIORITY_LEVEL_LABELS[level]}
                                rules={groupedRules.get(level) ?? []}
                                selectedIds={selectedRuleIds}
                                onSelectionChange={handleSelectionChange}
                                onReorder={handleReorder}
                                onRuleClick={rule =>
                                    navigate(`/business/${currentTenantId}/scheduling/${rule.id}`)
                                }
                                onDeleteRule={id => {
                                    setRuleToDelete(id);
                                    setIsDeleteModalOpen(true);
                                }}
                                onToggleEnabled={handleToggleEnabled}
                                updatingRules={updatingRules}
                                activityById={activityById}
                                activityGroups={activityGroups}
                                winningRuleIds={winningRuleIds}
                                ruleInsightsById={ruleInsightsById}
                            />
                        ))}
                    </div>
                )}
            </div>

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
                            <Button
                                variant="primary"
                                onClick={() => {
                                    void runSimulation();
                                    void runDailyTimeline();
                                }}
                                disabled={
                                    !simActivityId ||
                                    !simDateTime ||
                                    isSimLoading ||
                                    isDailyTimelineLoading
                                }
                                loading={isSimLoading || isDailyTimelineLoading}
                            >
                                Aggiorna simulazione
                            </Button>
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
                                {simulationAlerts.length > 0 && (
                                    <div className={styles.simAlertsBlock}>
                                        <div className={styles.simAlertsHeader}>
                                            <Text variant="caption" weight={700}>
                                                Alert simulazione ({displayedSimulationAlerts.length}/
                                                {simulationAlerts.length})
                                            </Text>
                                            <div className={styles.simAlertsToggle}>
                                                <Switch
                                                    checked={simShowWarningsOnly}
                                                    onChange={setSimShowWarningsOnly}
                                                />
                                                <Text variant="caption" colorVariant="muted">
                                                    Mostra solo warning
                                                </Text>
                                            </div>
                                        </div>

                                        {displayedSimulationAlerts.length > 0 ? (
                                            displayedSimulationAlerts.map(alert => (
                                                <div
                                                    key={alert.id}
                                                    className={`${styles.simAlertCard} ${
                                                        alert.type === "warning"
                                                            ? styles.simAlertWarning
                                                            : styles.simAlertInfo
                                                    }`}
                                                >
                                                    <Text
                                                        variant="caption"
                                                        colorVariant={
                                                            alert.type === "warning"
                                                                ? "error"
                                                                : "muted"
                                                        }
                                                    >
                                                        {alert.message}
                                                    </Text>
                                                </div>
                                            ))
                                        ) : (
                                            <div className={styles.simAlertCard}>
                                                <Text variant="caption" colorVariant="muted">
                                                    Nessun warning da mostrare con il filtro attivo.
                                                </Text>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className={styles.simResultCard}>
                                    <Text variant="caption" colorVariant="muted">
                                        Layout/Catalog attivo
                                    </Text>
                                    <Text variant="body-sm" weight={700}>
                                        {simResult.layout.catalogId
                                            ? (catalogById.get(simResult.layout.catalogId)?.name ??
                                              simResult.layout.catalogId)
                                            : "Nessun catalogo attivo"}
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        Regola:{" "}
                                        {simResult.layout.scheduleId
                                            ? (rules.find(rule => rule.id === simResult.layout.scheduleId)
                                                  ?.name ?? simResult.layout.scheduleId)
                                            : "Nessuna"}
                                    </Text>
                                </div>

                                <div className={styles.simResultCard}>
                                    <Text variant="caption" colorVariant="muted">
                                        Price rule attiva
                                    </Text>
                                    <Text variant="body-sm" weight={700}>
                                        {simResult.priceRuleId
                                            ? (rules.find(rule => rule.id === simResult.priceRuleId)
                                                  ?.name ?? simResult.priceRuleId)
                                            : "Nessuna"}
                                    </Text>
                                </div>

                                <div className={styles.simResultCard}>
                                    <Text variant="caption" colorVariant="muted">
                                        Visibility rule attiva
                                    </Text>
                                    <Text variant="body-sm" weight={700}>
                                        {simResult.visibilityRule?.scheduleId
                                            ? (rules.find(
                                                  rule => rule.id === simResult.visibilityRule?.scheduleId
                                              )?.name ?? simResult.visibilityRule.scheduleId)
                                            : "Nessuna"}
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        Mode: {simResult.visibilityRule?.mode ?? "-"}
                                    </Text>
                                </div>

                                <div className={styles.simWhyCard}>
                                    <Text variant="body-sm" weight={700}>
                                        Perché ha vinto
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        Ordinamento runtime: specificità target (activity {" > "}
                                        activity_group {" > "} apply_to_all), poi priority ASC,
                                        created_at ASC, id ASC.
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        Specificità selezionate — Layout:{" "}
                                        {getSpecificityLabel(
                                            simResult.debug?.selectedLayoutRuleSpecificity ?? null
                                        )}
                                        , Price:{" "}
                                        {getSpecificityLabel(
                                            simResult.debug?.selectedPriceRuleSpecificity ?? null
                                        )}
                                        , Visibility:{" "}
                                        {getSpecificityLabel(
                                            simResult.debug?.selectedVisibilityRuleSpecificity ?? null
                                        )}
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        Candidati valutati: {simResult.debug?.candidatesCount ?? 0}
                                    </Text>
                                </div>

                                {simulationExplanation && (
                                    <>
                                        {([
                                            ["layout", "Layout"],
                                            ["price", "Prezzi"],
                                            ["visibility", "Visibilità"]
                                        ] as Array<[RuleType, string]>).map(([type, label]) => {
                                            const explain = simulationExplanation[type];
                                            return (
                                                <div key={type} className={styles.simWhyCard}>
                                                    <Text variant="body-sm" weight={700}>
                                                        {label}: dettaglio decisione
                                                    </Text>
                                                    <Text variant="caption" colorVariant="muted">
                                                        Vincente:{" "}
                                                        {explain.winner
                                                            ? `${explain.winner.ruleName} · specificità ${getSpecificityLabel(
                                                                  explain.winner.specificity
                                                              )} · priorità ${explain.winner.priority}`
                                                            : "Nessuna regola vincente"}
                                                    </Text>
                                                    {explain.discarded.length > 0 ? (
                                                        <div className={styles.simDiscardList}>
                                                            {explain.discarded.slice(0, 8).map(item => (
                                                                <div
                                                                    key={item.ruleId}
                                                                    className={styles.simDiscardItem}
                                                                >
                                                                    <Text
                                                                        variant="caption"
                                                                        colorVariant="muted"
                                                                    >
                                                                        {item.ruleName} ·{" "}
                                                                        {getSpecificityLabel(
                                                                            item.specificity
                                                                        )}{" "}
                                                                        · P{item.priority} —{" "}
                                                                        {item.reason}
                                                                    </Text>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <Text variant="caption" colorVariant="muted">
                                                            Nessuna regola scartata.
                                                        </Text>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </>
                                )}

                                {(() => {
                                    const selectedActivity = activities.find(a => a.id === simActivityId);
                                    const activitySlug = selectedActivity?.slug;
                                    if (!activitySlug || !simDateTime) return null;
                                    return (
                                        <Button
                                            variant="secondary"
                                            onClick={() => {
                                                const simDate = new Date(simDateTime);
                                                const url = `/${activitySlug}?simulate=${simDate.toISOString()}`;
                                                window.open(url, "_blank");
                                            }}
                                        >
                                            Apri anteprima →
                                        </Button>
                                    );
                                })()}

                                <div className={styles.simWhyCard}>
                                    <Text variant="body-sm" weight={700}>
                                        Andamento giornaliero
                                    </Text>

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
                                                                {block.visibilityMode ?? "Nessuna"}
                                                            </span>
                                                            {block.priceRuleId && (
                                                                <span
                                                                    className={
                                                                        styles.timelineBadgeNeutral
                                                                    }
                                                                >
                                                                    Prezzi attivi
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
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
