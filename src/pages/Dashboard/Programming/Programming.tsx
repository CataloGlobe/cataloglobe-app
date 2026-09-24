import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Calendar, ChevronDown, List, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import { IconButton } from "@/components/ui/Button/IconButton";
import { ChipGroupSingle } from "@/components/ui/Chip/ChipGroup";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { BulkBar } from "@/components/ui/BulkBar/BulkBar";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Menu } from "@/components/ui/Menu";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { SplitButton, type SplitButtonAction } from "@/components/ui/SplitButton";
import { Select } from "@/components/ui/Select/Select";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { useSedeScope, SCOPE_ALL } from "@/hooks/useSedeScope";
import { usePermissions } from "@/context/PermissionsContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnActivity, canDoOnAnyActivity } from "@/lib/permissions";
import { listActivityIdsByGroup } from "@/services/supabase/activity-groups";
import { PageGate } from "@/components/PageGate/PageGate";
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
import { RuleTable, type RuleInsight } from "./components/RuleTable";
import { HowItWorksLink, RuleTypeHelpModal } from "./components/RuleTypeHelpModal";
import { CalendarView } from "./components/CalendarView";
import { RuleSimulatorDrawer } from "./components/RuleSimulatorDrawer";
import { isRuleCurrentlyActive } from "@/utils/ruleHelpers";
import { isLayoutRuleDraft } from "@/utils/scheduleDraft";
import { ruleReachesAnyActivity, describeZeroReach } from "@/utils/scheduleReach";
import { deriveScheduleStatus } from "@/utils/scheduleStatus";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { ruleTypeLabel } from "./ruleTypeLabel";
import { withPluralArticle } from "@/utils/ruleDetailForm";
import styles from "./Programming.module.scss";

type RuleTypeFilter = RuleType | "all";

type RuleTypeOption = { value: RuleTypeFilter; label: string; description: string };

/** I valori del filtro per tipo, col nome del verticale (§22, dizionario #12). */
function ruleTypeOptions(catalogLabel: string, products: string): RuleTypeOption[] {
    const menu = catalogLabel.toLowerCase();
    return [
        { value: "layout", label: ruleTypeLabel("layout", catalogLabel), description: `Decidono quale ${menu} e quale stile mostrare` },
        { value: "featured", label: ruleTypeLabel("featured", catalogLabel), description: "Programmano quando mostrare contenuti in evidenza" },
        { value: "price", label: ruleTypeLabel("price", catalogLabel), description: `Cambiano il prezzo di alcuni ${products}` },
        { value: "visibility", label: ruleTypeLabel("visibility", catalogLabel), description: `Nascondono alcuni ${products}, o li segnano come non disponibili` },
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
const emptyStateCopy = (menu: string, product: string, products: string): Record<RuleTypeFilter, { title: string; description: string }> => ({
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
            `Happy hour del giovedì, promozione di agosto: il ${product} resta uno, cambia solo il prezzo nel periodo che scegli.`
    },
    visibility: {
        title: `Gestisci ${withPluralArticle(products)} finiti o fuori stagione`,
        description:
            "Puoi nasconderlo del tutto o lasciarlo visibile segnandolo come non disponibile, per una sede o in certi orari."
    },
    all: {
        title: "Le regole decidono cosa vedono i clienti, e quando",
        description:
            `${menu.charAt(0).toUpperCase()}${menu.slice(1)} e stile, contenuti in risalto, sconti e disponibilità: ogni regola vale per una sede e una finestra di tempo.`
    }
});

function getRuleTargetLabel(rule: LayoutRule, activityById: Map<string, LayoutRuleOption>): string {
    if (rule.target_type === "activity_group") {
        if (rule.target_group?.is_system) return "Tutte le sedi";
        return rule.target_group?.name ?? rule.target_id;
    }

    return activityById.get(rule.target_id)?.name ?? rule.target_id;
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

export default function Programming() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const currentTenantId = useTenantId();
    const { showToast } = useToast();
    const { catalogLabel, productLabel, productLabelPlural } = useVerticalConfig();
    const typeOptions = useMemo(() => ruleTypeOptions(catalogLabel, productLabelPlural.toLowerCase()), [catalogLabel, productLabelPlural]);
    const emptyCopy = useMemo(
        () => emptyStateCopy(catalogLabel.toLowerCase(), productLabel.toLowerCase(), productLabelPlural.toLowerCase()),
        [catalogLabel, productLabel, productLabelPlural]
    );
    const isPhone = useMediaQuery("(max-width: 767px)");
    const ruleHref = useCallback(
        (rule: { id: string; rule_type: RuleType }) =>
            rule.rule_type === "featured"
                ? `/business/${currentTenantId}/scheduling/featured/${rule.id}`
                : `/business/${currentTenantId}/scheduling/${rule.id}`,
        [currentTenantId]
    );
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
    const [loadFailed, setLoadFailed] = useState(false);
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
            setLoadFailed(false);
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
            setLoadFailed(true);
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, canRead]);

    useEffect(() => {
        void loadInitialData();
    }, [loadInitialData]);

    // Sede e ricerca: i conteggi del filtro per tipo si leggono da qui.
    const searchedRules = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        let result = rules;

        // 1. Filter by selected activity
        if (filterActivityId) {
            result = result.filter(rule => {
                if (rule.applyToAll) return true;
                if (rule.activityIds.includes(filterActivityId)) return true;
                return rule.groupIds.some(gId =>
                    (activityIdsByGroupId[gId] ?? []).includes(filterActivityId)
                );
            });
        }

        // 2. Filter by search term
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
    }, [activityById, activityIdsByGroupId, catalogById, catalogLabel, filterActivityId, rules, searchTerm, styleById]);

    const filteredRules = useMemo(
        () => (ruleTypeFilter === "all" ? searchedRules : searchedRules.filter(rule => rule.rule_type === ruleTypeFilter)),
        [ruleTypeFilter, searchedRules]
    );

    const typeCounts = useMemo(() => {
        const counts: Record<RuleTypeFilter, number> = { layout: 0, featured: 0, price: 0, visibility: 0, all: searchedRules.length };
        for (const rule of searchedRules) counts[rule.rule_type] += 1;
        return counts;
    }, [searchedRules]);

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
        const ruleOverriddenById = new Map<string, string>();
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
                        ruleOverriddenById.set(candidate.rule.id, winnerEntry.rule.id);
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
                overriddenById: ruleOverriddenById.get(rule.id),
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
                size="sm"
                options={[
                    { value: "list", label: "Elenco", icon: <List size={16} /> },
                    { value: "calendar", label: "Settimana", icon: <CalendarDays size={16} /> }
                ]}
            />
            <SplitButton actions={headerSplitActions} loading={isCreating} />
        </div>
    ), [viewMode, searchTerm, headerSplitActions, isCreating]);

    // Stessa toolbar dichiarata a dati, per lo stato compatto: "Simula
    // regole" scende nel kebab, il toggle lista/calendario resta un'icona a
    // vista e "Nuova regola" resta il bottone pieno. Il filtro per tipo sta
    // sopra l'elenco, non in testata (passo 2).
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
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
                      label: "Settimana",
                      onClick: () => setViewMode("calendar")
                  }
                : {
                      icon: <List size={18} />,
                      label: "Elenco",
                      onClick: () => setViewMode("list")
                  }
        ],
        // `headerSplitActions` è già in ordine di lettura: le secondarie
        // precedono la primaria, che è l'ultima.
        secondaryActions: headerSplitActions.slice(0, -1),
        primaryAction: headerSplitActions[headerSplitActions.length - 1],
        loading: isCreating
    }), [viewMode, searchTerm, headerSplitActions, isCreating]);

    usePageHeader({
        actions: headerActions,
        compact: headerCompact,
    });

    const statusGroups: Array<{
        key: string;
        title: string;
        subtitle?: string;
        rules: LayoutRule[];
        open: boolean;
        setOpen?: (open: boolean) => void;
    }> = [
        { key: "active", title: "Adesso", rules: activeRules, open: true },
        { key: "scheduled", title: "Programmate", rules: scheduledRules, open: true },
        { key: "drafts", title: "Bozze", subtitle: "Incomplete, o senza una sede raggiunta", rules: draftRules, open: showDrafts, setOpen: setShowDrafts },
        { key: "disabled", title: "Disabilitate", rules: disabledRules, open: showDisabled, setOpen: setShowDisabled },
        { key: "expired", title: "Scadute", rules: expiredRules, open: showExpired, setOpen: setShowExpired }
    ];

    const tableProps = {
        insights: ruleInsightsById,
        showTypeBadge: ruleTypeFilter === "all",
        activityById,
        activityGroups,
        ruleHref,
        onOpen: (rule: LayoutRule) => navigate(ruleHref(rule)),
        updatingIds: updatingRules,
        onToggleEnabled: canWrite ? handleToggleEnabled : undefined,
        onDuplicate: canWrite ? handleDuplicate : undefined,
        onDelete: canWrite
            ? (id: string) => {
                  setRuleToDelete(id);
                  setIsDeleteModalOpen(true);
              }
            : undefined,
        selectedIds: canWrite ? Array.from(selectedRuleIds) : undefined,
        onSelectedIdsChange: canWrite ? (ids: string[]) => setSelectedRuleIds(new Set(ids)) : undefined
    };

    return (
        <PageGate readPermission="scheduling.read" activityId={filterActivityId}>
            {() => (
        <section className={styles.programming}>
            <div className={styles.listHead}>
                {isPhone ? (
                    <Select
                        label="Tipo di regola"
                        value={ruleTypeFilter}
                        onChange={event => handleRuleTypeFilterChange(event.target.value as RuleTypeFilter)}
                        options={typeOptions.map(option => ({
                            value: option.value,
                            label: `${option.label} (${typeCounts[option.value]})`
                        }))}
                    />
                ) : (
                    <ChipGroupSingle<RuleTypeFilter>
                        ariaLabel="Tipo di regola"
                        value={ruleTypeFilter}
                        onChange={handleRuleTypeFilterChange}
                        options={typeOptions.map(option => ({
                            value: option.value,
                            label: `${option.label} ${typeCounts[option.value]}`
                        }))}
                        layout="auto"
                        shape="pill"
                    />
                )}
                {/* La frase del tipo ha senso sopra un elenco, non sopra un
                    vuoto (che porta già il proprio testo). */}
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
            </div>

            {viewMode === "list" ? (
                loadFailed ? (
                    <InlineBanner
                        variant="error"
                        action={
                            <Button variant="secondary" size="sm" onClick={() => void loadInitialData()}>
                                Riprova
                            </Button>
                        }
                    >
                        Non riusciamo a caricare le regole.
                    </InlineBanner>
                ) : isLoading ? (
                    <Card>
                        <RuleTable {...tableProps} rules={[]} isLoading />
                    </Card>
                ) : filteredRules.length === 0 ? (
                    (searchTerm || filterActivityId) ? (
                        <EmptyState
                            variant="filtered"
                            title="Nessuna regola trovata"
                            description={
                                filterActivityId && !searchTerm
                                    ? "Nessuna regola per questa sede."
                                    : "Nessuna regola corrisponde alla ricerca."
                            }
                            onClearFilters={searchTerm ? () => setSearchTerm("") : undefined}
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
                                                {typeOptions
                                                    .filter(option => option.value !== "all")
                                                    .map(option => (
                                                        <Menu.Item
                                                            key={option.value}
                                                            onSelect={() => void handleCreateRule(option.value as RuleType)}
                                                        >
                                                            {option.label}
                                                        </Menu.Item>
                                                    ))}
                                            </Menu>
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
                        {statusGroups
                            .filter(group => group.rules.length > 0)
                            .map(group => (
                                <Card
                                    key={group.key}
                                    title={group.title}
                                    badge={<Badge variant="neutral">{group.rules.length}</Badge>}
                                    subtitle={group.subtitle}
                                    actions={
                                        group.setOpen ? (
                                            <IconButton
                                                icon={<ChevronDown size={16} className={group.open ? styles.chevronOpen : styles.chevronClosed} />}
                                                variant="ghost"
                                                size="sm"
                                                aria-expanded={group.open}
                                                aria-label={`${group.open ? "Nascondi" : "Mostra"} ${group.title}`}
                                                onClick={() => group.setOpen?.(!group.open)}
                                            />
                                        ) : undefined
                                    }
                                >
                                    {group.open && <RuleTable {...tableProps} rules={group.rules} />}
                                </Card>
                            ))}
                    </div>
                )
            ) : (
                <CalendarView
                    rules={rules}
                    ruleTypeFilter={ruleTypeFilter}
                    onRuleClick={rule => navigate(ruleHref(rule))}
                />
            )}

            <BulkBar
                selectedCount={selectedRuleIds.size}
                onDelete={canWrite ? () => setIsBulkDeleteOpen(true) : undefined}
                onClearSelection={() => setSelectedRuleIds(new Set())}
            />

            <RuleSimulatorDrawer
                open={isSimulatorDrawerOpen}
                onClose={() => setIsSimulatorDrawerOpen(false)}
                tenantId={currentTenantId!}
                rules={rules}
                activities={activities}
                catalogById={catalogById}
                subscriptionInactive={subscriptionInactive}
                ruleHref={ruleHref}
            />
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
