import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconDotsVertical } from "@tabler/icons-react";
import { Globe, Building2, Users, AlertCircle, FileText, Loader2 } from "lucide-react";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Button } from "@/components/ui/Button/Button";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@/components/ui/DropdownMenu/DropdownItem";
import { Switch } from "@/components/ui/Switch/Switch";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { Pill } from "@/components/ui/Pill/Pill";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useAuth } from "@/context/useAuth";
import {
    createRuleDraft,
    deleteLayoutRule,
    getSystemActivityGroupId,
    listLayoutRuleOptions,
    listLayoutRules,
    updateScheduleEnabled,
    type LayoutRule,
    type LayoutRuleOption,
    type RuleType,
    type RuleTargetType
} from "@/services/supabase/v2/layoutScheduling";
import { buildRuleSummary } from "@/utils/ruleHelpers";
import styles from "./Programming.module.scss";

type TargetMode = "all_activities" | "activity_group" | "specific_activity";
type RuleTypeFilter = "all" | RuleType;

type CreateRuleForm = {
    ruleType: RuleType;
    name: string;
    targetMode: TargetMode;
    activityId: string;
    activityGroupId: string;
};

const RULE_TYPE_FILTER_OPTIONS: Array<{ value: RuleTypeFilter; label: string }> = [
    { value: "all", label: "Tutte" },
    { value: "layout", label: "Layout" },
    { value: "price", label: "Prezzi" },
    { value: "visibility", label: "Visibilità" }
];

const CREATE_RULE_TYPE_OPTIONS: Array<{ value: RuleType; label: string }> = [
    { value: "layout", label: "Layout" },
    { value: "price", label: "Prezzi" },
    { value: "visibility", label: "Visibilità" }
];

function getRuleTypeLabel(ruleType: RuleType): string {
    if (ruleType === "layout") return "Layout";
    if (ruleType === "price") return "Prezzi";
    return "Visibilità";
}

function getRuleTargetLabel(rule: LayoutRule, activityById: Map<string, LayoutRuleOption>): string {
    if (rule.target_type === "activity_group") {
        if (rule.target_group?.is_system) return "Tutte le attività";
        return rule.target_group?.name ?? rule.target_id;
    }

    return activityById.get(rule.target_id)?.name ?? rule.target_id;
}

function buildDefaultCreateForm(input: {
    activities: LayoutRuleOption[];
    groups: LayoutRuleOption[];
    tenantId: string | null;
}): CreateRuleForm {
    const firstActivity =
        input.activities.find(activity => activity.tenant_id === input.tenantId) ??
        input.activities[0] ??
        null;

    const firstGroup =
        input.groups.find(group => group.tenant_id === input.tenantId && !group.is_system) ??
        input.groups.find(group => !group.is_system) ??
        null;

    return {
        ruleType: "layout",
        name: "",
        targetMode: "specific_activity",
        activityId: firstActivity?.id ?? "",
        activityGroupId: firstGroup?.id ?? ""
    };
}

export default function Programming() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();

    const currentTenantId = user?.id ?? null;

    const [rules, setRules] = useState<LayoutRule[]>([]);
    const [activities, setActivities] = useState<LayoutRuleOption[]>([]);
    const [activityGroups, setActivityGroups] = useState<LayoutRuleOption[]>([]);
    const [catalogs, setCatalogs] = useState<LayoutRuleOption[]>([]);
    const [stylesOptions, setStylesOptions] = useState<LayoutRuleOption[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
    const [updatingRules, setUpdatingRules] = useState<Set<string>>(new Set());

    const [searchTerm, setSearchTerm] = useState("");
    const [ruleTypeFilter, setRuleTypeFilter] = useState<RuleTypeFilter>("all");
    const [densityView, setDensityView] = useState<"list" | "grid">("grid");

    const [form, setForm] = useState<CreateRuleForm>({
        ruleType: "layout",
        name: "",
        targetMode: "specific_activity",
        activityId: "",
        activityGroupId: ""
    });

    const activityById = useMemo(
        () => new Map(activities.map(item => [item.id, item])),
        [activities]
    );
    const catalogById = useMemo(() => new Map(catalogs.map(item => [item.id, item])), [catalogs]);
    const styleById = useMemo(
        () => new Map(stylesOptions.map(item => [item.id, item])),
        [stylesOptions]
    );

    const tenantActivities = useMemo(
        () =>
            currentTenantId
                ? activities.filter(activity => activity.tenant_id === currentTenantId)
                : activities,
        [activities, currentTenantId]
    );

    const tenantGroups = useMemo(
        () =>
            (currentTenantId
                ? activityGroups.filter(group => group.tenant_id === currentTenantId)
                : activityGroups
            ).filter(group => !group.is_system),
        [activityGroups, currentTenantId]
    );

    const loadRules = useCallback(async () => {
        const rulesData = await listLayoutRules();
        setRules(rulesData);
    }, []);

    const loadInitialData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [rulesData, optionsData] = await Promise.all([
                listLayoutRules(),
                listLayoutRuleOptions()
            ]);
            setRules(rulesData);
            setActivities(optionsData.activities);
            setActivityGroups(optionsData.activityGroups);
            setCatalogs(optionsData.catalogs);
            setStylesOptions(optionsData.styles);
            setForm(
                buildDefaultCreateForm({
                    activities: optionsData.activities,
                    groups: optionsData.activityGroups,
                    tenantId: currentTenantId
                })
            );
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
        const typeFilteredRules =
            ruleTypeFilter === "all"
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

    const columns: ColumnDefinition<LayoutRule>[] = [
        {
            id: "name",
            header: "Regola",
            width: "2.4fr",
            cell: (_value, rule) => {
                const draft = isDraft(rule);
                const summary = buildRuleSummary(rule);
                return (
                    <div className={styles.nameCell}>
                        <div className={styles.nameRow}>
                            <Text variant="body-sm" weight={700}>
                                {(
                                    rule.name ??
                                    `${getRuleTypeLabel(rule.rule_type)} · ${rule.id.slice(0, 6)}`
                                ).trim()}
                            </Text>
                            {draft && (
                                <span className={styles.badgeDraft}>
                                    <FileText size={10} />
                                    Bozza
                                </span>
                            )}
                        </div>
                        <Text variant="caption" colorVariant="muted" className={styles.summaryLine}>
                            {summary}
                        </Text>
                    </div>
                );
            }
        },
        {
            id: "target",
            header: "Target attività",
            width: "1.4fr",
            cell: (_value, rule) => {
                let targetLabel = "";
                let Icon = Building2;
                let isAll = false;

                if (rule.target_type === "activity_group") {
                    if (rule.target_group?.is_system) {
                        targetLabel = "Tutte le attività";
                        Icon = Globe;
                        isAll = true;
                    } else {
                        targetLabel = `Gruppo: ${rule.target_group?.name ?? rule.target_id}`;
                        Icon = Users;
                    }
                } else {
                    targetLabel = `Attività: ${activityById.get(rule.target_id)?.name ?? rule.target_id}`;
                }

                return (
                    <Tooltip content={`Applicata a: ${targetLabel}`} side="top">
                        <div className={styles.targetPill}>
                            <Icon size={14} className={styles.targetIcon} />
                            <Text variant="caption" weight={600}>
                                {isAll
                                    ? "Tutte"
                                    : (rule.target_group?.name ??
                                      activityById.get(rule.target_id)?.name ??
                                      "...")}
                            </Text>
                        </div>
                    </Tooltip>
                );
            }
        },
        {
            id: "type",
            header: "Tipo",
            width: "0.8fr",
            cell: (_value, rule) => {
                const ruleTypeBadgeClassName =
                    rule.rule_type === "layout"
                        ? styles.ruleTypeLayout
                        : rule.rule_type === "price"
                          ? styles.ruleTypePrice
                          : styles.ruleTypeVisibility;

                return (
                    <span className={`${styles.ruleTypeBadge} ${ruleTypeBadgeClassName}`}>
                        <Text variant="caption" colorVariant="white" as="span">
                            {getRuleTypeLabel(rule.rule_type)}
                        </Text>
                    </span>
                );
            }
        },
        {
            id: "priority",
            header: "Priorità",
            width: "0.6fr",
            accessor: rule => rule.priority,
            cell: value => <Text variant="body-sm">{value as number}</Text>
        },
        {
            id: "status",
            header: "Stato",
            width: "80px",
            align: "center",
            cell: (_value, rule) => {
                const isUpdating = updatingRules.has(rule.id);
                return (
                    <div className={styles.statusCell} onClick={e => e.stopPropagation()}>
                        <Switch
                            checked={rule.enabled}
                            onChange={checked => void handleToggleEnabled(rule.id, checked)}
                            disabled={isUpdating}
                        />
                        {isUpdating && <Loader2 size={14} className={styles.miniLoader} />}
                    </div>
                );
            }
        },
        {
            id: "actions",
            header: "Azioni",
            width: "80px",
            align: "right",
            cell: (_value, rule) => (
                <div className={styles.rowActions} data-row-click-ignore="true">
                    <DropdownMenu
                        trigger={
                            <button className={styles.kebabButton} aria-label="Azioni riga">
                                <IconDotsVertical size={18} />
                            </button>
                        }
                        placement="bottom-end"
                    >
                        <DropdownItem
                            onClick={() => navigate(`/dashboard/programmazione/${rule.id}`)}
                        >
                            Modifica
                        </DropdownItem>
                        <DropdownItem
                            danger
                            onClick={() => {
                                setRuleToDelete(rule.id);
                                setIsDeleteModalOpen(true);
                            }}
                        >
                            Elimina
                        </DropdownItem>
                    </DropdownMenu>
                </div>
            )
        }
    ];

    const handleOpenCreate = () => {
        setForm(
            buildDefaultCreateForm({
                activities,
                groups: activityGroups,
                tenantId: currentTenantId
            })
        );
        setIsCreateDrawerOpen(true);
    };

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

    const handleCreateRule = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!currentTenantId) {
            showToast({
                type: "error",
                message: "Utente non valido. Effettua nuovamente il login.",
                duration: 3000
            });
            return;
        }

        const ruleName = form.name.trim();
        if (!ruleName) {
            showToast({
                type: "error",
                message: "Inserisci il nome regola.",
                duration: 2600
            });
            return;
        }

        let targetType: RuleTargetType = "activity";
        let targetId = form.activityId;

        if (form.targetMode === "all_activities") {
            const systemGroupId = await getSystemActivityGroupId(currentTenantId);
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
            showToast({
                type: "error",
                message: "Seleziona un'attività.",
                duration: 2600
            });
            return;
        }

        setIsSaving(true);
        try {
            const newRuleId = await createRuleDraft({
                tenantId: currentTenantId,
                ruleType: form.ruleType,
                name: ruleName,
                targetType,
                targetId
            });

            showToast({
                type: "success",
                message: "Regola creata. Apri il workspace per configurarla.",
                duration: 2400
            });

            setIsCreateDrawerOpen(false);
            navigate(`/dashboard/programmazione/${newRuleId}`);
        } catch (error) {
            console.error("Errore creazione regola:", error);
            showToast({
                type: "error",
                message: "Errore durante la creazione della regola.",
                duration: 3000
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className={styles.programming}>
            <div className={styles.topArea}>
                <Breadcrumb items={[{ label: "Programmazione" }]} />
                <PageHeader
                    title="Programmazione"
                    subtitle="Gestisci le regole del Rule Engine."
                    actions={
                        <Button
                            variant="primary"
                            onClick={handleOpenCreate}
                            disabled={!currentTenantId}
                        >
                            Nuova regola
                        </Button>
                    }
                />
            </div>

            <FilterBar
                search={{
                    value: searchTerm,
                    onChange: setSearchTerm,
                    placeholder: "Cerca per nome, tipo, target o id..."
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
                    onRowClick={row => navigate(`/dashboard/programmazione/${row.id}`)}
                    rowClassName={rule => (!rule.enabled ? styles.disabledRow : "")}
                    loadingState={
                        <div className={styles.emptyState}>
                            <Text colorVariant="muted">Caricamento regole...</Text>
                        </div>
                    }
                    emptyState={
                        <div className={styles.emptyState}>
                            <Text variant="title-sm">Nessuna regola</Text>
                            <Text colorVariant="muted">
                                Crea la prima regola o modifica i filtri di ricerca.
                            </Text>
                        </div>
                    }
                />
            </div>

            <SystemDrawer
                open={isCreateDrawerOpen}
                onClose={() => setIsCreateDrawerOpen(false)}
                width={460}
                aria-labelledby="create-rule-title"
            >
                <DrawerLayout
                    header={
                        <div className={styles.drawerHeader}>
                            <Text as="h3" variant="title-sm" id="create-rule-title">
                                Nuova regola
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Crea una regola draft e apri subito il workspace di configurazione.
                            </Text>
                        </div>
                    }
                    footer={
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
                                form="create-rule-form"
                                loading={isSaving}
                            >
                                Crea e configura
                            </Button>
                        </div>
                    }
                >
                    <form id="create-rule-form" className={styles.form} onSubmit={handleCreateRule}>
                        <Select
                            label="Tipo regola"
                            value={form.ruleType}
                            onChange={event =>
                                setForm(prev => ({
                                    ...prev,
                                    ruleType: event.target.value as RuleType
                                }))
                            }
                            options={CREATE_RULE_TYPE_OPTIONS}
                        />

                        <TextInput
                            label="Nome regola"
                            value={form.name}
                            onChange={event =>
                                setForm(prev => ({
                                    ...prev,
                                    name: event.target.value
                                }))
                            }
                            required
                            placeholder="Es. Layout pranzo weekend"
                        />

                        <Select
                            label="Target"
                            value={form.targetMode}
                            onChange={event =>
                                setForm(prev => ({
                                    ...prev,
                                    targetMode: event.target.value as TargetMode
                                }))
                            }
                            options={[
                                { value: "all_activities", label: "Tutte le attività" },
                                { value: "activity_group", label: "Gruppi attività" },
                                { value: "specific_activity", label: "Attività specifiche" }
                            ]}
                        />

                        {form.targetMode === "specific_activity" && (
                            <Select
                                label="Attività"
                                value={form.activityId}
                                onChange={event =>
                                    setForm(prev => ({
                                        ...prev,
                                        activityId: event.target.value
                                    }))
                                }
                                options={[
                                    { value: "", label: "Seleziona attività" },
                                    ...tenantActivities.map(activity => ({
                                        value: activity.id,
                                        label: activity.name
                                    }))
                                ]}
                            />
                        )}

                        {form.targetMode === "activity_group" && (
                            <Select
                                label="Gruppo attività"
                                value={form.activityGroupId}
                                onChange={event =>
                                    setForm(prev => ({
                                        ...prev,
                                        activityGroupId: event.target.value
                                    }))
                                }
                                options={[
                                    { value: "", label: "Seleziona gruppo" },
                                    ...tenantGroups.map(group => ({
                                        value: group.id,
                                        label: group.name
                                    }))
                                ]}
                            />
                        )}
                    </form>
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
