import { Globe, Building2, Users, AlertCircle, Loader2, MoreVertical, Copy, Trash2 } from "lucide-react";
import Text from "@components/ui/Text/Text";
import { Tooltip } from "@components/ui/Tooltip/Tooltip";
import { Switch } from "@components/ui/Switch/Switch";
import { DropdownMenu } from "@components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@components/ui/DropdownMenu/DropdownItem";
import { useToast } from "@/context/Toast/ToastContext";
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
    onSelect: (id: string, checked: boolean) => void;
    onClick: (rule: LayoutRule) => void;
    onDelete: (ruleId: string) => void;
    onDuplicate: (ruleId: string) => void;
    onToggleEnabled: (ruleId: string, enabled: boolean) => void;
}

function getRuleTypeLabel(ruleType: LayoutRule["rule_type"]): string {
    if (ruleType === "layout") return "Layout";
    if (ruleType === "featured") return "In evidenza";
    if (ruleType === "price") return "Prezzi";
    return "Visibilità";
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

    const ruleIsDraft = (() => {
        if (!rule.applyToAll && rule.activityIds.length === 0 && rule.groupIds.length === 0) return true;
        if (rule.rule_type === "layout") return !rule.layout?.catalog_id || !rule.layout?.style_id;
        if (rule.rule_type === "featured") return rule.featured_contents.length === 0;
        if (rule.rule_type === "price") return rule.price_overrides.length === 0;
        if (rule.rule_type === "visibility") return rule.visibility_overrides.length === 0;
        return false;
    })();

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
                    onChange={checked => {
                        if (checked && rule.end_at && new Date(rule.end_at) < new Date()) {
                            showToast({
                                type: "error",
                                message: "Questa regola è scaduta. Aggiorna la data di fine prima di riattivarla.",
                                duration: 3000
                            });
                            return;
                        }
                        if (checked && ruleIsDraft) {
                            showToast({
                                type: "error",
                                message: "Completa i campi obbligatori prima di attivare la regola.",
                                duration: 3000
                            });
                            return;
                        }
                        onToggleEnabled(rule.id, checked);
                    }}
                    disabled={isUpdating}
                />
                {isUpdating && <Loader2 size={12} className={styles.miniLoader} />}
            </div>

            {/* Actions menu */}
            <div className={styles.rowActions} data-no-click="true">
                <div className={styles.rowMenuDropdown}>
                    <DropdownMenu
                        trigger={
                            <button type="button" className={styles.menuButton} title="Azioni">
                                <MoreVertical size={16} />
                            </button>
                        }
                        placement="bottom-end"
                    >
                        <DropdownItem onClick={() => onDuplicate(rule.id)}>
                            <Copy size={14} />
                            <span>Duplica</span>
                        </DropdownItem>
                        <DropdownItem onClick={() => onDelete(rule.id)} danger>
                            <Trash2 size={14} />
                            <span>Elimina</span>
                        </DropdownItem>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );
}
