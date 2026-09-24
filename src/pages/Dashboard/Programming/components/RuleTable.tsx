import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Building2, Copy, Globe, Trash2, Users } from "lucide-react";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@components/ui/DataTable/DataTable";
import { TableRowActions } from "@components/ui/TableRowActions/TableRowActions";
import { Badge } from "@components/ui/Badge/Badge";
import { StatusBadge } from "@components/ui/StatusBadge/StatusBadge";
import { Switch } from "@components/ui/Switch/Switch";
import { Tooltip } from "@components/ui/Tooltip/Tooltip";
import Text from "@components/ui/Text/Text";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { buildRuleSummary } from "@utils/ruleHelpers";
import { isLayoutRuleDraft } from "@utils/scheduleDraft";
import { getToggleGuardResult } from "@utils/ruleToggleGuards";
import type { LayoutRule, LayoutRuleOption } from "@services/supabase/layoutScheduling";
import { ruleTypeLabel } from "../ruleTypeLabel";
import styles from "./RuleTable.module.scss";

export type RuleInsight = {
    isActiveNow: boolean;
    isOverridden: boolean;
    isNeverUsed: boolean;
    /** Motivo della portata zero (Passo 4), presente sse isNeverUsed. */
    zeroReachReason?: string;
    /** La regola che adesso vince su questa (nome e id, per il link). */
    overriddenByName?: string;
    overriddenById?: string;
    /** Nomi delle sedi dove questa regola è sovrascritta da una più specifica. */
    excludedActivityNames?: string[];
};

export interface RuleTableProps {
    rules: LayoutRule[];
    insights: Map<string, RuleInsight>;
    /** Il tipo in riga solo quando l'elenco li mostra tutti. */
    showTypeBadge: boolean;
    activityById: Map<string, Pick<LayoutRuleOption, "name">>;
    activityGroups: Array<Pick<LayoutRuleOption, "id" | "name">>;
    /** Indirizzo del dettaglio (in evidenza ha la sua rotta). */
    ruleHref: (rule: { id: string; rule_type: LayoutRule["rule_type"] }) => string;
    onOpen: (rule: LayoutRule) => void;
    updatingIds: Set<string>;
    /** Assenti senza `scheduling.write`: niente switch, selezione, azioni. */
    onToggleEnabled?: (ruleId: string, enabled: boolean) => void;
    onDuplicate?: (ruleId: string) => void;
    onDelete?: (ruleId: string) => void;
    selectedIds?: string[];
    onSelectedIdsChange?: (ids: string[]) => void;
    /** Righe Skeleton al posto delle regole. */
    isLoading?: boolean;
}

type Target = { icon: typeof Globe; label: string; tooltip: string | null };

function describeTarget(
    rule: LayoutRule,
    activityById: RuleTableProps["activityById"],
    activityGroups: RuleTableProps["activityGroups"]
): Target {
    if (rule.applyToAll) {
        return { icon: Globe, label: "Tutte le sedi", tooltip: "Si applica a tutte le sedi, anche a quelle che aggiungerai" };
    }
    if (rule.activityIds.length > 0) {
        const names = rule.activityIds.map(id => activityById.get(id)?.name ?? id);
        const extra = names.length - 1;
        return { icon: Building2, label: `${names[0]}${extra > 0 ? ` +${extra}` : ""}`, tooltip: `Sedi: ${names.join(", ")}` };
    }
    if (rule.groupIds.length > 0) {
        const names = rule.groupIds.map(id => activityGroups.find(g => g.id === id)?.name ?? id);
        const extra = names.length - 1;
        return { icon: Users, label: `${names[0]}${extra > 0 ? ` +${extra}` : ""}`, tooltip: `Gruppi di sedi: ${names.join(", ")}` };
    }
    return { icon: AlertCircle, label: "Da scegliere", tooltip: null };
}

/**
 * Le regole di un gruppo di stato, su `DataTable` (scheda «DataTable»,
 * variante «elenco raggruppato»): Regola · Dove si applica · Attiva · azioni.
 * Il clic sulla riga apre il dettaglio; switch, link e menù non lo fanno
 * (la riga ignora i clic che nascono dai controlli).
 */
export function RuleTable({
    rules,
    insights,
    showTypeBadge,
    activityById,
    activityGroups,
    ruleHref,
    onOpen,
    updatingIds,
    onToggleEnabled,
    onDuplicate,
    onDelete,
    selectedIds,
    onSelectedIdsChange,
    isLoading = false
}: RuleTableProps) {
    const { catalogLabel } = useVerticalConfig();
    const isPhone = useMediaQuery("(max-width: 767px)");
    // Sotto 1024 il tipo scende nella seconda riga: il nome ha la precedenza.
    const isCompact = useMediaQuery("(max-width: 1023px)");
    const canWrite = Boolean(onToggleEnabled);

    const columns = useMemo<ColumnDefinition<LayoutRule>[]>(() => {
        const nameOf = (rule: LayoutRule) =>
            (rule.name ?? `${ruleTypeLabel(rule.rule_type, catalogLabel)} · ${rule.id.slice(0, 6)}`).trim();

        const cols: ColumnDefinition<LayoutRule>[] = [
            {
                id: "rule",
                header: "Regola",
                cell: (_, rule) => {
                    const insight = insights.get(rule.id);
                    const name = nameOf(rule);
                    const isDraft = isLayoutRuleDraft(rule) || Boolean(insight?.zeroReachReason);
                    const state = !rule.enabled
                        ? undefined
                        : insight?.isActiveNow && !insight.isOverridden
                          ? "wins"
                          : insight?.isActiveNow
                            ? "overridden"
                            : "idle";
                    const target = describeTarget(rule, activityById, activityGroups);
                    const summary = buildRuleSummary(rule);
                    const excluded = !insight?.isOverridden ? insight?.excludedActivityNames : undefined;

                    return (
                        <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                            <span className={styles.nameLine}>
                                <span className={styles.dot} data-state={state} aria-hidden="true" />
                                <Link to={ruleHref(rule)} className={styles.name}>
                                    {name}
                                </Link>
                                {showTypeBadge && !isCompact && <Badge variant="neutral" role="presentation">{ruleTypeLabel(rule.rule_type, catalogLabel)}</Badge>}
                                {isDraft && <StatusBadge variant="warning" label="Bozza" />}
                            </span>
                            <span>
                                {[
                                    showTypeBadge && isCompact ? ruleTypeLabel(rule.rule_type, catalogLabel) : null,
                                    summary,
                                    isPhone ? target.label : null
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                            {insight?.isOverridden && rule.enabled && (
                                <Text as="span" variant="caption" colorVariant="muted">
                                    {insight.overriddenById ? (
                                        <>
                                            Sovrascritta da{" "}
                                            <Link
                                                to={ruleHref(
                                                    { id: insight.overriddenById, rule_type: rule.rule_type }
                                                )}
                                            >
                                                {insight.overriddenByName}
                                            </Link>
                                        </>
                                    ) : (
                                        "Adesso vince una regola più specifica"
                                    )}
                                </Text>
                            )}
                            {insight?.zeroReachReason && (
                                <Text as="span" variant="caption" colorVariant="muted">
                                    Nessuna sede raggiunta: {insight.zeroReachReason}
                                </Text>
                            )}
                            {excluded && excluded.length > 0 && (
                                <Tooltip content={`Qui vince una regola più specifica: ${excluded.join(", ")}`} side="top">
                                    <Text as="span" variant="caption" colorVariant="muted" tabIndex={0}>
                                        {excluded.length === 1
                                            ? "Non vale in 1 sede: c'è una regola più specifica"
                                            : `Non vale in ${excluded.length} sedi: c'è una regola più specifica`}
                                    </Text>
                                </Tooltip>
                            )}
                        </div>
                    );
                }
            },
            {
                id: "where",
                header: "Dove si applica",
                width: "180px",
                hideOnPhone: true,
                cell: (_, rule) => {
                    const target = describeTarget(rule, activityById, activityGroups);
                    const Icon = target.icon;
                    const content = (
                        <span className={styles.target} tabIndex={target.tooltip ? 0 : undefined}>
                            <Icon size={14} aria-hidden="true" />
                            <Text as="span" variant="body-sm" colorVariant={target.tooltip ? undefined : "muted"}>
                                {target.label}
                            </Text>
                        </span>
                    );
                    return target.tooltip ? <Tooltip content={target.tooltip} side="top">{content}</Tooltip> : content;
                }
            }
        ];

        if (canWrite && onToggleEnabled) {
            cols.push({
                id: "enabled",
                header: "Attiva",
                width: "72px",
                align: "center",
                cell: (_, rule) => {
                    const guard = rule.enabled ? null : getToggleGuardResult(rule);
                    const blocked = guard !== null && !guard.canToggle ? guard.reason : null;
                    const toggle = (
                        <Switch
                            ariaLabel={`Attiva o disattiva ${nameOf(rule)}`}
                            checked={rule.enabled}
                            onChange={checked => onToggleEnabled(rule.id, checked)}
                            disabled={updatingIds.has(rule.id) || blocked !== null}
                        />
                    );
                    return (
                        <span data-row-click-ignore="true" className={styles.toggle}>
                            {blocked ? (
                                // Uno switch spento non riceve il puntatore: il
                                // contenitore focusabile porta il motivo.
                                <Tooltip content={blocked} side="top">
                                    <span tabIndex={0} aria-label={blocked}>
                                        {toggle}
                                    </span>
                                </Tooltip>
                            ) : (
                                toggle
                            )}
                        </span>
                    );
                }
            });
        }

        if (onDuplicate || onDelete) {
            cols.push({
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_, rule) => (
                    <TableRowActions
                        ariaLabel={`Azioni per ${nameOf(rule)}`}
                        actions={[
                            ...(onDuplicate ? [{ label: "Duplica", icon: Copy, onClick: () => onDuplicate(rule.id) }] : []),
                            ...(onDelete
                                ? [{ label: "Elimina", icon: Trash2, variant: "destructive" as const, separator: true, onClick: () => onDelete(rule.id) }]
                                : [])
                        ]}
                    />
                )
            });
        }

        return cols;
    }, [activityById, activityGroups, canWrite, catalogLabel, insights, isCompact, isPhone, onDelete, onDuplicate, onToggleEnabled, ruleHref, showTypeBadge, updatingIds]);

    const ids = useMemo(() => rules.map(r => r.id), [rules]);

    return (
        <DataTable<LayoutRule>
            data={rules}
            columns={columns}
            isLoading={isLoading}
            onRowClick={rule => onOpen(rule)}
            // Sul telefono niente selezione multipla (come in Menù): i 48 px
            // della casella vanno al nome; si elimina dal menù della riga.
            selectable={canWrite && !isPhone && Boolean(onSelectedIdsChange)}
            selectedRowIds={selectedIds?.filter(id => ids.includes(id))}
            onSelectedRowsChange={next => {
                if (!onSelectedIdsChange || !selectedIds) return;
                // La selezione è una per la pagina: questa tabella cambia solo le sue righe.
                const others = selectedIds.filter(id => !ids.includes(id));
                onSelectedIdsChange([...others, ...next]);
            }}
            allRowIds={ids}
            showSelectionBar={false}
            pageSize={9999}
            pageSizeOptions={["all"]}
            maxHeight="none"
            showFooter={false}
        />
    );
}
