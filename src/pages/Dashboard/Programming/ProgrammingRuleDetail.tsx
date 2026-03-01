import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Button } from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
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
    type RuleTargetType
} from "@/services/supabase/v2/layoutScheduling";
import { buildRuleSummary } from "@/utils/ruleHelpers";
import styles from "./ProgrammingRuleDetail.module.scss";

// Componentes
import { TargetSection } from "./components/TargetSection";
import { AssociatedContentSection } from "./components/AssociatedContentSection";
import { SchedulingSection } from "./components/SchedulingSection";
import { PrioritySection } from "./components/PrioritySection";

type TargetMode = "all_activities" | "activity_group" | "specific_activity";

type RuleDetailForm = {
    name: string;
    ruleType: RuleType;
    targetMode: TargetMode;
    activityId: string;
    activityGroupId: string;
    catalogId: string;
    styleId: string;
    featuredContents: Array<{
        featuredContentId: string;
        slot: "hero" | "before_catalog" | "after_catalog";
        sortOrder: number;
    }>;
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
    alwaysActive: boolean;
    timeMode: LayoutTimeMode;
    dateFrom: string;
    dateTo: string;
    daysOfWeek: string[];
    timeFrom: string;
    timeTo: string;
};

function getRuleTypeLabel(ruleType: RuleType): string {
    if (ruleType === "layout") return "Layout";
    if (ruleType === "price") return "Prezzi";
    return "Visibilità";
}

function getRuleTargetLabel(
    rule: Pick<LayoutRule, "target_type" | "target_id" | "target_group">,
    activityById: Map<string, LayoutRuleOption>
): string {
    if (rule.target_type === "activity_group") {
        if (rule.target_group?.is_system) return "Tutte le attività";
        return rule.target_group?.name ?? rule.target_id;
    }
    return activityById.get(rule.target_id)?.name ?? rule.target_id;
}

function buildFallbackRuleName(
    rule: Pick<LayoutRule, "rule_type" | "target_type" | "target_id" | "target_group">,
    activityById: Map<string, LayoutRuleOption>
): string {
    const typeLabel = getRuleTypeLabel(rule.rule_type);
    const targetLabel = getRuleTargetLabel(rule, activityById);
    return `${typeLabel} · ${targetLabel}`;
}

function buildForm(rule: LayoutRule, activityById: Map<string, LayoutRuleOption>): RuleDetailForm {
    const isSystemGroup =
        rule.target_type === "activity_group" && rule.target_group?.is_system === true;
    const targetMode: TargetMode =
        rule.target_type === "activity"
            ? "specific_activity"
            : isSystemGroup
              ? "all_activities"
              : "activity_group";

    const productOverrides: RuleDetailForm["productOverrides"] = {};
    const selectedProductIds: string[] = [];

    if (rule.rule_type === "price") {
        for (const product of rule.price_overrides) {
            selectedProductIds.push(product.product_id);
            productOverrides[product.product_id] = {
                overridePrice: String(product.override_price ?? ""),
                showOriginalPrice: product.show_original_price,
                visible: false
            };
        }
    }

    if (rule.rule_type === "visibility") {
        for (const product of rule.visibility_overrides) {
            selectedProductIds.push(product.product_id);
            productOverrides[product.product_id] = {
                overridePrice: "",
                showOriginalPrice: false,
                visible: product.visible
            };
        }
    }

    return {
        name: (rule.name ?? buildFallbackRuleName(rule, activityById)).trim(),
        ruleType: rule.rule_type,
        targetMode,
        activityId: rule.target_type === "activity" ? rule.target_id : "",
        activityGroupId: rule.target_type === "activity_group" ? rule.target_id : "",
        catalogId: rule.layout?.catalog_id ?? "",
        styleId: rule.layout?.style_id ?? "",
        featuredContents: rule.featured_contents.map(fc => ({
            featuredContentId: fc.featured_content_id,
            slot: fc.slot,
            sortOrder: fc.sort_order
        })),
        selectedProductIds,
        productOverrides,
        priority: String(rule.priority),
        enabled: rule.enabled,
        alwaysActive: rule.time_mode === "always",
        timeMode: rule.time_mode,
        dateFrom: "",
        dateTo: "",
        daysOfWeek: (rule.days_of_week ?? []).map(day => String(day)),
        timeFrom: rule.time_from?.slice(0, 5) ?? "",
        timeTo: rule.time_to?.slice(0, 5) ?? ""
    };
}

function toSummary(input: {
    form: RuleDetailForm;
    activityById: Map<string, LayoutRuleOption>;
    groupById: Map<string, LayoutRuleOption>;
    catalogById: Map<string, LayoutRuleOption>;
    styleById: Map<string, LayoutRuleOption>;
    productById: Map<string, LayoutRuleOption>;
}): string {
    const { form, activityById, groupById, catalogById, styleById, productById } = input;

    const targetLabel =
        form.targetMode === "all_activities"
            ? "tutte le attività"
            : form.targetMode === "activity_group"
              ? (groupById.get(form.activityGroupId)?.name ?? "gruppo non selezionato")
              : (activityById.get(form.activityId)?.name ?? "attività non selezionata");

    const scheduleLabel = buildRuleSummary({
        time_mode: form.timeMode,
        days_of_week: form.daysOfWeek.map(Number),
        time_from: form.timeFrom,
        time_to: form.timeTo,
        enabled: form.enabled
    });

    if (form.ruleType === "layout") {
        const catalogLabel = form.catalogId
            ? (catalogById.get(form.catalogId)?.name ?? form.catalogId)
            : "nessun catalogo";
        const styleLabel = form.styleId
            ? (styleById.get(form.styleId)?.name ?? form.styleId)
            : "nessuno stile";
        return `Regola: tipo layout su ${targetLabel}, catalogo ${catalogLabel}, stile ${styleLabel}, priorità ${form.priority}, ${scheduleLabel}.`;
    }

    if (form.ruleType === "price") {
        const productsLabel =
            form.selectedProductIds.length > 0
                ? form.selectedProductIds.map(id => productById.get(id)?.name ?? id).join(", ")
                : "nessun prodotto";
        return `Regola: override prezzi su ${targetLabel} per ${productsLabel}, priorità ${form.priority}, ${scheduleLabel}.`;
    }

    const productsLabel =
        form.selectedProductIds.length > 0
            ? form.selectedProductIds
                  .map(id => {
                      const label = productById.get(id)?.name ?? id;
                      const state = form.productOverrides[id]?.visible ? "visibile" : "nascosto";
                      return `${label} (${state})`;
                  })
                  .join(", ")
            : "nessun prodotto";

    return `Regola: visibilità su ${targetLabel} per ${productsLabel}, priorità ${form.priority}, ${scheduleLabel}.`;
}

export default function ProgrammingRuleDetail() {
    const { ruleId } = useParams<{ ruleId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [rule, setRule] = useState<LayoutRule | null>(null);
    const [activities, setActivities] = useState<LayoutRuleOption[]>([]);
    const [activityGroups, setActivityGroups] = useState<LayoutRuleOption[]>([]);
    const [catalogs, setCatalogs] = useState<LayoutRuleOption[]>([]);
    const [stylesOptions, setStylesOptions] = useState<LayoutRuleOption[]>([]);
    const [productsOptions, setProductsOptions] = useState<LayoutRuleOption[]>([]);
    const [featuredContentsOptions, setFeaturedContentsOptions] = useState<LayoutRuleOption[]>([]);

    const [form, setForm] = useState<RuleDetailForm | null>(null);
    const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

    const activityById = useMemo(
        () => new Map(activities.map((item: LayoutRuleOption) => [item.id, item])),
        [activities]
    );
    const groupById = useMemo(
        () => new Map(activityGroups.map((item: LayoutRuleOption) => [item.id, item])),
        [activityGroups]
    );
    const catalogById = useMemo(
        () => new Map(catalogs.map((item: LayoutRuleOption) => [item.id, item])),
        [catalogs]
    );
    const styleById = useMemo(
        () => new Map(stylesOptions.map((item: LayoutRuleOption) => [item.id, item])),
        [stylesOptions]
    );
    const productById = useMemo(
        () => new Map(productsOptions.map((item: LayoutRuleOption) => [item.id, item])),
        [productsOptions]
    );

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

    const tenantFeaturedContents = useMemo(
        () =>
            tenantId
                ? featuredContentsOptions.filter(item => item.tenant_id === tenantId)
                : featuredContentsOptions,
        [featuredContentsOptions, tenantId]
    );

    const snapshot = useMemo(() => (form ? JSON.stringify(form) : null), [form]);
    const isDirty = Boolean(form && initialSnapshot && snapshot !== initialSnapshot);

    const summary = useMemo(() => {
        if (!form) return "";
        return toSummary({
            form,
            activityById,
            groupById,
            catalogById,
            styleById,
            productById
        });
    }, [activityById, catalogById, form, groupById, productById, styleById]);

    const loadData = useCallback(async () => {
        if (!ruleId) {
            navigate("/dashboard/programmazione");
            return;
        }

        try {
            setIsLoading(true);
            const [ruleData, optionsData] = await Promise.all([
                getLayoutRuleById(ruleId),
                listLayoutRuleOptions()
            ]);

            if (!ruleData) {
                showToast({ type: "error", message: "Regola non trovata.", duration: 3000 });
                navigate("/dashboard/programmazione");
                return;
            }

            setRule(ruleData);
            setActivities(optionsData.activities);
            setActivityGroups(optionsData.activityGroups);
            setCatalogs(optionsData.catalogs);
            setStylesOptions(optionsData.styles);
            setProductsOptions(optionsData.products);
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

        const priority = Number(form.priority);
        if (Number.isNaN(priority)) {
            showToast({ type: "error", message: "La priorità non è valida.", duration: 2600 });
            return;
        }

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

        let targetType: RuleTargetType = "activity";
        let targetId = form.activityId;

        if (form.targetMode === "all_activities") {
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
        }

        if (form.targetMode === "activity_group") {
            if (!form.activityGroupId) {
                showToast({
                    type: "error",
                    message: "Seleziona un gruppo attività.",
                    duration: 2600
                });
                return;
            }
            targetType = "activity_group";
            targetId = form.activityGroupId;
        }

        if (form.targetMode === "specific_activity" && !form.activityId) {
            showToast({ type: "error", message: "Seleziona un'attività.", duration: 2600 });
            return;
        }

        if (form.ruleType === "price") {
            const invalidOverride = form.selectedProductIds.some(productId => {
                const price = Number(form.productOverrides[productId]?.overridePrice ?? "");
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
                targetType,
                targetId,
                priority,
                enabled: form.enabled,
                timeMode: form.timeMode,
                daysOfWeek:
                    form.timeMode === "window" && hasDays ? form.daysOfWeek.map(Number) : null,
                timeFrom: form.timeMode === "window" && hasBothTimes ? form.timeFrom : null,
                timeTo: form.timeMode === "window" && hasBothTimes ? form.timeTo : null,
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
                        ? form.selectedProductIds.map(productId => ({
                              productId,
                              overridePrice: Number(
                                  form.productOverrides[productId]?.overridePrice ?? "0"
                              ),
                              showOriginalPrice:
                                  form.productOverrides[productId]?.showOriginalPrice ?? false
                          }))
                        : undefined,
                visibilityProducts:
                    form.ruleType === "visibility"
                        ? form.selectedProductIds.map(productId => ({
                              productId,
                              visible: form.productOverrides[productId]?.visible ?? false
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

    const breadcrumbItems = [
        { label: "Programmazione", to: "/dashboard/programmazione" },
        { label: form.name || "Regola" }
    ];

    return (
        <section className={styles.page}>
            <div className={styles.topArea}>
                <Breadcrumb items={breadcrumbItems} />
                <PageHeader
                    title={form.name || "Regola"}
                    subtitle={`${getRuleTypeLabel(form.ruleType)} · Workspace regola`}
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
                <TargetSection
                    name={form.name}
                    ruleType={form.ruleType}
                    targetMode={form.targetMode}
                    activityId={form.activityId}
                    activityGroupId={form.activityGroupId}
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
                    tenantCatalogs={tenantCatalogs}
                    tenantStyles={tenantStyles}
                    tenantFeaturedContents={tenantFeaturedContents}
                    tenantProducts={tenantProducts}
                    onFormChange={handleFormChange}
                />

                <SchedulingSection
                    alwaysActive={form.alwaysActive}
                    timeMode={form.timeMode}
                    dateFrom={form.dateFrom}
                    dateTo={form.dateTo}
                    daysOfWeek={form.daysOfWeek}
                    timeFrom={form.timeFrom}
                    timeTo={form.timeTo}
                    summary={summary}
                    onFormChange={handleFormChange}
                />

                <PrioritySection
                    priority={form.priority}
                    enabled={form.enabled}
                    onFormChange={handleFormChange}
                />
            </form>
        </section>
    );
}
