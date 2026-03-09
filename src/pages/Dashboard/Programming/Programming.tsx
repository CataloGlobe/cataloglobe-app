import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Building2, Users, AlertCircle, FileText, Loader2 } from "lucide-react";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { Button } from "@/components/ui/Button/Button";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { Switch } from "@/components/ui/Switch/Switch";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
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
    listLayoutRuleOptions,
    listLayoutRules,
    updateScheduleEnabled,
    type LayoutRule,
    type LayoutRuleOption,
    type RuleType
} from "@/services/supabase/v2/layoutScheduling";
import { buildRuleSummary, isRuleCurrentlyActive } from "@/utils/ruleHelpers";
import styles from "./Programming.module.scss";

type RuleTypeFilter = "all" | RuleType;

type CreateRuleForm = {
    ruleType: RuleType;
    name: string;
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

function buildDefaultCreateForm(): CreateRuleForm {
    return {
        ruleType: "layout",
        name: ""
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
        name: ""
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
            setForm(buildDefaultCreateForm());
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
    }, [showToast]);

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

    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 15000); // Check every 15s to be responsive
        return () => clearInterval(interval);
    }, []);

    const winningRuleIds = useMemo(() => {
        const ids = new Set<string>();
        const ruleTypes: RuleType[] = ["layout", "price", "visibility"];

        ruleTypes.forEach(type => {
            const activeRules = rules
                .filter(
                    r => r.rule_type === type && r.enabled && isRuleCurrentlyActive(r, currentTime)
                )
                .sort((a, b) => a.priority - b.priority);

            if (activeRules.length > 0) {
                ids.add(activeRules[0].id);
            }
        });

        return ids;
    }, [rules, currentTime]);

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
                const isWinning = winningRuleIds.has(rule.id);

                return (
                    <div className={styles.nameCell}>
                        <div className={styles.activityDotWrapper}>
                            {isWinning ? (
                                <Tooltip content="Attualmente applicata" side="top">
                                    <div className={`${styles.activityDot} ${styles.active}`} />
                                </Tooltip>
                            ) : (
                                <div className={styles.activityDot} />
                            )}
                        </div>
                        <div className={styles.nameCellContent}>
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
                            <Text
                                variant="caption"
                                colorVariant="muted"
                                className={styles.summaryLine}
                            >
                                {summary}
                            </Text>
                        </div>
                    </div>
                );
            }
        },
        {
            id: "target",
            header: "Target attività",
            width: "1.4fr",
            cell: (_value, rule) => {
                // Multi-target rendering
                if (rule.applyToAll) {
                    return (
                        <Tooltip content="Applicata a: Tutte le attività" side="top">
                            <div className={styles.targetPill}>
                                <Globe size={14} className={styles.targetIcon} />
                                <Text variant="caption" weight={600}>
                                    Tutte
                                </Text>
                            </div>
                        </Tooltip>
                    );
                }

                if (rule.activityIds.length > 0) {
                    const firstName = activityById.get(rule.activityIds[0])?.name ?? "…";
                    const extra = rule.activityIds.length - 1;
                    const allNames = rule.activityIds
                        .map(id => activityById.get(id)?.name ?? id)
                        .join(", ");
                    return (
                        <Tooltip content={`Attività: ${allNames}`} side="top">
                            <div className={styles.targetPill}>
                                <Building2 size={14} className={styles.targetIcon} />
                                <Text variant="caption" weight={600}>
                                    {firstName}
                                    {extra > 0 && (
                                        <span className={styles.targetExtraBadge}>+{extra}</span>
                                    )}
                                </Text>
                            </div>
                        </Tooltip>
                    );
                }

                if (rule.groupIds.length > 0) {
                    const firstGroupName =
                        activityGroups.find(g => g.id === rule.groupIds[0])?.name ?? "…";
                    const extra = rule.groupIds.length - 1;
                    const allGroupNames = rule.groupIds
                        .map(id => activityGroups.find(g => g.id === id)?.name ?? id)
                        .join(", ");
                    return (
                        <Tooltip content={`Gruppi: ${allGroupNames}`} side="top">
                            <div className={styles.targetPill}>
                                <Users size={14} className={styles.targetIcon} />
                                <Text variant="caption" weight={600}>
                                    {firstGroupName}
                                    {extra > 0 && (
                                        <span className={styles.targetExtraBadge}>+{extra}</span>
                                    )}
                                </Text>
                            </div>
                        </Tooltip>
                    );
                }

                // Fallback for legacy / no target
                return (
                    <div className={styles.targetPill}>
                        <AlertCircle size={14} className={styles.targetIcon} />
                        <Text variant="caption" colorVariant="muted">
                            Nessun target
                        </Text>
                    </div>
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
                    <TableRowActions
                        actions={[
                            {
                                label: "Modifica",
                                onClick: () => navigate(`/dashboard/programmazione/${rule.id}`)
                            },
                            {
                                label: "Elimina",
                                onClick: () => {
                                    setRuleToDelete(rule.id);
                                    setIsDeleteModalOpen(true);
                                },
                                variant: "destructive",
                                separator: true
                            }
                        ]}
                    />
                </div>
            )
        }
    ];

    const handleOpenCreate = () => {
        setForm(buildDefaultCreateForm());
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

    const handleBulkDelete = async (selectedIds: string[]) => {
        if (selectedIds.length === 0) return;
        try {
            await Promise.all(selectedIds.map(id => deleteLayoutRule(id)));
            showToast({
                type: "success",
                message: `${selectedIds.length} regole eliminate con successo.`,
                duration: 2200
            });
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

        setIsSaving(true);
        try {
            const newRuleId = await createRuleDraft({
                tenantId: currentTenantId,
                ruleType: form.ruleType,
                name: ruleName
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
                    selectable
                    onBulkDelete={handleBulkDelete}
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
                        <>
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
                        </>
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
