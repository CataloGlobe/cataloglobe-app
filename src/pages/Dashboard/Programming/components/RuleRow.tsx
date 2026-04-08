import { Globe, Building2, Users, AlertCircle, FileText, Loader2, Trash2 } from "lucide-react";
import Text from "@components/ui/Text/Text";
import { Tooltip } from "@components/ui/Tooltip/Tooltip";
import { Switch } from "@components/ui/Switch/Switch";
import { buildRuleSummary } from "@utils/ruleHelpers";
import type { LayoutRule, LayoutRuleOption } from "@services/supabase/layoutScheduling";
import styles from "./PriorityGroup.module.scss";

export type RuleInsight = {
    isActiveNow: boolean;
    hasConflict: boolean;
    isOverridden: boolean;
    isNeverUsed: boolean;
    conflictingWithName?: string;
    overriddenByName?: string;
};

export interface RuleRowProps {
    rule: LayoutRule;
    isSelected: boolean;
    insight: RuleInsight | undefined;
    isUpdating: boolean;
    activityById: Map<string, Pick<LayoutRuleOption, "name">>;
    activityGroups: Array<Pick<LayoutRuleOption, "id" | "name">>;
    onSelect: (id: string, checked: boolean) => void;
    onClick: (rule: LayoutRule) => void;
    onDelete: (ruleId: string) => void;
    onToggleEnabled: (ruleId: string, enabled: boolean) => void;
}

function getRuleTypeLabel(ruleType: LayoutRule["rule_type"]): string {
    if (ruleType === "layout") return "Layout";
    if (ruleType === "price") return "Prezzo";
    return "Visibilità";
}

function isDraft(rule: LayoutRule): boolean {
    if (rule.rule_type === "layout") return !rule.layout?.catalog_id || !rule.layout?.style_id;
    if (rule.rule_type === "price") return rule.price_overrides.length === 0;
    if (rule.rule_type === "visibility") return rule.visibility_overrides.length === 0;
    return false;
}

export function RuleRow({
    rule,
    isSelected,
    insight,
    isUpdating,
    activityById,
    activityGroups,
    onSelect,
    onClick,
    onDelete,
    onToggleEnabled
}: RuleRowProps) {
    const draft = isDraft(rule);
    const displayName = (
        rule.name ?? `${getRuleTypeLabel(rule.rule_type)} · ${rule.id.slice(0, 6)}`
    ).trim();

    const targetCell = (() => {
        if (rule.applyToAll) {
            return (
                <Tooltip content="Applicata a: Tutte le attività" side="top">
                    <div className={styles.targetPill}>
                        <Globe size={12} />
                        <Text variant="caption" weight={600} as="span" className={styles.targetPillText}>
                            Tutte
                        </Text>
                    </div>
                </Tooltip>
            );
        }
        if (rule.activityIds.length > 0) {
            const firstName = activityById.get(rule.activityIds[0])?.name ?? "…";
            const extra = rule.activityIds.length - 1;
            const allNames = rule.activityIds.map(id => activityById.get(id)?.name ?? id).join(", ");
            return (
                <Tooltip content={`Attività: ${allNames}`} side="top">
                    <div className={styles.targetPill}>
                        <Building2 size={12} />
                        <Text variant="caption" weight={600} as="span" className={styles.targetPillText}>
                            {firstName}{extra > 0 ? ` +${extra}` : ""}
                        </Text>
                    </div>
                </Tooltip>
            );
        }
        if (rule.groupIds.length > 0) {
            const firstGroupName = activityGroups.find(g => g.id === rule.groupIds[0])?.name ?? "…";
            const extra = rule.groupIds.length - 1;
            const allGroupNames = rule.groupIds
                .map(id => activityGroups.find(g => g.id === id)?.name ?? id)
                .join(", ");
            return (
                <Tooltip content={`Gruppi: ${allGroupNames}`} side="top">
                    <div className={styles.targetPill}>
                        <Users size={12} />
                        <Text variant="caption" weight={600} as="span" className={styles.targetPillText}>
                            {firstGroupName}{extra > 0 ? ` +${extra}` : ""}
                        </Text>
                    </div>
                </Tooltip>
            );
        }
        return (
            <div className={styles.targetPill}>
                <AlertCircle size={12} />
                <Text variant="caption" colorVariant="muted" as="span" className={styles.targetPillText}>
                    Nessun target
                </Text>
            </div>
        );
    })();

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
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={e => onSelect(rule.id, e.target.checked)}
                    onClick={e => e.stopPropagation()}
                    aria-label={`Seleziona ${displayName}`}
                />
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
                    {draft && (
                        <span className={styles.badgeDraft}>
                            <FileText size={9} />
                            Bozza
                        </span>
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
                <Text variant="caption" colorVariant="muted">
                    {buildRuleSummary(rule)}
                </Text>
            </div>

            {/* Target */}
            <div>{targetCell}</div>

            {/* Enable toggle */}
            <div className={styles.statusCell} data-no-click="true">
                <Switch
                    checked={rule.enabled}
                    onChange={checked => onToggleEnabled(rule.id, checked)}
                    disabled={isUpdating}
                />
                {isUpdating && <Loader2 size={12} className={styles.miniLoader} />}
            </div>

            {/* Delete */}
            <div className={styles.rowActions} data-no-click="true">
                <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={e => {
                        e.stopPropagation();
                        onDelete(rule.id);
                    }}
                    title="Elimina regola"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
}
