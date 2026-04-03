import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Button } from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Badge } from "@/components/ui/Badge/Badge";
import { useToast } from "@/context/Toast/ToastContext";
import {
    getLayoutRuleById,
    getSystemActivityGroupId,
    listLayoutRuleOptions,
    updateRule,
    type LayoutRule,
    type LayoutRuleOption,
    type LayoutTimeMode,
    type RuleType,
    type VisibilityMode,
    type ProductGroupAssignmentOption
} from "@/services/supabase/layoutScheduling";
import { parseDecimalPrice } from "@/utils/priceParser";
import { computePriority } from "@utils/priorityUtils";
import type { PriorityLevel } from "@utils/priorityUtils";
import styles from "./ProgrammingRuleDetail.module.scss";

// Componentes
import { TargetSection, type TargetMode } from "./components/TargetSection";
import { AssociatedContentSection, type FeaturedContentItem } from "./components/AssociatedContentSection";
import { SchedulingSection } from "./components/SchedulingSection";
import { PrioritySection } from "./components/PrioritySection";

type RuleDetailForm = {
    name: string;
    ruleType: RuleType;
    targetMode: TargetMode;
    activityIds: string[];
    groupIds: string[];
    catalogId: string;
    styleId: string;
    featuredContents: FeaturedContentItem[];
    selectedProductIds: string[];
    productOverrides: Record<
        string,
        {
            overridePrice: string;
            showOriginalPrice: boolean;
            valueOverrides?: Record<string, { overridePrice: string; showOriginalPrice: boolean }>;
        }
    >;
    visibilityProductModes: Record<string, VisibilityMode>;
    priorityLevel: PriorityLevel;
    displayOrder: number;
    enabled: boolean;
    alwaysActive: boolean;
    timeMode: LayoutTimeMode;
    startAt: string;
    endAt: string;
    daysOfWeek: string[];
    timeFrom: string;
    timeTo: string;
};

function getRuleTypeLabel(ruleType: RuleType): string {
    if (ruleType === "layout") return "Layout";
    if (ruleType === "price") return "Prezzi";
    return "Visibilità";
}

function getRuleTypeBadgeColor(ruleType: RuleType): string {
    if (ruleType === "layout") return "var(--brand-primary)";
    if (ruleType === "price") return "var(--color-warning-500, #f59e0b)";
    return "#16a34a";
}

function buildForm(rule: LayoutRule, activityById: Map<string, LayoutRuleOption>): RuleDetailForm {
    const productOverrides: RuleDetailForm["productOverrides"] = {};
    const visibilityProductModes: RuleDetailForm["visibilityProductModes"] = {};
    const selectedProductIds: string[] = [];

    if (rule.rule_type === "price") {
        for (const override of rule.price_overrides) {
            if (!selectedProductIds.includes(override.product_id)) {
                selectedProductIds.push(override.product_id);
            }
            if (override.option_value_id) {
                const existing = productOverrides[override.product_id] ?? {
                    overridePrice: "",
                    showOriginalPrice: false
                };
                const valueOverrides = { ...existing.valueOverrides };
                valueOverrides[override.option_value_id] = {
                    overridePrice: String(override.override_price),
                    showOriginalPrice: override.show_original_price
                };
                productOverrides[override.product_id] = { ...existing, valueOverrides };
            } else {
                productOverrides[override.product_id] = {
                    overridePrice: String(override.override_price ?? ""),
                    showOriginalPrice: override.show_original_price,
                    valueOverrides: productOverrides[override.product_id]?.valueOverrides
                };
            }
        }
    }

    if (rule.rule_type === "visibility") {
        for (const product of rule.visibility_overrides) {
            selectedProductIds.push(product.product_id);
            visibilityProductModes[product.product_id] = product.mode;
        }
    }

    const targetMode: TargetMode = rule.applyToAll
        ? "all"
        : rule.groupIds.length > 0
        ? "groups"
        : rule.activityIds.length > 0
        ? "activities"
        : rule.target_type === "activity_group"
        ? "groups"
        : "activities";

    const fallbackName = (() => {
        const typeLabel = getRuleTypeLabel(rule.rule_type);
        const targetLabel =
            targetMode === "all"
                ? "tutte le sedi"
                : targetMode === "activities" && rule.activityIds.length > 0
                ? activityById.get(rule.activityIds[0])?.name ?? rule.activityIds[0]
                : targetMode === "groups" && rule.groupIds.length > 0
                ? rule.target_group?.name ?? rule.groupIds[0]
                : "nessun target";
        return `${typeLabel} · ${targetLabel}`;
    })();

    return {
        name: (rule.name ?? fallbackName).trim(),
        ruleType: rule.rule_type,
        targetMode,
        activityIds: rule.activityIds ?? [],
        groupIds: rule.groupIds ?? [],
        catalogId: rule.layout?.catalog_id ?? "",
        styleId: rule.layout?.style_id ?? "",
        featuredContents: rule.featured_contents.map(fc => ({
            featuredContentId: fc.featured_content_id,
            slot: fc.slot,
            sortOrder: fc.sort_order
        })),
        selectedProductIds,
        productOverrides,
        visibilityProductModes,
        priorityLevel: rule.priority_level,
        displayOrder: rule.display_order,
        enabled: rule.enabled,
        alwaysActive: rule.time_mode === "always",
        timeMode: rule.time_mode,
        startAt: rule.start_at ? new Date(rule.start_at).toISOString().split("T")[0] : "",
        endAt: rule.end_at ? new Date(rule.end_at).toISOString().split("T")[0] : "",
        daysOfWeek: (rule.days_of_week ?? []).map(day => String(day)),
        timeFrom: rule.time_from?.slice(0, 5) ?? "",
        timeTo: rule.time_to?.slice(0, 5) ?? ""
    };
}


export default function ProgrammingRuleDetail() {
    const { ruleId, businessId } = useParams<{ ruleId: string; businessId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const fromType = searchParams.get("fromType");
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [rule, setRule] = useState<LayoutRule | null>(null);
    const [activities, setActivities] = useState<LayoutRuleOption[]>([]);
    const [activityGroups, setActivityGroups] = useState<LayoutRuleOption[]>([]);
    const [catalogs, setCatalogs] = useState<LayoutRuleOption[]>([]);
    const [stylesOptions, setStylesOptions] = useState<LayoutRuleOption[]>([]);
    const [productsOptions, setProductsOptions] = useState<LayoutRuleOption[]>([]);
    const [productGroupsOptions, setProductGroupsOptions] = useState<LayoutRuleOption[]>([]);
    const [productGroupItemsOptions, setProductGroupItemsOptions] = useState<
        ProductGroupAssignmentOption[]
    >([]);
    const [featuredContentsOptions, setFeaturedContentsOptions] = useState<LayoutRuleOption[]>([]);

    const [form, setForm] = useState<RuleDetailForm | null>(null);
    const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

    const tenantId = rule?.tenant_id ?? null;

    const tenantActivities = useMemo(
        () => (tenantId ? activities.filter(item => item.tenant_id === tenantId) : activities),
        [activities, tenantId]
    );

    const tenantGroups = useMemo(
        () =>
            (tenantId
                ? activityGroups.filter(item => item.tenant_id === tenantId)
                : activityGroups
            ).filter(group => !group.is_system),
        [activityGroups, tenantId]
    );

    const tenantCatalogs = useMemo(
        () => (tenantId ? catalogs.filter(item => item.tenant_id === tenantId) : catalogs),
        [catalogs, tenantId]
    );

    const tenantStyles = useMemo(
        () =>
            tenantId ? stylesOptions.filter(item => item.tenant_id === tenantId) : stylesOptions,
        [stylesOptions, tenantId]
    );

    const tenantProducts = useMemo(
        () =>
            tenantId
                ? productsOptions.filter(item => item.tenant_id === tenantId)
                : productsOptions,
        [productsOptions, tenantId]
    );

    const tenantProductGroups = useMemo(
        () =>
            tenantId
                ? productGroupsOptions.filter(item => item.tenant_id === tenantId)
                : productGroupsOptions,
        [productGroupsOptions, tenantId]
    );

    const tenantProductGroupItems = useMemo(
        () =>
            tenantId
                ? productGroupItemsOptions.filter(item => item.tenant_id === tenantId)
                : productGroupItemsOptions,
        [productGroupItemsOptions, tenantId]
    );

    const tenantFeaturedContents = useMemo(
        () =>
            tenantId
                ? featuredContentsOptions.filter(item => item.tenant_id === tenantId)
                : featuredContentsOptions,
        [featuredContentsOptions, tenantId]
    );

    const snapshot = useMemo(() => (form ? JSON.stringify(form) : null), [form]);
    const isDirty = Boolean(form && initialSnapshot && snapshot !== initialSnapshot);

    const loadData = useCallback(async () => {
        if (!ruleId) {
            navigate(`/business/${businessId}/scheduling${fromType ? `?type=${fromType}` : ""}`);
            return;
        }

        try {
            setIsLoading(true);
            const [ruleData, optionsData] = await Promise.all([
                getLayoutRuleById(ruleId, businessId!),
                listLayoutRuleOptions(businessId!)
            ]);

            if (!ruleData) {
                showToast({ type: "error", message: "Regola non trovata.", duration: 3000 });
                navigate(`/business/${businessId}/scheduling${fromType ? `?type=${fromType}` : ""}`);
                return;
            }

            setRule(ruleData);
            setActivities(optionsData.activities);
            setActivityGroups(optionsData.activityGroups);
            setCatalogs(optionsData.catalogs);
            setStylesOptions(optionsData.styles);
            setProductsOptions(optionsData.products);
            setProductGroupsOptions(optionsData.productGroups);
            setProductGroupItemsOptions(optionsData.productGroupItems);
            setFeaturedContentsOptions(optionsData.featuredContents);

            const nextForm = buildForm(
                ruleData,
                new Map(optionsData.activities.map(activity => [activity.id, activity]))
            );
            const nextSnapshot = JSON.stringify(nextForm);
            setForm(nextForm);
            setInitialSnapshot(nextSnapshot);
        } catch (error) {
            console.error("Errore caricamento dettaglio regola:", error);
            showToast({
                type: "error",
                message: "Impossibile caricare la regola.",
                duration: 3000
            });
        } finally {
            setIsLoading(false);
        }
    }, [navigate, ruleId, showToast]);

    const handleFormChange = useCallback((updates: Partial<RuleDetailForm>) => {
        setForm(prev => (prev ? { ...prev, ...updates } : prev));
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleReset = () => {
        if (!initialSnapshot) return;
        setForm(JSON.parse(initialSnapshot) as RuleDetailForm);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!form || !rule || !ruleId) return;

        const trimmedName = form.name.trim();
        if (!trimmedName) {
            showToast({ type: "error", message: "Il nome regola è obbligatorio.", duration: 2600 });
            return;
        }

        const priority = computePriority(form.priorityLevel, form.displayOrder);

        const hasDays = form.daysOfWeek.length > 0;
        const hasBothTimes = Boolean(form.timeFrom && form.timeTo);
        const hasSingleTime = Boolean(form.timeFrom) !== Boolean(form.timeTo);

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

        if (form.targetMode === "activities" && form.activityIds.length === 0) {
            showToast({
                type: "error",
                message: "Seleziona almeno una sede o cambia modalità target.",
                duration: 2600
            });
            return;
        }

        // Build legacy target_type / target_id for backward compat with Edge Functions
        // and derive multi-target applyToAll from explicit targetMode state.
        const applyToAll = form.targetMode === "all";
        let targetType: "activity" | "activity_group";
        let targetId: string;

        if (form.targetMode === "all") {
            const systemGroupId = await getSystemActivityGroupId(rule.tenant_id);
            if (!systemGroupId) {
                showToast({
                    type: "error",
                    message: "Gruppo di sistema 'Tutte le sedi' mancante.",
                    duration: 3000
                });
                return;
            }
            targetType = "activity_group";
            targetId = systemGroupId;
        } else if (form.targetMode === "activities") {
            targetType = "activity";
            targetId = form.activityIds[0];
        } else if (form.groupIds.length > 0) {
            targetType = "activity_group";
            targetId = form.groupIds[0];
        } else if (rule.target_type === "activity_group") {
            targetType = "activity_group";
            targetId = rule.target_id;
        } else if (tenantGroups[0]?.id) {
            targetType = "activity_group";
            targetId = tenantGroups[0].id;
        } else {
            const systemGroupId = await getSystemActivityGroupId(rule.tenant_id);
            if (!systemGroupId) {
                showToast({
                    type: "error",
                    message: "Nessun gruppo disponibile per il target.",
                    duration: 3000
                });
                return;
            }
            targetType = "activity_group";
            targetId = systemGroupId;
        }

        const today = new Date().toISOString().split("T")[0];

        if (form.startAt && form.startAt < today) {
            showToast({
                type: "error",
                message: "La data di inizio non può essere nel passato.",
                duration: 2800
            });
            return;
        }

        if (form.endAt) {
            if (form.endAt < today) {
                showToast({
                    type: "error",
                    message: "La data di fine non può essere nel passato.",
                    duration: 2800
                });
                return;
            }
            if (form.startAt && form.endAt < form.startAt) {
                showToast({
                    type: "error",
                    message: "La data di fine non può essere precedente alla data di inizio.",
                    duration: 2800
                });
                return;
            }
        }

        if (form.timeFrom && form.timeTo && form.timeTo <= form.timeFrom) {
            showToast({
                type: "error",
                message: "L'orario di fine deve essere successivo all'orario di inizio.",
                duration: 2800
            });
            return;
        }

        if (form.ruleType === "price") {
            const invalidOverride = form.selectedProductIds.some(productId => {
                const product = productsOptions.find(p => p.id === productId);
                const hasFormats = (product?.format_values?.length ?? 0) > 0;
                if (hasFormats) {
                    const valueOverrides = form.productOverrides[productId]?.valueOverrides ?? {};
                    return (product!.format_values ?? []).some(fv => {
                        const price = parseDecimalPrice(valueOverrides[fv.id]?.overridePrice ?? "");
                        return Number.isNaN(price) || price <= 0;
                    });
                }
                const price = parseDecimalPrice(
                    form.productOverrides[productId]?.overridePrice ?? ""
                );
                return Number.isNaN(price) || price <= 0;
            });

            if (invalidOverride) {
                showToast({
                    type: "error",
                    message:
                        "Imposta un override prezzo maggiore di 0 per ogni prodotto selezionato.",
                    duration: 3200
                });
                return;
            }
        }

        setIsSaving(true);
        try {
            await updateRule({
                scheduleId: ruleId,
                tenantId: rule.tenant_id,
                ruleType: form.ruleType,
                name: trimmedName,
                applyToAll,
                activityIds: form.activityIds,
                groupIds: form.groupIds,
                targetType,
                targetId,
                priorityLevel: form.priorityLevel,
                displayOrder: form.displayOrder,
                enabled: form.enabled,
                timeMode: form.timeMode,
                daysOfWeek:
                    form.timeMode === "window" && hasDays ? form.daysOfWeek.map(Number) : null,
                timeFrom: form.timeMode === "window" && hasBothTimes ? form.timeFrom : null,
                timeTo: form.timeMode === "window" && hasBothTimes ? form.timeTo : null,
                startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
                endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
                layout:
                    form.ruleType === "layout"
                        ? {
                              catalogId: form.catalogId || null,
                              styleId: form.styleId || null,
                              featuredContents: form.featuredContents
                          }
                        : undefined,
                priceProducts:
                    form.ruleType === "price"
                        ? form.selectedProductIds.flatMap(productId => {
                              const product = productsOptions.find(p => p.id === productId);
                              const hasFormats = (product?.format_values?.length ?? 0) > 0;
                              if (hasFormats) {
                                  const valueOverrides =
                                      form.productOverrides[productId]?.valueOverrides ?? {};
                                  return (product!.format_values ?? []).map(fv => ({
                                      productId,
                                      optionValueId: fv.id as string | null,
                                      overridePrice: parseDecimalPrice(
                                          valueOverrides[fv.id]?.overridePrice ?? "0"
                                      ),
                                      showOriginalPrice:
                                          valueOverrides[fv.id]?.showOriginalPrice ?? false
                                  }));
                              }
                              return [
                                  {
                                      productId,
                                      optionValueId: null,
                                      overridePrice: parseDecimalPrice(
                                          form.productOverrides[productId]?.overridePrice ?? "0"
                                      ),
                                      showOriginalPrice:
                                          form.productOverrides[productId]?.showOriginalPrice ??
                                          false
                                  }
                              ];
                          })
                        : undefined,
                visibilityProductOverrides:
                    form.ruleType === "visibility"
                        ? form.selectedProductIds.map(productId => ({
                              productId,
                              mode: form.visibilityProductModes[productId] ?? "hide"
                          }))
                        : undefined
            });

            showToast({ type: "success", message: "Regola salvata.", duration: 2200 });
            await loadData();
        } catch (error) {
            console.error("Errore salvataggio regola:", error);
            showToast({ type: "error", message: "Errore durante il salvataggio.", duration: 3000 });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading || !form || !rule) {
        return (
            <section className={styles.page}>
                <PageHeader title="Caricamento regola..." />
            </section>
        );
    }

    const backToList = `/business/${businessId}/scheduling?type=${fromType ?? form.ruleType}`;
    const breadcrumbItems = [
        { label: "Programmazione", to: backToList },
        { label: form.name || "Regola" }
    ];

    return (
        <section className={styles.page}>
            <div className={styles.topArea}>
                <Breadcrumb items={breadcrumbItems} />
                <PageHeader
                    title={form.name || "Regola"}
                    titleAddon={
                        <Badge color={getRuleTypeBadgeColor(form.ruleType)}>
                            {getRuleTypeLabel(form.ruleType)}
                        </Badge>
                    }
                    actions={
                        <div className={styles.topActions}>
                            <Button
                                variant="secondary"
                                onClick={handleReset}
                                disabled={!isDirty || isSaving}
                            >
                                Annulla modifiche
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                form="rule-detail-form"
                                loading={isSaving}
                                disabled={!isDirty}
                            >
                                Salva regola
                            </Button>
                        </div>
                    }
                />
            </div>

            <form id="rule-detail-form" className={styles.layout} onSubmit={handleSubmit}>
                <div className={styles.formColumnLeft}>
                    <TargetSection
                        name={form.name}
                        targetMode={form.targetMode}
                        activityIds={form.activityIds}
                        groupIds={form.groupIds}
                        tenantActivities={tenantActivities}
                        tenantGroups={tenantGroups}
                        onFormChange={handleFormChange}
                    />

                    <AssociatedContentSection
                        ruleType={form.ruleType}
                        catalogId={form.catalogId}
                        styleId={form.styleId}
                        featuredContents={form.featuredContents}
                        selectedProductIds={form.selectedProductIds}
                        productOverrides={form.productOverrides}
                        visibilityProductModes={form.visibilityProductModes}
                        tenantCatalogs={tenantCatalogs}
                        tenantStyles={tenantStyles}
                        tenantFeaturedContents={tenantFeaturedContents}
                        tenantProducts={tenantProducts}
                        tenantProductGroups={tenantProductGroups}
                        tenantProductGroupItems={tenantProductGroupItems}
                        onFormChange={handleFormChange}
                    />
                </div>

                <div className={styles.formColumnRight}>
                    <SchedulingSection
                        alwaysActive={form.alwaysActive}
                        startAt={form.startAt}
                        endAt={form.endAt}
                        daysOfWeek={form.daysOfWeek}
                        timeFrom={form.timeFrom}
                        timeTo={form.timeTo}
                        onFormChange={handleFormChange}
                    />

                    <PrioritySection
                        priorityLevel={form.priorityLevel}
                        enabled={form.enabled}
                        onFormChange={handleFormChange}
                    />
                </div>
            </form>
        </section>
    );
}
