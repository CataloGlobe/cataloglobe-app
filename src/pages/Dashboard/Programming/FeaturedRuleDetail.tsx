import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Button } from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Badge } from "@/components/ui/Badge/Badge";
import { useToast } from "@/context/Toast/ToastContext";
import {
    getLayoutRuleById,
    listLayoutRuleOptions,
    type LayoutRule,
    type LayoutRuleOption,
    type LayoutTimeMode
} from "@/services/supabase/layoutScheduling";
import {
    updateFeaturedRule,
    type FeaturedRuleContent
} from "@/services/supabase/featuredScheduling";
import styles from "./ProgrammingRuleDetail.module.scss";

import { TargetSection, type TargetMode } from "./components/TargetSection";
import { FeaturedContentSection } from "./components/FeaturedContentSection";
import { type FeaturedContentItem } from "./components/AssociatedContentSection";
import { SchedulingSection } from "./components/SchedulingSection";

type FeaturedRuleDetailForm = {
    name: string;
    targetMode: TargetMode;
    activityIds: string[];
    groupIds: string[];
    featuredContents: FeaturedContentItem[];
    enabled: boolean;
    alwaysActive: boolean;
    timeMode: LayoutTimeMode;
    startAt: string;
    endAt: string;
    daysOfWeek: string[];
    timeFrom: string;
    timeTo: string;
};

function buildForm(rule: LayoutRule, activityById: Map<string, LayoutRuleOption>): FeaturedRuleDetailForm {
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
        if (targetMode === "all") return "In evidenza · tutte le sedi";
        if (targetMode === "activities" && rule.activityIds.length > 0) {
            return `In evidenza · ${activityById.get(rule.activityIds[0])?.name ?? rule.activityIds[0]}`;
        }
        return "In evidenza";
    })();

    return {
        name: (rule.name ?? fallbackName).trim(),
        targetMode,
        activityIds: rule.activityIds ?? [],
        groupIds: rule.groupIds ?? [],
        featuredContents: rule.featured_contents.map(fc => ({
            featuredContentId: fc.featured_content_id,
            slot: fc.slot,
            sortOrder: fc.sort_order
        })),
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

export default function FeaturedRuleDetail() {
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
    const [featuredContentsOptions, setFeaturedContentsOptions] = useState<LayoutRuleOption[]>([]);

    const [form, setForm] = useState<FeaturedRuleDetailForm | null>(null);
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
            setFeaturedContentsOptions(optionsData.featuredContents);

            const nextForm = buildForm(
                ruleData,
                new Map(optionsData.activities.map(a => [a.id, a]))
            );
            const nextSnapshot = JSON.stringify(nextForm);
            setForm(nextForm);
            setInitialSnapshot(nextSnapshot);
        } catch (error) {
            console.error("Errore caricamento regola in evidenza:", error);
            showToast({ type: "error", message: "Impossibile caricare la regola.", duration: 3000 });
        } finally {
            setIsLoading(false);
        }
    }, [navigate, ruleId, businessId, fromType, showToast]);

    const handleFormChange = useCallback((updates: Partial<FeaturedRuleDetailForm>) => {
        setForm(prev => (prev ? { ...prev, ...updates } : prev));
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleReset = () => {
        if (!initialSnapshot) return;
        setForm(JSON.parse(initialSnapshot) as FeaturedRuleDetailForm);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!form || !rule || !ruleId) return;

        const trimmedName = form.name.trim();
        if (!trimmedName) {
            showToast({ type: "error", message: "Il nome regola è obbligatorio.", duration: 2600 });
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

        if (form.targetMode === "activities" && form.activityIds.length === 0) {
            showToast({
                type: "error",
                message: "Seleziona almeno una sede o cambia modalità target.",
                duration: 2600
            });
            return;
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

        const featuredRuleContents: FeaturedRuleContent[] = form.featuredContents.map(fc => ({
            featured_content_id: fc.featuredContentId,
            slot: fc.slot,
            sort_order: fc.sortOrder
        }));

        setIsSaving(true);
        try {
            await updateFeaturedRule({
                id: ruleId,
                tenantId: rule.tenant_id,
                name: trimmedName,
                enabled: form.enabled,
                startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
                endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
                timeFrom: form.timeMode === "window" && hasBothTimes ? form.timeFrom : null,
                timeTo: form.timeMode === "window" && hasBothTimes ? form.timeTo : null,
                daysOfWeek: form.timeMode === "window" && hasDays ? form.daysOfWeek.map(Number) : [],
                alwaysActive: form.alwaysActive,
                targetMode: form.targetMode,
                activityIds: form.activityIds,
                groupIds: form.groupIds,
                featuredContents: featuredRuleContents
            });

            showToast({ type: "success", message: "Regola salvata.", duration: 2200 });
            await loadData();
        } catch (error) {
            console.error("Errore salvataggio regola in evidenza:", error);
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

    const backToList = `/business/${businessId}/scheduling?type=${fromType ?? "featured"}`;
    const breadcrumbItems = [
        { label: "Programmazione", to: backToList },
        { label: form.name || "Regola in evidenza" }
    ];

    return (
        <section className={styles.page}>
            <div className={styles.topArea}>
                <Breadcrumb items={breadcrumbItems} />
                <PageHeader
                    title={form.name || "Regola in evidenza"}
                    titleAddon={
                        <Badge color="var(--brand-primary)">
                            In evidenza
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
                                form="featured-rule-detail-form"
                                loading={isSaving}
                                disabled={!isDirty}
                            >
                                Salva regola
                            </Button>
                        </div>
                    }
                />
            </div>

            <form id="featured-rule-detail-form" className={styles.formLayout} onSubmit={handleSubmit}>
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

                    <FeaturedContentSection
                        featuredContents={form.featuredContents}
                        tenantFeaturedContents={tenantFeaturedContents}
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
                </div>
            </form>
        </section>
    );
}
