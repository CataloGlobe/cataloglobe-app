import { useState, useEffect } from "react";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Globe, Building2, Users, AlertCircle, Loader2, FileText, ChevronDown, ChevronUp } from "lucide-react";
import Text from "@components/ui/Text/Text";
import { Tooltip } from "@components/ui/Tooltip/Tooltip";
import { Switch } from "@components/ui/Switch/Switch";
import { buildRuleSummary } from "@utils/ruleHelpers";
import type { LayoutRule, LayoutRuleOption } from "@services/supabase/layoutScheduling";
import type { PriorityLevel } from "@utils/priorityUtils";
import styles from "./PriorityGroup.module.scss";

type RuleInsight = {
    isActiveNow: boolean;
    hasConflict: boolean;
    isOverridden: boolean;
    isNeverUsed: boolean;
    conflictingWithName?: string;
    overriddenByName?: string;
};

interface SortableRuleRowProps {
    rule: LayoutRule;
    isSelected: boolean;
    isWinning: boolean;
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

function SortableRuleRow({
    rule,
    isSelected,
    isWinning,
    insight,
    isUpdating,
    activityById,
    activityGroups,
    onSelect,
    onClick,
    onDelete,
    onToggleEnabled
}: SortableRuleRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: rule.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined
    };

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
            ref={setNodeRef}
            style={style}
            className={[
                styles.row,
                !rule.enabled ? styles.rowDisabled : "",
                isSelected ? styles.rowSelected : "",
                isDragging ? styles.rowDragging : ""
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

            {/* Drag handle */}
            <div
                ref={setActivatorNodeRef}
                className={styles.dragHandle}
                data-no-click="true"
                title="Trascina per riordinare"
                {...attributes}
                {...listeners}
            >
                <GripVertical size={14} />
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
                        {insight.isActiveNow && !insight.isOverridden && (
                            <span className={`${styles.insightBadge} ${styles.insightActive}`}>
                                Attiva ora
                            </span>
                        )}
                        {insight.hasConflict && (
                            <span className={`${styles.insightBadge} ${styles.insightConflict}`}>
                                Conflitto
                            </span>
                        )}
                        {insight.isOverridden && (
                            <span
                                className={`${styles.insightBadge} ${styles.insightOverridden}`}
                                title="Un'altra regola ha priorità più alta in questo livello. Trascinala sopra per farla vincere."
                            >
                                Sovrascritta
                            </span>
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

export interface PriorityGroupProps {
    level: PriorityLevel;
    label: string;
    rules: LayoutRule[];
    selectedIds: Set<string>;
    onSelectionChange: (id: string, checked: boolean) => void;
    onReorder: (level: PriorityLevel, reorderedRules: LayoutRule[]) => void;
    onRuleClick: (rule: LayoutRule) => void;
    onDeleteRule: (ruleId: string) => void;
    onToggleEnabled: (ruleId: string, enabled: boolean) => void;
    updatingRules: Set<string>;
    activityById: Map<string, Pick<LayoutRuleOption, "name">>;
    activityGroups: Array<Pick<LayoutRuleOption, "id" | "name">>;
    winningRuleIds: Set<string>;
    ruleInsightsById: Map<string, RuleInsight>;
}

export function PriorityGroup({
    level,
    label,
    rules,
    selectedIds,
    onSelectionChange,
    onReorder,
    onRuleClick,
    onDeleteRule,
    onToggleEnabled,
    updatingRules,
    activityById,
    activityGroups,
    winningRuleIds,
    ruleInsightsById
}: PriorityGroupProps) {
    const isEmpty = rules.length === 0;
    const showEmptyPlaceholder = isEmpty && (level === "urgent" || level === "high");
    const [isOpen, setIsOpen] = useState(rules.length > 0);
    useEffect(() => {
        setIsOpen(rules.length > 0);
    }, [rules.length]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = rules.findIndex(r => r.id === active.id);
        const newIndex = rules.findIndex(r => r.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(rules, oldIndex, newIndex);
        onReorder(level, reordered);
    };

    return (
        <div className={styles.group}>
            <button
                type="button"
                className={`${styles.groupHeader} ${isOpen ? styles.groupHeaderOpen : styles.groupHeaderClosed}`}
                onClick={() => setIsOpen(prev => !prev)}
                aria-expanded={isOpen}
            >
                <div className={styles.groupHeaderLeft}>
                    <Text variant="body-sm" weight={700}>
                        {label}
                    </Text>
                    <span className={styles.countBadge}>{rules.length}</span>
                </div>
                <span className={styles.chevron}>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
            </button>

            {isOpen && (
                <>
                    {rules.length > 0 ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={rules.map(r => r.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {rules.map(rule => (
                                    <SortableRuleRow
                                        key={rule.id}
                                        rule={rule}
                                        isSelected={selectedIds.has(rule.id)}
                                        isWinning={winningRuleIds.has(rule.id)}
                                        insight={ruleInsightsById.get(rule.id)}
                                        isUpdating={updatingRules.has(rule.id)}
                                        activityById={activityById}
                                        activityGroups={activityGroups}
                                        onSelect={onSelectionChange}
                                        onClick={onRuleClick}
                                        onDelete={onDeleteRule}
                                        onToggleEnabled={onToggleEnabled}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    ) : showEmptyPlaceholder ? (
                        <div className={styles.emptyPlaceholder}>
                            Nessuna regola in questo livello
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
