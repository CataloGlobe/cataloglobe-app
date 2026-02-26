import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Button } from "@/components/ui";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { Switch } from "@/components/ui/Switch/Switch";
import { PillGroupMultiple } from "@/components/ui/PillGroup/PillGroupMultiple";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Badge } from "@/components/ui/Badge/Badge";
import { Link } from "react-router-dom";
import { IconAlertTriangle, IconExternalLink } from "@tabler/icons-react";
import { useToast } from "@/context/Toast/ToastContext";
import { useAuth } from "@context/useAuth";
import {
    createPriceRule,
    createVisibilityRule,
    createLayoutRule,
    deleteLayoutRule,
    getSystemActivityGroupId,
    listLayoutRuleOptions,
    listLayoutRules,
    type LayoutRule,
    type LayoutRuleOption,
    type LayoutTimeMode,
    type RuleType
} from "@/services/supabase/v2/layoutScheduling";
import styles from "./Programming.module.scss";

type LayoutRuleTargetMode = "all_activities" | "specific_activity";
type RuleTypeFilter = "all" | RuleType;

type CreateRuleForm = {
    ruleType: RuleType;
    targetMode: LayoutRuleTargetMode;
    activityId: string;
    catalogId: string;
    styleId: string;
    selectedProductIds: string[];
    productOverrides: Record<
        string,
        {
            overridePrice: string;
            showOriginalPrice: boolean;
            visible: boolean;
        }
    >;
    priority: string;
    enabled: boolean;
    timeMode: LayoutTimeMode;
    daysOfWeek: string[];
    timeFrom: string;
    timeTo: string;
    featuredContents: Array<{
        featuredContentId: string;
        slot: "hero" | "before_catalog" | "after_catalog";
        sortOrder: number;
    }>;
};

const DAY_OPTIONS = [
    { value: "1", label: "Mon" },
    { value: "2", label: "Tue" },
    { value: "3", label: "Wed" },
    { value: "4", label: "Thu" },
    { value: "5", label: "Fri" },
    { value: "6", label: "Sat" },
    { value: "0", label: "Sun" }
] as const;

const RULE_TYPE_FILTER_OPTIONS: Array<{ value: RuleTypeFilter; label: string }> = [
    { value: "all", label: "Tutte" },
    { value: "layout", label: "Layout" },
    { value: "price", label: "Prezzi" },
    { value: "visibility", label: "Visibilità" }
];

const CREATE_RULE_TYPE_OPTIONS: Array<{ value: RuleType; label: string; disabled: boolean }> = [
    { value: "layout", label: "Layout", disabled: false },
    { value: "price", label: "Prezzi", disabled: false },
    { value: "visibility", label: "Visibilità", disabled: false }
];

function buildDefaultForm(
    options: {
        activities: LayoutRuleOption[];
        catalogs: LayoutRuleOption[];
        styles: LayoutRuleOption[];
    },
    tenantId: string | null
): CreateRuleForm {
    const fallbackTenantId =
        tenantId ?? options.activities[0]?.tenant_id ?? options.catalogs[0]?.tenant_id ?? null;

    const firstActivity =
        options.activities.find(activity => activity.tenant_id === fallbackTenantId) ?? null;

    const tenantCatalogs = options.catalogs.filter(c => c.tenant_id === fallbackTenantId);
    const tenantStyles = options.styles.filter(s => s.tenant_id === fallbackTenantId);
    return {
        ruleType: "layout",
        targetMode: "specific_activity",
        activityId: firstActivity?.id ?? "",
        catalogId: tenantCatalogs[0]?.id ?? "",
        styleId: tenantStyles[0]?.id ?? "",
        selectedProductIds: [],
        productOverrides: {},
        priority: "10",
        enabled: true,
        timeMode: "always",
        daysOfWeek: [],
        timeFrom: "",
        timeTo: "",
        featuredContents: []
    };
}

function getRuleTargetLabel(rule: LayoutRule, activityById: Map<string, LayoutRuleOption>): string {
    if (rule.target_type === "activity_group") {
        if (rule.target_group?.is_system) return "Tutte le attività";
        return rule.target_group?.name ?? rule.target_id;
    }

    return activityById.get(rule.target_id)?.name ?? rule.target_id;
}

function getRuleTypeLabel(ruleType: RuleType): string {
    if (ruleType === "layout") return "Layout";
    if (ruleType === "price") return "Prezzi";
    return "Visibilità";
}

function toMinutes(hhmm: string | null): number | null {
    if (!hhmm) return null;
    const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
}

function isTimeRuleActiveNow(
    rule: Pick<LayoutRule, "time_mode" | "days_of_week" | "time_from" | "time_to">,
    now: Date
): boolean {
    if (rule.time_mode === "always") return true;

    const day = now.getDay();
    const nowMinutes = toMinutes(now.toTimeString().slice(0, 5));
    if (nowMinutes === null) return false;

    if (rule.days_of_week !== null && !rule.days_of_week.includes(day)) {
        return false;
    }

    if (!rule.time_from || !rule.time_to) {
        return true;
    }

    const from = toMinutes(rule.time_from);
    const to = toMinutes(rule.time_to);
    if (from === null || to === null) return false;

    return from <= nowMinutes && nowMinutes < to;
}

export default function Programming() {
    const { user } = useAuth();
    const { showToast } = useToast();

    const [rules, setRules] = useState<LayoutRule[]>([]);
    const [activities, setActivities] = useState<LayoutRuleOption[]>([]);
    const [catalogs, setCatalogs] = useState<LayoutRuleOption[]>([]);
    const [stylesOptions, setStylesOptions] = useState<LayoutRuleOption[]>([]);
    const [productsOptions, setProductsOptions] = useState<LayoutRuleOption[]>([]);
    const [featuredContentsOptions, setFeaturedContentsOptions] = useState<LayoutRuleOption[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);

    const [searchTerm, setSearchTerm] = useState("");
    const [ruleTypeFilter, setRuleTypeFilter] = useState<RuleTypeFilter>("all");
    const [densityView, setDensityView] = useState<"list" | "grid">("grid");

    const [form, setForm] = useState<CreateRuleForm>({
        ruleType: "layout",
        targetMode: "specific_activity",
        activityId: "",
        catalogId: "",
        styleId: "",
        selectedProductIds: [],
        productOverrides: {},
        priority: "10",
        enabled: true,
        timeMode: "always",
        daysOfWeek: [],
        timeFrom: "",
        timeTo: "",
        featuredContents: []
    });

    const activityById = useMemo(() => new Map(activities.map(a => [a.id, a])), [activities]);
    const catalogById = useMemo(() => new Map(catalogs.map(c => [c.id, c])), [catalogs]);
    const styleById = useMemo(() => new Map(stylesOptions.map(s => [s.id, s])), [stylesOptions]);
    const productById = useMemo(
        () => new Map(productsOptions.map(product => [product.id, product])),
        [productsOptions]
    );
    const currentTenantId = user?.id ?? null;

    const selectedActivity = useMemo(
        () => activities.find(activity => activity.id === form.activityId) ?? null,
        [activities, form.activityId]
    );

    const tenantActivity = useMemo(() => {
        if (selectedActivity) return selectedActivity;
        if (currentTenantId) {
            return activities.find(activity => activity.tenant_id === currentTenantId) ?? null;
        }
        return activities[0] ?? null;
    }, [activities, currentTenantId, selectedActivity]);

    const tenantCatalogOptions = useMemo(() => {
        const tenantId = currentTenantId ?? tenantActivity?.tenant_id ?? null;
        if (!tenantId) return [];
        return catalogs.filter(catalog => catalog.tenant_id === tenantId);
    }, [catalogs, currentTenantId, tenantActivity]);

    const tenantStyleOptions = useMemo(() => {
        const tenantId = currentTenantId ?? tenantActivity?.tenant_id ?? null;
        if (!tenantId) return [];
        return stylesOptions.filter(style => style.tenant_id === tenantId);
    }, [currentTenantId, stylesOptions, tenantActivity]);

    const selectedStyle = useMemo(() => {
        if (!form.styleId) return null;
        return tenantStyleOptions.find(s => s.id === form.styleId) || null;
    }, [form.styleId, tenantStyleOptions]);

    const tenantProductOptions = useMemo(() => {
        const tenantId = currentTenantId ?? tenantActivity?.tenant_id ?? null;
        if (!tenantId) return [];
        return productsOptions.filter(product => product.tenant_id === tenantId);
    }, [currentTenantId, productsOptions, tenantActivity]);

    const tenantFeaturedContentsOptions = useMemo(() => {
        const tenantId = currentTenantId ?? tenantActivity?.tenant_id ?? null;
        if (!tenantId) return [];
        return featuredContentsOptions.filter(fc => fc.tenant_id === tenantId);
    }, [currentTenantId, featuredContentsOptions, tenantActivity]);

    const loadRules = useCallback(async () => {
        const data = await listLayoutRules();
        setRules(data);
    }, []);

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [rulesData, optionsData] = await Promise.all([
                listLayoutRules(),
                listLayoutRuleOptions()
            ]);
            setRules(rulesData);
            setActivities(optionsData.activities);
            setCatalogs(optionsData.catalogs);
            setStylesOptions(optionsData.styles);
            setProductsOptions(optionsData.products);
            setFeaturedContentsOptions(optionsData.featuredContents);
            setForm(buildDefaultForm(optionsData, currentTenantId));
        } catch (error) {
            console.error("Errore caricamento Programmazione:", error);
            showToast({
                type: "error",
                message: "Impossibile caricare la programmazione layout.",
                duration: 3000
            });
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, showToast]);

    useEffect(() => {
        void loadInitialData();
    }, [loadInitialData]);

    useEffect(() => {
        if (!currentTenantId) return;

        if (!tenantCatalogOptions.some(catalog => catalog.id === form.catalogId)) {
            setForm(prev => ({ ...prev, catalogId: tenantCatalogOptions[0]?.id ?? "" }));
        }

        if (!tenantStyleOptions.some(style => style.id === form.styleId)) {
            setForm(prev => ({ ...prev, styleId: tenantStyleOptions[0]?.id ?? "" }));
        }
    }, [currentTenantId, form.catalogId, form.styleId, tenantCatalogOptions, tenantStyleOptions]);

    useEffect(() => {
        const tenantProductIds = new Set(tenantProductOptions.map(product => product.id));

        setForm(prev => {
            const filteredProductIds = prev.selectedProductIds.filter(productId =>
                tenantProductIds.has(productId)
            );
            if (filteredProductIds.length === prev.selectedProductIds.length) {
                return prev;
            }

            const nextOverrides: CreateRuleForm["productOverrides"] = {};
            for (const productId of filteredProductIds) {
                nextOverrides[productId] = prev.productOverrides[productId] ?? {
                    overridePrice: "",
                    showOriginalPrice: false,
                    visible: false
                };
            }

            return {
                ...prev,
                selectedProductIds: filteredProductIds,
                productOverrides: nextOverrides
            };
        });
    }, [tenantProductOptions]);

    const activitiesMissingLayoutRule = useMemo(() => {
        if (!activities.length || isLoading) return [];

        return activities.filter(activity => {
            const hasValidRule = rules.some(rule => {
                if (rule.rule_type !== "layout") return false;
                if (!rule.enabled) return false;

                const isActivityTarget =
                    rule.target_type === "activity" && rule.target_id === activity.id;
                const isSystemTarget =
                    rule.target_type === "activity_group" && rule.target_group?.is_system === true;

                if (!isActivityTarget && !isSystemTarget) return false;

                if (rule.time_mode === "window") {
                    const hasDays = rule.days_of_week && rule.days_of_week.length > 0;
                    const hasTimes = rule.time_from && rule.time_to;
                    if (!hasDays && !hasTimes) return false;
                }

                return true;
            });

            return !hasValidRule;
        });
    }, [activities, rules, isLoading]);

    const activeRuleIds = useMemo(() => {
        const now = new Date();
        const winningRuleIds = new Set<string>();

        const activeRules = rules.filter(r => r.enabled && isTimeRuleActiveNow(r, now));

        const groups = new Map<string, LayoutRule[]>();
        for (const rule of activeRules) {
            const key = `${rule.target_type}-${rule.target_id}-${rule.rule_type}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(rule);
        }

        for (const groupRules of groups.values()) {
            groupRules.sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
            if (groupRules[0]) {
                winningRuleIds.add(groupRules[0].id);
            }
        }

        return winningRuleIds;
    }, [rules]);

    const filteredRules = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        const typeFilteredRules =
            ruleTypeFilter === "all"
                ? rules
                : rules.filter(rule => rule.rule_type === ruleTypeFilter);
        if (!query) return typeFilteredRules;

        return typeFilteredRules.filter(rule => {
            const targetLabel = getRuleTargetLabel(rule, activityById);
            const catalogLabel = rule.layout?.catalog_id
                ? catalogById.get(rule.layout.catalog_id)?.name ?? rule.layout.catalog_id
                : "";
            const styleLabel = rule.layout?.style_id
                ? styleById.get(rule.layout.style_id)?.name ?? rule.layout.style_id
                : "";
            const ruleTypeLabel = getRuleTypeLabel(rule.rule_type);
            const priceProductsLabel =
                rule.rule_type === "price"
                    ? rule.price_overrides
                          .map(override => override.product_name ?? override.product_id)
                          .join(" ")
                    : "";
            const visibilityProductsLabel =
                rule.rule_type === "visibility"
                    ? rule.visibility_overrides
                          .map(
                              override =>
                                  `${override.product_name ?? override.product_id} ${
                                      override.visible ? "visibile" : "nascosto"
                                  }`
                          )
                          .join(" ")
                    : "";

            return [
                rule.id,
                ruleTypeLabel,
                rule.rule_type,
                rule.target_type,
                rule.target_id,
                targetLabel,
                catalogLabel,
                styleLabel,
                priceProductsLabel,
                visibilityProductsLabel,
                rule.time_mode
            ]
                .join(" ")
                .toLowerCase()
                .includes(query);
        });
    }, [activityById, catalogById, ruleTypeFilter, rules, searchTerm, styleById]);

    const duplicateRuleWarning = useMemo(() => {
        const selectedFormActivity = activities.find(item => item.id === form.activityId) ?? null;
        const isAllActivitiesTarget = form.targetMode === "all_activities";

        if (!isAllActivitiesTarget && !selectedFormActivity) return null;

        const priority = Number(form.priority);
        if (Number.isNaN(priority)) return null;

        const hasDays = form.daysOfWeek.length > 0;
        const hasBothTimes = Boolean(form.timeFrom && form.timeTo);

        if (form.timeMode === "window") {
            const hasSingleTime = Boolean(form.timeFrom) !== Boolean(form.timeTo);
            if (hasSingleTime || (!hasDays && !hasBothTimes)) return null;
        }

        const overlappingRule = rules.find(r => {
            if (r.rule_type !== form.ruleType) return false;
            if (r.priority !== priority) return false;

            if (isAllActivitiesTarget) {
                if (r.target_type !== "activity_group" || r.target_group?.is_system !== true)
                    return false;
            } else {
                if (r.target_type !== "activity" || r.target_id !== form.activityId) return false;
            }

            if (r.time_mode !== form.timeMode) return false;

            if (form.timeMode === "window") {
                const formDaysSet = new Set(form.daysOfWeek.map(Number));
                const ruleDaysSet = new Set(r.days_of_week ?? []);

                if (formDaysSet.size !== ruleDaysSet.size) return false;
                for (const d of formDaysSet) {
                    if (!ruleDaysSet.has(d)) return false;
                }

                const ruleFrom = r.time_from ? r.time_from.slice(0, 5) : "";
                const formFrom = form.timeFrom ? form.timeFrom.slice(0, 5) : "";
                if (ruleFrom !== formFrom) return false;

                const ruleTo = r.time_to ? r.time_to.slice(0, 5) : "";
                const formTo = form.timeTo ? form.timeTo.slice(0, 5) : "";
                if (ruleTo !== formTo) return false;
            }

            return true;
        });

        if (overlappingRule) {
            return "⚠ Esiste già una regola con la stessa priorità e le stesse impostazioni temporali per questo Target.";
        }

        return null;
    }, [
        activities,
        form.activityId,
        form.daysOfWeek,
        form.priority,
        form.ruleType,
        form.targetMode,
        form.timeFrom,
        form.timeMode,
        form.timeTo,
        rules
    ]);

    const columns: ColumnDefinition<LayoutRule>[] = [
        {
            id: "target",
            header: "Activity",
            width: "2.2fr",
            cell: (_value, rule) => {
                const targetLabel = getRuleTargetLabel(rule, activityById);
                const isPriceRule = rule.rule_type === "price";
                const isVisibilityRule = rule.rule_type === "visibility";

                return (
                    <div>
                        <Text variant="body-sm" weight={600}>
                            {targetLabel}
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            {rule.target_id}
                        </Text>
                        {isPriceRule && rule.price_overrides.length > 0 && (
                            <Text variant="caption" colorVariant="muted">
                                Prodotti:{" "}
                                {rule.price_overrides
                                    .map(override => override.product_name ?? override.product_id)
                                    .join(", ")}
                            </Text>
                        )}
                        {isVisibilityRule && rule.visibility_overrides.length > 0 && (
                            <Text variant="caption" colorVariant="muted">
                                Prodotti:{" "}
                                {rule.visibility_overrides
                                    .map(
                                        override =>
                                            `${override.product_name ?? override.product_id} (${
                                                override.visible ? "visibile" : "nascosto"
                                            })`
                                    )
                                    .join(", ")}
                            </Text>
                        )}
                    </div>
                );
            }
        },
        {
            id: "type",
            header: "Tipo",
            width: "1fr",
            cell: (_value, rule) => {
                const ruleTypeLabel = getRuleTypeLabel(rule.rule_type);
                const ruleTypeBadgeClassName =
                    rule.rule_type === "layout"
                        ? styles.ruleTypeLayout
                        : rule.rule_type === "price"
                        ? styles.ruleTypePrice
                        : styles.ruleTypeVisibility;

                return (
                    <div className={styles.typeCell}>
                        <span className={`${styles.ruleTypeBadge} ${ruleTypeBadgeClassName}`}>
                            <Text variant="caption" colorVariant="white" as="span">
                                {ruleTypeLabel}
                            </Text>
                        </span>
                        {activeRuleIds.has(rule.id) && (
                            <span className={styles.activeNowBadge}>
                                <Text variant="caption-xs" colorVariant="white" as="span">
                                    Attiva ora
                                </Text>
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            id: "catalog",
            header: "Catalog",
            width: "1.6fr",
            cell: (_value, rule) => {
                if (rule.rule_type !== "layout") {
                    return (
                        <span className={styles.placeholderBadge}>
                            <Text variant="caption" colorVariant="muted" as="span">
                                N/A
                            </Text>
                        </span>
                    );
                }

                const catalogName = rule.layout?.catalog_id
                    ? catalogById.get(rule.layout.catalog_id)?.name ?? rule.layout.catalog_id
                    : null;

                return <Text variant="body-sm">{catalogName ?? "-"}</Text>;
            }
        },
        {
            id: "style",
            header: "Style",
            width: "1.6fr",
            cell: (_value, rule) => {
                if (rule.rule_type !== "layout") {
                    return (
                        <span className={styles.placeholderBadge}>
                            <Text variant="caption" colorVariant="muted" as="span">
                                N/A
                            </Text>
                        </span>
                    );
                }

                const styleName = rule.layout?.style_id
                    ? styleById.get(rule.layout.style_id)?.name ?? rule.layout.style_id
                    : null;

                return <Text variant="body-sm">{styleName ?? "-"}</Text>;
            }
        },
        {
            id: "priority",
            header: "Priority",
            width: "0.8fr",
            accessor: rule => rule.priority,
            cell: value => <Text variant="body-sm">{value as number}</Text>
        },
        {
            id: "timeMode",
            header: "Time Mode",
            width: "1fr",
            accessor: rule => rule.time_mode,
            cell: value => <Text variant="body-sm">{value as string}</Text>
        },
        {
            id: "status",
            header: "Stato",
            width: "0.8fr",
            cell: (_value, rule) => (
                <span className={rule.enabled ? styles.statusOn : styles.statusOff}>
                    <Text variant="caption" colorVariant="white" as="span">
                        {rule.enabled ? "Enabled" : "Disabled"}
                    </Text>
                </span>
            )
        },
        {
            id: "actions",
            header: "Azioni",
            width: "0.8fr",
            align: "right",
            cell: (_value, rule) => (
                <div>
                    <Button variant="secondary" onClick={() => void handleDeleteRule(rule.id)}>
                        Elimina
                    </Button>
                </div>
            )
        }
    ];

    const handleOpenCreate = () => {
        setForm(
            buildDefaultForm(
                {
                    activities,
                    catalogs,
                    styles: stylesOptions
                },
                currentTenantId
            )
        );
        setIsCreateDrawerOpen(true);
    };

    async function handleDeleteRule(scheduleId: string) {
        const ruleToDelete = rules.find(r => r.id === scheduleId);
        if (!ruleToDelete) return;

        let isLastActiveLayoutRule = false;

        if (ruleToDelete.rule_type === "layout" && ruleToDelete.enabled) {
            const isValidWindow = (r: typeof ruleToDelete) => {
                if (r.time_mode !== "window") return true;
                const hasDays = r.days_of_week && r.days_of_week.length > 0;
                const hasTimes = r.time_from && r.time_to;
                return Boolean(hasDays || hasTimes);
            };

            if (isValidWindow(ruleToDelete)) {
                const otherActiveLayoutRules = rules.filter(
                    r =>
                        r.id !== scheduleId &&
                        r.rule_type === "layout" &&
                        r.enabled &&
                        r.target_type === ruleToDelete.target_type &&
                        r.target_id === ruleToDelete.target_id &&
                        isValidWindow(r)
                );

                if (otherActiveLayoutRules.length === 0) {
                    isLastActiveLayoutRule = true;
                }
            }
        }

        const confirmMessage = isLastActiveLayoutRule
            ? "⚠ Questa è l'ultima layout rule attiva per questo target. Il menu pubblico non sarà visibile. Vuoi continuare?"
            : "Eliminare questa regola? L’operazione è irreversibile.";

        if (!window.confirm(confirmMessage)) {
            return;
        }

        try {
            await deleteLayoutRule(scheduleId);
            showToast({
                type: "success",
                message: "Regola eliminata con successo.",
                duration: 2400
            });
            await loadRules();
        } catch (error) {
            console.error("Errore eliminazione regola:", error);
            showToast({
                type: "error",
                message: "Errore durante l'eliminazione della regola.",
                duration: 3000
            });
        }
    }

    const handleCreateRule = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const isLayoutType = form.ruleType === "layout";
        const isPriceType = form.ruleType === "price";
        const isVisibilityType = form.ruleType === "visibility";
        const selectedFormActivity = activities.find(item => item.id === form.activityId) ?? null;
        const isAllActivitiesTarget = form.targetMode === "all_activities";
        const priority = Number(form.priority);
        const hasDays = form.daysOfWeek.length > 0;
        const hasBothTimes = Boolean(form.timeFrom && form.timeTo);
        const hasSingleTime = Boolean(form.timeFrom) !== Boolean(form.timeTo);

        if (
            !currentTenantId ||
            (!isAllActivitiesTarget && !selectedFormActivity) ||
            (isLayoutType && (!form.catalogId || !form.styleId || !selectedStyle)) ||
            Number.isNaN(priority)
        ) {
            showToast({
                type: "error",
                message: "Compila tutti i campi richiesti prima di salvare.",
                duration: 2800
            });
            return;
        }

        if (isPriceType && form.selectedProductIds.length === 0) {
            showToast({
                type: "error",
                message: "Seleziona almeno un prodotto per la regola prezzi.",
                duration: 3000
            });
            return;
        }

        if (isVisibilityType && form.selectedProductIds.length === 0) {
            showToast({
                type: "error",
                message: "Seleziona almeno un prodotto per la regola visibilità.",
                duration: 3000
            });
            return;
        }

        const parsedPriceOverrides = isPriceType
            ? form.selectedProductIds.map(productId => ({
                  productId,
                  overridePrice: Number(form.productOverrides[productId]?.overridePrice ?? ""),
                  showOriginalPrice: form.productOverrides[productId]?.showOriginalPrice ?? false
              }))
            : [];
        const parsedVisibilityOverrides = isVisibilityType
            ? form.selectedProductIds.map(productId => ({
                  productId,
                  visible: form.productOverrides[productId]?.visible ?? false
              }))
            : [];

        if (
            isPriceType &&
            parsedPriceOverrides.some(
                override => Number.isNaN(override.overridePrice) || override.overridePrice <= 0
            )
        ) {
            showToast({
                type: "error",
                message: "Per ogni prodotto imposta un override_price maggiore di 0.",
                duration: 3200
            });
            return;
        }

        if (form.timeMode === "window") {
            if (hasSingleTime) {
                showToast({
                    type: "error",
                    message: "Per la finestra oraria servono sia Ora inizio che Ora fine.",
                    duration: 3000
                });
                return;
            }

            if (!hasDays && !hasBothTimes) {
                showToast({
                    type: "error",
                    message: "In modalità window imposta almeno giorni o fascia oraria.",
                    duration: 3000
                });
                return;
            }
        }

        setIsSaving(true);
        try {
            if (!isLayoutType && !isPriceType && !isVisibilityType) {
                showToast({
                    type: "error",
                    message: "Tipo regola non ancora supportato.",
                    duration: 3000
                });
                return;
            }

            let targetType: "activity" | "activity_group" = "activity";
            let targetId = selectedFormActivity?.id ?? "";

            if (isAllActivitiesTarget) {
                const systemGroupId = await getSystemActivityGroupId(currentTenantId);
                if (!systemGroupId) {
                    showToast({
                        type: "error",
                        message: "Gruppo di sistema 'Tutte le sedi' mancante",
                        duration: 3000
                    });
                    return;
                }

                targetType = "activity_group";
                targetId = systemGroupId;
            }

            if (isLayoutType) {
                await createLayoutRule({
                    tenantId: currentTenantId,
                    targetType,
                    targetId,
                    catalogId: form.catalogId,
                    styleId: form.styleId,
                    priority,
                    enabled: form.enabled,
                    timeMode: form.timeMode,
                    daysOfWeek:
                        form.timeMode === "window" && hasDays
                            ? form.daysOfWeek.map(day => Number(day))
                            : null,
                    timeFrom: form.timeMode === "window" && hasBothTimes ? form.timeFrom : null,
                    timeTo: form.timeMode === "window" && hasBothTimes ? form.timeTo : null,
                    featuredContents: form.featuredContents
                });
            } else if (isPriceType) {
                await createPriceRule({
                    tenantId: currentTenantId,
                    targetType,
                    targetId,
                    priority,
                    enabled: form.enabled,
                    timeMode: form.timeMode,
                    daysOfWeek:
                        form.timeMode === "window" && hasDays
                            ? form.daysOfWeek.map(day => Number(day))
                            : null,
                    timeFrom: form.timeMode === "window" && hasBothTimes ? form.timeFrom : null,
                    timeTo: form.timeMode === "window" && hasBothTimes ? form.timeTo : null,
                    products: parsedPriceOverrides
                });
            } else {
                await createVisibilityRule({
                    tenantId: currentTenantId,
                    targetType,
                    targetId,
                    priority,
                    enabled: form.enabled,
                    timeMode: form.timeMode,
                    daysOfWeek:
                        form.timeMode === "window" && hasDays
                            ? form.daysOfWeek.map(day => Number(day))
                            : null,
                    timeFrom: form.timeMode === "window" && hasBothTimes ? form.timeFrom : null,
                    timeTo: form.timeMode === "window" && hasBothTimes ? form.timeTo : null,
                    products: parsedVisibilityOverrides
                });
            }

            showToast({
                type: "success",
                message: isLayoutType
                    ? "Layout rule creata con successo."
                    : isPriceType
                    ? "Price rule creata con successo."
                    : "Visibility rule creata con successo.",
                duration: 2400
            });

            setIsCreateDrawerOpen(false);
            await loadRules();
        } catch (error) {
            console.error("Errore creazione layout rule:", error);
            showToast({
                type: "error",
                message: "Errore durante la creazione della layout rule.",
                duration: 3000
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className={styles.programming}>
            <div className={styles.topArea}>
                <PageHeader
                    title="Programmazione"
                    subtitle="Gestisci le regole layout per attività, cataloghi e stili."
                    actions={
                        <Button
                            variant="primary"
                            onClick={handleOpenCreate}
                            disabled={!currentTenantId}
                        >
                            Nuova layout rule
                        </Button>
                    }
                />
            </div>

            {activitiesMissingLayoutRule.length > 0 && (
                <div className={styles.warningsContainer}>
                    {activitiesMissingLayoutRule.map(activity => (
                        <div key={activity.id} className={styles.warningBanner}>
                            <Text variant="body-sm" colorVariant="white" weight={600}>
                                ⚠ Nessuna layout rule attiva per questa activity ({activity.name}).
                                Il menu pubblico non sarà visibile.
                            </Text>
                        </div>
                    ))}
                </div>
            )}

            <FilterBar
                search={{
                    value: searchTerm,
                    onChange: setSearchTerm,
                    placeholder: "Cerca per tipo, target, catalogo, stile o id..."
                }}
                view={{
                    value: densityView,
                    onChange: setDensityView
                }}
                activeFilters={
                    <div className={styles.ruleTypeFilters}>
                        {RULE_TYPE_FILTER_OPTIONS.map(option => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setRuleTypeFilter(option.value)}
                                className={`${styles.ruleTypeFilterButton} ${
                                    ruleTypeFilter === option.value
                                        ? styles.ruleTypeFilterButtonActive
                                        : ""
                                }`}
                            >
                                <Text
                                    as="span"
                                    variant="caption"
                                    weight={600}
                                    colorVariant={
                                        ruleTypeFilter === option.value ? "white" : "default"
                                    }
                                >
                                    {option.label}
                                </Text>
                            </button>
                        ))}
                    </div>
                }
            />

            <div className={styles.tableCard}>
                <DataTable<LayoutRule>
                    data={filteredRules}
                    columns={columns}
                    isLoading={isLoading}
                    density={densityView === "list" ? "compact" : "extended"}
                    loadingState={
                        <div className={styles.emptyState}>
                            <Text colorVariant="muted">Caricamento regole...</Text>
                        </div>
                    }
                    emptyState={
                        <div className={styles.emptyState}>
                            <Text variant="title-sm">Nessuna regola</Text>
                            <Text colorVariant="muted">
                                Crea la prima regola layout o modifica i filtri di ricerca.
                            </Text>
                        </div>
                    }
                />
            </div>

            <SystemDrawer
                open={isCreateDrawerOpen}
                onClose={() => setIsCreateDrawerOpen(false)}
                width={520}
                aria-labelledby="create-layout-rule-title"
            >
                <DrawerLayout
                    header={
                        <div className={styles.drawerHeader}>
                            <Text as="h3" variant="title-sm" id="create-layout-rule-title">
                                Nuova regola
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Crea una regola del Rule Engine su target activity con priorità
                                ordinabile.
                            </Text>
                        </div>
                    }
                    footer={
                        <div className={styles.drawerFooterContainer}>
                            {duplicateRuleWarning && (
                                <div className={styles.duplicateWarningBox}>
                                    <Text variant="caption" weight={600} colorVariant="white">
                                        {duplicateRuleWarning}
                                    </Text>
                                </div>
                            )}
                            <div className={styles.drawerFooter}>
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsCreateDrawerOpen(false)}
                                    disabled={isSaving}
                                >
                                    Annulla
                                </Button>
                                <Button
                                    variant="primary"
                                    type="submit"
                                    form="layout-rule-form"
                                    loading={isSaving}
                                >
                                    Crea rule
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <form id="layout-rule-form" className={styles.form} onSubmit={handleCreateRule}>
                        <div className={styles.drawerSection}>
                            <Text variant="caption" colorVariant="muted">
                                Tipo regola
                            </Text>
                            <div
                                className={styles.ruleTypeSegmented}
                                role="radiogroup"
                                aria-label="Tipo regola"
                            >
                                {CREATE_RULE_TYPE_OPTIONS.map(option => {
                                    const isSelected = form.ruleType === option.value;

                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={isSelected}
                                            disabled={option.disabled}
                                            onClick={() =>
                                                setForm(prev => ({
                                                    ...prev,
                                                    ruleType: option.value
                                                }))
                                            }
                                            className={`${styles.ruleTypeSegmentButton} ${
                                                isSelected ? styles.ruleTypeSegmentButtonActive : ""
                                            } ${
                                                option.disabled
                                                    ? styles.ruleTypeSegmentButtonDisabled
                                                    : ""
                                            }`}
                                        >
                                            <Text
                                                as="span"
                                                variant="caption"
                                                weight={600}
                                                colorVariant={
                                                    isSelected && !option.disabled
                                                        ? "white"
                                                        : "default"
                                                }
                                            >
                                                {option.label}
                                            </Text>
                                            {option.disabled && (
                                                <span className={styles.comingSoonBadge}>
                                                    <Text
                                                        as="span"
                                                        variant="caption-xs"
                                                        colorVariant="muted"
                                                    >
                                                        Prossimamente
                                                    </Text>
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <Select
                            label="Target"
                            required
                            value={form.targetMode}
                            onChange={event =>
                                setForm(prev => ({
                                    ...prev,
                                    targetMode: event.target.value as LayoutRuleTargetMode
                                }))
                            }
                            options={[
                                { value: "all_activities", label: "Tutte le attività" },
                                { value: "specific_activity", label: "Attività specifiche" }
                            ]}
                        />

                        {form.targetMode === "all_activities" && (
                            <div className={styles.targetInfo}>
                                <Text variant="caption" colorVariant="muted">
                                    Si applica a tutte le attività (gruppo di sistema).
                                </Text>
                            </div>
                        )}

                        {form.targetMode === "specific_activity" && (
                            <Select
                                label="Activity"
                                required
                                value={form.activityId}
                                onChange={event =>
                                    setForm(prev => ({
                                        ...prev,
                                        activityId: event.target.value
                                    }))
                                }
                                options={[
                                    { value: "", label: "Seleziona attività" },
                                    ...activities.map(activity => ({
                                        value: activity.id,
                                        label: activity.name
                                    }))
                                ]}
                            />
                        )}

                        <div className={styles.drawerSection}>
                            <Text variant="caption" colorVariant="muted">
                                Contenuti associati
                            </Text>

                            {form.ruleType === "layout" ? (
                                <>
                                    <Select
                                        label="Catalog"
                                        required
                                        value={form.catalogId}
                                        onChange={event =>
                                            setForm(prev => ({
                                                ...prev,
                                                catalogId: event.target.value
                                            }))
                                        }
                                        options={[
                                            { value: "", label: "Seleziona catalogo" },
                                            ...tenantCatalogOptions.map(catalog => ({
                                                value: catalog.id,
                                                label: catalog.name
                                            }))
                                        ]}
                                        disabled={!currentTenantId}
                                    />

                                    <Select
                                        label="Style"
                                        required
                                        value={form.styleId}
                                        onChange={event =>
                                            setForm(prev => ({
                                                ...prev,
                                                styleId: event.target.value
                                            }))
                                        }
                                        options={[
                                            { value: "", label: "Seleziona stile" },
                                            ...tenantStyleOptions.map(style => ({
                                                value: style.id,
                                                label: style.name
                                            }))
                                        ]}
                                        disabled={!currentTenantId}
                                    />

                                    {form.styleId && !selectedStyle && (
                                        <div className={styles.styleOrphanWarning}>
                                            <IconAlertTriangle size={24} />
                                            <div>
                                                <Text variant="body-sm" weight={600}>
                                                    Stile non trovato
                                                </Text>
                                                <Text variant="caption">
                                                    Lo stile attualmente associato a questa regola
                                                    non esiste più. Seleziona un nuovo stile per
                                                    poter salvare la regola.
                                                </Text>
                                            </div>
                                        </div>
                                    )}

                                    {selectedStyle && (
                                        <div className={styles.styleDetailsCard}>
                                            <div className={styles.styleDetailsHeader}>
                                                <div className={styles.styleDetailsGroup}>
                                                    <Text variant="body-sm" weight={600}>
                                                        {selectedStyle.name}
                                                    </Text>
                                                    {selectedStyle.is_system && (
                                                        <Badge variant="primary">Sistema</Badge>
                                                    )}
                                                    <Badge variant="secondary">
                                                        v
                                                        {selectedStyle.current_version?.version ||
                                                            "1"}
                                                    </Badge>
                                                </div>
                                                <Link
                                                    to={`/dashboard/stili`}
                                                    target="_blank"
                                                    style={{
                                                        textDecoration: "none",
                                                        display: "flex"
                                                    }}
                                                >
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        rightIcon={<IconExternalLink size={14} />}
                                                        type="button"
                                                    >
                                                        Apri stile
                                                    </Button>
                                                </Link>
                                            </div>
                                            <div className={styles.styleHelperText}>
                                                <Text variant="caption-xs" colorVariant="muted">
                                                    Modifiche allo stile dalla pagina di design
                                                    creano nuove versioni automaticamente, che si
                                                    applicheranno subito in questa regola.
                                                </Text>
                                            </div>
                                        </div>
                                    )}

                                    <div className={styles.productsBlock}>
                                        <div className={styles.selectedProducts}>
                                            <Text variant="caption" colorVariant="muted">
                                                Contenuti in evidenza
                                            </Text>
                                            <PillGroupMultiple
                                                ariaLabel="Seleziona contenuti in evidenza per layout"
                                                options={tenantFeaturedContentsOptions.map(fc => ({
                                                    value: fc.id,
                                                    label: fc.name
                                                }))}
                                                value={form.featuredContents.map(
                                                    fc => fc.featuredContentId
                                                )}
                                                onChange={value =>
                                                    setForm(prev => {
                                                        const newIds = [...value];
                                                        const nextFeaturedContents = newIds.map(
                                                            id => {
                                                                const existing =
                                                                    prev.featuredContents.find(
                                                                        fc =>
                                                                            fc.featuredContentId ===
                                                                            id
                                                                    );
                                                                return (
                                                                    existing ?? {
                                                                        featuredContentId: id,
                                                                        slot: "hero" as const,
                                                                        sortOrder: 0
                                                                    }
                                                                );
                                                            }
                                                        );
                                                        return {
                                                            ...prev,
                                                            featuredContents: nextFeaturedContents
                                                        };
                                                    })
                                                }
                                                layout="auto"
                                            />
                                        </div>

                                        {form.featuredContents.length > 0 && (
                                            <div className={styles.productOverrideList}>
                                                {form.featuredContents.map((fc, index) => {
                                                    const fcOption =
                                                        tenantFeaturedContentsOptions.find(
                                                            o => o.id === fc.featuredContentId
                                                        );
                                                    return (
                                                        <div
                                                            key={fc.featuredContentId}
                                                            className={styles.productOverrideCard}
                                                        >
                                                            <Text variant="body-sm" weight={600}>
                                                                {fcOption?.name ??
                                                                    fc.featuredContentId}
                                                            </Text>

                                                            <Select
                                                                label="Slot"
                                                                value={fc.slot}
                                                                onChange={e => {
                                                                    const newSlot = e.target
                                                                        .value as
                                                                        | "hero"
                                                                        | "before_catalog"
                                                                        | "after_catalog";
                                                                    setForm(prev => {
                                                                        const copy = [
                                                                            ...prev.featuredContents
                                                                        ];
                                                                        copy[index] = {
                                                                            ...copy[index],
                                                                            slot: newSlot
                                                                        };
                                                                        return {
                                                                            ...prev,
                                                                            featuredContents: copy
                                                                        };
                                                                    });
                                                                }}
                                                                options={[
                                                                    {
                                                                        value: "hero",
                                                                        label: "Hero"
                                                                    },
                                                                    {
                                                                        value: "before_catalog",
                                                                        label: "Prima del catalogo"
                                                                    },
                                                                    {
                                                                        value: "after_catalog",
                                                                        label: "Dopo il catalogo"
                                                                    }
                                                                ]}
                                                            />

                                                            <NumberInput
                                                                label="Ordinamento"
                                                                min={0}
                                                                step={1}
                                                                value={fc.sortOrder.toString()}
                                                                onChange={e => {
                                                                    setForm(prev => {
                                                                        const copy = [
                                                                            ...prev.featuredContents
                                                                        ];
                                                                        copy[index] = {
                                                                            ...copy[index],
                                                                            sortOrder: Number(
                                                                                e.target.value
                                                                            )
                                                                        };
                                                                        return {
                                                                            ...prev,
                                                                            featuredContents: copy
                                                                        };
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : form.ruleType === "price" ? (
                                <div className={styles.productsBlock}>
                                    <div className={styles.selectedProducts}>
                                        <Text variant="caption" colorVariant="muted">
                                            Prodotti interessati
                                        </Text>
                                        <PillGroupMultiple
                                            ariaLabel="Seleziona prodotti per override prezzo"
                                            options={tenantProductOptions.map(product => ({
                                                value: product.id,
                                                label: product.name
                                            }))}
                                            value={form.selectedProductIds}
                                            onChange={value =>
                                                setForm(prev => {
                                                    const selectedProductIds = [...value];
                                                    const productOverrides: CreateRuleForm["productOverrides"] =
                                                        {
                                                            ...prev.productOverrides
                                                        };

                                                    for (const productId of selectedProductIds) {
                                                        if (!productOverrides[productId]) {
                                                            productOverrides[productId] = {
                                                                overridePrice: "",
                                                                showOriginalPrice: false,
                                                                visible: false
                                                            };
                                                        }
                                                    }

                                                    for (const productId of Object.keys(
                                                        productOverrides
                                                    )) {
                                                        if (
                                                            !selectedProductIds.includes(productId)
                                                        ) {
                                                            delete productOverrides[productId];
                                                        }
                                                    }

                                                    return {
                                                        ...prev,
                                                        selectedProductIds,
                                                        productOverrides
                                                    };
                                                })
                                            }
                                            layout="auto"
                                        />
                                    </div>

                                    {form.selectedProductIds.length > 0 && (
                                        <div className={styles.productOverrideList}>
                                            {form.selectedProductIds.map(productId => {
                                                const product = productById.get(productId);
                                                const override = form.productOverrides[
                                                    productId
                                                ] ?? {
                                                    overridePrice: "",
                                                    showOriginalPrice: false,
                                                    visible: false
                                                };

                                                return (
                                                    <div
                                                        key={productId}
                                                        className={styles.productOverrideCard}
                                                    >
                                                        <Text variant="body-sm" weight={600}>
                                                            {product?.name ?? productId}
                                                        </Text>

                                                        <NumberInput
                                                            label="Override price"
                                                            min={0}
                                                            step={0.01}
                                                            value={override.overridePrice}
                                                            onChange={event =>
                                                                setForm(prev => ({
                                                                    ...prev,
                                                                    productOverrides: {
                                                                        ...prev.productOverrides,
                                                                        [productId]: {
                                                                            ...override,
                                                                            overridePrice:
                                                                                event.target.value
                                                                        }
                                                                    }
                                                                }))
                                                            }
                                                        />

                                                        <Switch
                                                            label="Mostra prezzo originale"
                                                            checked={override.showOriginalPrice}
                                                            onChange={checked =>
                                                                setForm(prev => ({
                                                                    ...prev,
                                                                    productOverrides: {
                                                                        ...prev.productOverrides,
                                                                        [productId]: {
                                                                            ...override,
                                                                            showOriginalPrice:
                                                                                checked
                                                                        }
                                                                    }
                                                                }))
                                                            }
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ) : form.ruleType === "visibility" ? (
                                <div className={styles.productsBlock}>
                                    <div className={styles.selectedProducts}>
                                        <Text variant="caption" colorVariant="muted">
                                            Prodotti interessati
                                        </Text>
                                        <PillGroupMultiple
                                            ariaLabel="Seleziona prodotti per override visibilità"
                                            options={tenantProductOptions.map(product => ({
                                                value: product.id,
                                                label: product.name
                                            }))}
                                            value={form.selectedProductIds}
                                            onChange={value =>
                                                setForm(prev => {
                                                    const selectedProductIds = [...value];
                                                    const productOverrides: CreateRuleForm["productOverrides"] =
                                                        {
                                                            ...prev.productOverrides
                                                        };

                                                    for (const productId of selectedProductIds) {
                                                        if (!productOverrides[productId]) {
                                                            productOverrides[productId] = {
                                                                overridePrice: "",
                                                                showOriginalPrice: false,
                                                                visible: false
                                                            };
                                                        }
                                                    }

                                                    for (const productId of Object.keys(
                                                        productOverrides
                                                    )) {
                                                        if (
                                                            !selectedProductIds.includes(productId)
                                                        ) {
                                                            delete productOverrides[productId];
                                                        }
                                                    }

                                                    return {
                                                        ...prev,
                                                        selectedProductIds,
                                                        productOverrides
                                                    };
                                                })
                                            }
                                            layout="auto"
                                        />
                                    </div>

                                    {form.selectedProductIds.length > 0 && (
                                        <div className={styles.productOverrideList}>
                                            {form.selectedProductIds.map(productId => {
                                                const product = productById.get(productId);
                                                const override = form.productOverrides[
                                                    productId
                                                ] ?? {
                                                    overridePrice: "",
                                                    showOriginalPrice: false,
                                                    visible: false
                                                };

                                                return (
                                                    <div
                                                        key={productId}
                                                        className={styles.productOverrideCard}
                                                    >
                                                        <Text variant="body-sm" weight={600}>
                                                            {product?.name ?? productId}
                                                        </Text>

                                                        <Switch
                                                            label="Visibile"
                                                            checked={override.visible}
                                                            onChange={checked =>
                                                                setForm(prev => ({
                                                                    ...prev,
                                                                    productOverrides: {
                                                                        ...prev.productOverrides,
                                                                        [productId]: {
                                                                            ...override,
                                                                            visible: checked
                                                                        }
                                                                    }
                                                                }))
                                                            }
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className={styles.comingSoonPanel}>
                                    <Text variant="caption" colorVariant="muted">
                                        Configurazione{" "}
                                        {getRuleTypeLabel(form.ruleType).toLowerCase()} in arrivo.
                                    </Text>
                                </div>
                            )}
                        </div>

                        <NumberInput
                            label="Priority"
                            min={0}
                            step={1}
                            value={form.priority}
                            onChange={event =>
                                setForm(prev => ({
                                    ...prev,
                                    priority: event.target.value
                                }))
                            }
                        />

                        <Select
                            label="Time mode"
                            value={form.timeMode}
                            onChange={event =>
                                setForm(prev => ({
                                    ...prev,
                                    timeMode: event.target.value as LayoutTimeMode
                                }))
                            }
                            options={[
                                { value: "always", label: "always" },
                                { value: "window", label: "window" }
                            ]}
                        />

                        {form.timeMode === "window" && (
                            <>
                                <div className={styles.windowBlock}>
                                    <Text variant="caption" colorVariant="muted">
                                        Days of week
                                    </Text>
                                    <PillGroupMultiple
                                        ariaLabel="Seleziona giorni della settimana"
                                        options={DAY_OPTIONS}
                                        value={form.daysOfWeek}
                                        onChange={value =>
                                            setForm(prev => ({
                                                ...prev,
                                                daysOfWeek: [...value]
                                            }))
                                        }
                                        layout="stretch"
                                    />
                                </div>

                                <div className={styles.timeGrid}>
                                    <TimeInput
                                        label="Time from"
                                        value={form.timeFrom}
                                        onChange={event =>
                                            setForm(prev => ({
                                                ...prev,
                                                timeFrom: event.target.value
                                            }))
                                        }
                                    />

                                    <TimeInput
                                        label="Time to"
                                        value={form.timeTo}
                                        onChange={event =>
                                            setForm(prev => ({
                                                ...prev,
                                                timeTo: event.target.value
                                            }))
                                        }
                                    />
                                </div>
                            </>
                        )}

                        <Switch
                            label="Enabled"
                            checked={form.enabled}
                            onChange={checked =>
                                setForm(prev => ({
                                    ...prev,
                                    enabled: checked
                                }))
                            }
                        />

                        <div className={styles.formHint}>
                            <Text variant="caption" colorVariant="muted">
                                Se time mode = window puoi impostare giorni e fascia oraria.
                            </Text>
                        </div>
                    </form>
                </DrawerLayout>
            </SystemDrawer>
        </section>
    );
}
