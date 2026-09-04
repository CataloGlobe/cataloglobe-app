import {
    Globe,
    Building2,
    Users,
    AlertCircle,
    ChevronRight,
    Loader2,
    Copy,
    Trash2
} from "lucide-react";
import Text from "@components/ui/Text/Text";
import { Tooltip } from "@components/ui/Tooltip/Tooltip";
import { Switch } from "@components/ui/Switch/Switch";
import { TableRowActions } from "@components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import { buildRuleSummary } from "@utils/ruleHelpers";
import { isLayoutRuleDraft } from "@utils/scheduleDraft";
import { getToggleGuardResult } from "@utils/ruleToggleGuards";
import type { LayoutRule, LayoutRuleOption } from "@services/supabase/layoutScheduling";
import styles from "./PriorityGroup.module.scss";

export type RuleInsight = {
    isActiveNow: boolean;
    hasConflict: boolean;
    isOverridden: boolean;
    isNeverUsed: boolean;
    conflictingWithName?: string;
    overriddenByName?: string;
    excludedActivityNames?: string[];
};

export interface RuleRowProps {
    rule: LayoutRule;
    isSelected: boolean;
    insight: RuleInsight | undefined;
    isUpdating: boolean;
    showTypeBadge?: boolean;
    activityById: Map<string, Pick<LayoutRuleOption, "name">>;
    activityGroups: Array<Pick<LayoutRuleOption, "id" | "name">>;
    onSelect?: (id: string, checked: boolean) => void;
    onClick: (rule: LayoutRule) => void;
    onDelete?: (ruleId: string) => void;
    onDuplicate?: (ruleId: string) => void;
    onToggleEnabled?: (ruleId: string, enabled: boolean) => void;
}

function getRuleTypeLabel(ruleType: LayoutRule["rule_type"]): string {
    if (ruleType === "layout") return "Layout";
    if (ruleType === "featured") return "In evidenza";
    if (ruleType === "price") return "Prezzi";
    return "Disponibilità";
}

export function RuleRow({
    rule,
    isSelected,
    insight,
    isUpdating,
    showTypeBadge,
    activityById,
    activityGroups,
    onSelect,
    onClick,
    onDelete,
    onDuplicate,
    onToggleEnabled
}: RuleRowProps) {
    const { showToast } = useToast();

    const ruleIsDraft = isLayoutRuleDraft(rule);

    const displayName = (
        rule.name ?? `${getRuleTypeLabel(rule.rule_type)} · ${rule.id.slice(0, 6)}`
    ).trim();

    /* Descrizione del target derivata una volta sola: il pill desktop e la
       riga secondaria condensata del mobile devono dire la stessa cosa. */
    const target: { icon: typeof Globe; label: string; tooltip: string | null } = (() => {
        if (rule.applyToAll) {
            return { icon: Globe, label: "Tutte", tooltip: "Applicata a: Tutte le attività" };
        }
        if (rule.activityIds.length > 0) {
            const firstName = activityById.get(rule.activityIds[0])?.name ?? "…";
            const extra = rule.activityIds.length - 1;
            const allNames = rule.activityIds.map(id => activityById.get(id)?.name ?? id).join(", ");
            return {
                icon: Building2,
                label: `${firstName}${extra > 0 ? ` +${extra}` : ""}`,
                tooltip: `Attività: ${allNames}`
            };
        }
        if (rule.groupIds.length > 0) {
            const firstGroupName = activityGroups.find(g => g.id === rule.groupIds[0])?.name ?? "…";
            const extra = rule.groupIds.length - 1;
            const allGroupNames = rule.groupIds
                .map(id => activityGroups.find(g => g.id === id)?.name ?? id)
                .join(", ");
            return {
                icon: Users,
                label: `${firstGroupName}${extra > 0 ? ` +${extra}` : ""}`,
                tooltip: `Gruppi: ${allGroupNames}`
            };
        }
        return { icon: AlertCircle, label: "Nessun target", tooltip: null };
    })();

    const TargetIcon = target.icon;
    const summary = buildRuleSummary(rule);

    const targetPill = (
        <div className={styles.targetPill}>
            <TargetIcon size={12} />
            <Text
                variant="caption"
                weight={target.tooltip ? 600 : undefined}
                colorVariant={target.tooltip ? undefined : "muted"}
                as="span"
                className={styles.targetPillText}
            >
                {target.label}
            </Text>
        </div>
    );

    const targetCell = target.tooltip ? (
        <Tooltip content={target.tooltip} side="top">
            {targetPill}
        </Tooltip>
    ) : (
        targetPill
    );

    return (
        <div
            className={[
                styles.row,
                styles.rowNoDrag,
                !rule.enabled ? styles.rowDisabled : "",
                isSelected ? styles.rowSelected : ""
            ]
                .filter(Boolean)
                .join(" ")}
            onClick={e => {
                if ((e.target as HTMLElement).closest("[data-no-click]")) return;
                onClick(rule);
            }}
        >
            {/* Status dot */}
            <div className={styles.statusDotCell} aria-hidden="true">
                {rule.enabled && (
                    <div
                        className={styles.statusDot}
                        style={{
                            background:
                                insight?.isActiveNow && !insight?.isOverridden
                                    ? "#16a34a"
                                    : insight?.isActiveNow && insight?.isOverridden
                                      ? "#f59e0b"
                                      : "#9ca3af"
                        }}
                    />
                )}
            </div>

            {/* Checkbox */}
            <div className={styles.rowCheckbox} data-no-click="true">
                {onSelect && (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => onSelect(rule.id, e.target.checked)}
                        onClick={e => e.stopPropagation()}
                        aria-label={`Seleziona ${displayName}`}
                    />
                )}
            </div>

            {/* Name */}
            <div className={styles.nameCell}>
                <div className={styles.nameRow}>
                    <Text
                        variant="body-sm"
                        weight={700}
                        as="span"
                        className={styles.ruleName}
                    >
                        {displayName}
                    </Text>
                    {showTypeBadge && (
                        <span className={styles.badgeType} data-type={rule.rule_type}>
                            {getRuleTypeLabel(rule.rule_type)}
                        </span>
                    )}
                    {ruleIsDraft && (
                        <span className={styles.badgeDraft}>Bozza</span>
                    )}
                </div>
                {insight && rule.enabled && (
                    <div className={styles.insightBadges}>
                        {insight.isOverridden && (
                            <Tooltip
                                content={
                                    insight.overriddenByName
                                        ? `Sovrascritta da "${insight.overriddenByName}"`
                                        : "Un'altra regola più specifica è attiva per questa sede in questo momento"
                                }
                                side="top"
                            >
                                <span className={`${styles.insightBadge} ${styles.insightOverridden}`}>
                                    Sovrascritta
                                </span>
                            </Tooltip>
                        )}
                        {insight.isNeverUsed && (
                            <span className={`${styles.insightBadge} ${styles.insightNeverUsed}`}>
                                Mai applicata
                            </span>
                        )}
                    </div>
                )}
                {insight && !insight.isOverridden && insight.excludedActivityNames && insight.excludedActivityNames.length > 0 && (
                    <Tooltip
                        content={`Sovrascritta da regole più specifiche per: ${insight.excludedActivityNames.join(", ")}`}
                        side="top"
                    >
                        <span className={styles.exclusionNote}>
                            Escluse {insight.excludedActivityNames.length} sedi
                        </span>
                    </Tooltip>
                )}
                <Text variant="caption" colorVariant="muted" className={styles.summaryDesktop}>
                    {summary}
                </Text>

                {/* Sotto i 768px il chip target sparisce dalla riga: la sua
                    informazione rientra qui, condensata in una sola stringa
                    troncata insieme al sottotitolo. */}
                <Text variant="caption" colorVariant="muted" className={styles.metaMobile}>
                    {summary} · {target.label}
                </Text>
            </div>

            {/* Target */}
            <div className={styles.targetCell}>{targetCell}</div>

            {/* Enable toggle */}
            <div className={styles.statusCell} data-no-click="true">
                {onToggleEnabled && (
                    <>
                        <Switch
                            ariaLabel={`Attiva o disattiva ${displayName}`}
                            checked={rule.enabled}
                            onChange={checked => {
                                if (checked) {
                                    const guard = getToggleGuardResult(rule);
                                    if (!guard.canToggle) {
                                        showToast({
                                            type: "error",
                                            message: guard.reason,
                                            duration: 3000
                                        });
                                        return;
                                    }
                                }
                                onToggleEnabled(rule.id, checked);
                            }}
                            disabled={isUpdating}
                        />
                        {isUpdating && <Loader2 size={12} className={styles.miniLoader} />}
                    </>
                )}
            </div>

            {/* Actions menu */}
            <div className={styles.rowActions} data-no-click="true">
                {(onDelete || onDuplicate) && (
                    <TableRowActions
                        actions={[
                            ...(onDuplicate ? [{
                                label: "Duplica",
                                icon: Copy,
                                onClick: () => onDuplicate(rule.id)
                            }] : []),
                            ...(onDelete ? [{
                                label: "Elimina",
                                icon: Trash2,
                                variant: "destructive" as const,
                                onClick: () => onDelete(rule.id)
                            }] : [])
                        ]}
                    />
                )}
            </div>

            {/* Affordance "riga tappabile": solo mobile, dove il menu azioni
                sparisce e le azioni si raggiungono dal dettaglio. */}
            <ChevronRight size={16} className={styles.rowChevron} aria-hidden="true" />
        </div>
    );
}
