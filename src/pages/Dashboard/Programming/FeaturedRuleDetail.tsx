import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import { Button } from "@/components/ui/Button/Button";
import { usePermissions } from "@/context/PermissionsContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Switch } from "@/components/ui/Switch/Switch";
import { Menu } from "@/components/ui/Menu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { useToast } from "@/context/Toast/ToastContext";
import { getToggleGuardResult } from "@utils/ruleToggleGuards";
import {
    deleteLayoutRule,
    duplicateRule,
    getLayoutRuleById,
    listLayoutRuleOptions,
    updateScheduleEnabled,
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

function toLocalDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
        startAt: rule.start_at ? toLocalDateString(new Date(rule.start_at)) : "",
        endAt: rule.end_at ? toLocalDateString(new Date(rule.end_at)) : "",
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

    const { permissions } = usePermissions();
    const { canEdit } = useSubscriptionGuard();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "scheduling.write") : false;

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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

    /* Stesso pattern di ProgrammingRuleDetail: il toggle salva subito e non
       passa dal form, così non interferisce con l'auto-attivazione delle
       bozze al submit. Le guardie valutano `rule` (stato persistito). */
    const handleToggleEnabled = async (nextEnabled: boolean) => {
        if (!rule || !ruleId) return;

        if (nextEnabled) {
            const guard = getToggleGuardResult(rule);
            if (!guard.canToggle) {
                showToast({ type: "error", message: guard.reason, duration: 3000 });
                return;
            }
        }

        setIsTogglingEnabled(true);
        try {
            await updateScheduleEnabled(ruleId, nextEnabled);
            setRule(prev => (prev ? { ...prev, enabled: nextEnabled } : prev));
            setForm(prev => (prev ? { ...prev, enabled: nextEnabled } : prev));
            setInitialSnapshot(prev =>
                prev
                    ? JSON.stringify({
                          ...(JSON.parse(prev) as FeaturedRuleDetailForm),
                          enabled: nextEnabled
                      })
                    : prev
            );
            showToast({
                type: "success",
                message: nextEnabled ? "Regola abilitata." : "Regola disabilitata.",
                duration: 2000
            });
        } catch (error) {
            console.error("Errore update stato regola:", error);
            showToast({
                type: "error",
                message: "Impossibile aggiornare lo stato.",
                duration: 3000
            });
        } finally {
            setIsTogglingEnabled(false);
        }
    };

    const handleDuplicate = async () => {
        if (!rule || !ruleId) return;

        if (isDirty) {
            showToast({
                type: "error",
                message: "Salva o annulla le modifiche prima di duplicare la regola.",
                duration: 3000
            });
            return;
        }

        setIsDuplicating(true);
        try {
            const newRuleId = await duplicateRule(ruleId, rule.tenant_id);
            showToast({
                type: "success",
                message: "Regola duplicata e disabilitata.",
                duration: 2200
            });
            navigate(
                `/business/${businessId}/scheduling/featured/${newRuleId}?fromType=${fromType ?? "featured"}`
            );
        } catch (error) {
            console.error("Errore duplicazione regola:", error);
            showToast({
                type: "error",
                message: "Errore durante la duplicazione della regola.",
                duration: 3000
            });
        } finally {
            setIsDuplicating(false);
        }
    };

    const handleDelete = async (): Promise<boolean> => {
        if (!ruleId) return false;
        try {
            await deleteLayoutRule(ruleId);
            showToast({
                type: "success",
                message: "Regola eliminata con successo.",
                duration: 2200
            });
            navigate(`/business/${businessId}/scheduling?type=${fromType ?? "featured"}`);
            return true;
        } catch (error) {
            console.error("Errore eliminazione regola:", error);
            showToast({
                type: "error",
                message: "Errore durante l'eliminazione della regola.",
                duration: 3000
            });
            return false;
        }
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
            const hasPeriod = !!(form.startAt || form.endAt);
            if (!hasPeriod && !hasDays && !hasBothTimes) {
                showToast({
                    type: "error",
                    message: "In modalità window imposta almeno un periodo, giorni o fascia oraria.",
                    duration: 3000
                });
                return;
            }
        }

        // ── Validazioni BOZZA: campi mancanti → salva come bozza (enabled=false) ──
        const missingFields: string[] = [];

        if (form.targetMode === "activities" && form.activityIds.length === 0) {
            missingFields.push("sedi target");
        }
        if (form.targetMode === "groups" && form.groupIds.length === 0) {
            missingFields.push("gruppi target");
        }
        if (form.featuredContents.length === 0) {
            missingFields.push("contenuti in evidenza");
        }

        // ── Determine effective enabled ──
        const isForcedDraft = missingFields.length > 0;
        const wasOriginallyDraft = (() => {
            if (!rule.applyToAll && rule.activityIds.length === 0 && rule.groupIds.length === 0) return true;
            if (rule.rule_type === "featured") return rule.featured_contents.length === 0;
            return false;
        })();
        const autoActivate = !isForcedDraft && !rule.enabled && wasOriginallyDraft;
        const effectiveEnabled = isForcedDraft ? false : autoActivate ? true : form.enabled;

        const nowLocal = new Date();
        const today = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, "0")}-${String(nowLocal.getDate()).padStart(2, "0")}`;
        const hasPeriod = !!(form.startAt || form.endAt);

        if (form.timeMode === "window" && hasPeriod) {
            if (!form.startAt) {
                showToast({ type: "error", message: "Inserisci la data di inizio.", duration: 2800 });
                return;
            }
            if (!form.endAt) {
                showToast({ type: "error", message: "Inserisci la data di fine.", duration: 2800 });
                return;
            }
        }

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
                enabled: effectiveEnabled,
                startAt: form.startAt ? new Date(form.startAt + "T00:00:00").toISOString() : null,
                endAt: form.endAt ? new Date(form.endAt + "T23:59:59").toISOString() : null,
                timeFrom: form.timeMode === "window" && hasBothTimes ? form.timeFrom : null,
                timeTo: form.timeMode === "window" && hasBothTimes ? form.timeTo : null,
                daysOfWeek: form.timeMode === "window" && hasDays ? form.daysOfWeek.map(Number) : [],
                alwaysActive: form.alwaysActive,
                targetMode: form.targetMode,
                activityIds: form.activityIds,
                groupIds: form.groupIds,
                featuredContents: featuredRuleContents
            });

            if (isForcedDraft) {
                showToast({
                    type: "warning",
                    message: `Regola salvata come bozza. Manca: ${missingFields.join(", ")}`,
                    duration: 4000
                });
            } else if (autoActivate) {
                showToast({ type: "success", message: "Regola salvata e attivata.", duration: 2200 });
            } else {
                showToast({ type: "success", message: "Regola salvata.", duration: 2200 });
            }
            // Torna alla lista Programmazione sulla tab "In evidenza"
            navigate(`/business/${businessId}/scheduling?type=featured`);
        } catch (error) {
            console.error("Errore salvataggio regola in evidenza:", error);
            showToast({ type: "error", message: "Errore durante il salvataggio.", duration: 3000 });
        } finally {
            setIsSaving(false);
        }
    };

    const backToList = `/business/${businessId}/scheduling?type=${fromType ?? "featured"}`;

    const breadcrumbItems = useMemo(() => [
        { label: "Programmazione", to: backToList },
        { label: form?.name || (isLoading ? "Caricamento..." : "Regola in evidenza") }
    ], [backToList, form?.name, isLoading]);

    useBreadcrumbItems(breadcrumbItems);

    const headerTitleAddon = useMemo(() => (
        <Badge color="var(--brand-primary)">In evidenza</Badge>
    ), []);

    const headerActions = useMemo(() => (
        form && canWrite ? (
            <div className={styles.topActions}>
                <div className={styles.enabledToggle}>
                    <Switch
                        ariaLabel={`Attiva o disattiva ${form.name}`}
                        checked={form.enabled}
                        onChange={checked => void handleToggleEnabled(checked)}
                        disabled={isTogglingEnabled || !canEdit}
                    />
                    <Text variant="body-sm" colorVariant="muted" as="span">
                        {form.enabled ? "Attiva" : "Disattivata"}
                    </Text>
                </div>
                <Menu
                    align="end"
                    trigger={
                        <Button
                            variant="secondary"
                            aria-label="Altre azioni sulla regola"
                            disabled={!canEdit || isDuplicating}
                        >
                            <MoreHorizontal size={16} />
                        </Button>
                    }
                >
                    <Menu.Item icon={Copy} onSelect={() => void handleDuplicate()}>
                        Duplica
                    </Menu.Item>
                    <Menu.Item
                        icon={Trash2}
                        variant="destructive"
                        onSelect={() => setIsDeleteDialogOpen(true)}
                    >
                        Elimina
                    </Menu.Item>
                </Menu>
                <Button
                    variant="secondary"
                    onClick={handleReset}
                    disabled={!isDirty || isSaving || !canEdit}
                >
                    Annulla modifiche
                </Button>
                <Button
                    variant="primary"
                    type="submit"
                    form="featured-rule-detail-form"
                    loading={isSaving}
                    disabled={!isDirty || !canEdit}
                >
                    Salva regola
                </Button>
            </div>
        ) : null
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [form, isDirty, isSaving, canWrite, canEdit, isTogglingEnabled, isDuplicating]);

    usePageHeader({
        title: form?.name || (isLoading ? "Caricamento regola..." : "Regola in evidenza"),
        titleAddon: headerTitleAddon,
        actions: headerActions ?? undefined,
        sticky: true,
    });

    if (isLoading || !form || !rule) {
        return null;
    }

    return (
        <PageGate readPermission="scheduling.read">
            {() => (
        <section className={styles.page}>
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

            <ConfirmDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                onConfirm={handleDelete}
                title="Eliminare regola?"
                message="Questa azione è irreversibile."
                confirmLabel="Elimina"
            />
        </section>
            )}
        </PageGate>
    );
}
