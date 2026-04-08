import { useMemo, useState } from "react";
import Text from "@components/ui/Text/Text";
import { Tooltip } from "@components/ui/Tooltip/Tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LayoutRule, RuleType } from "@services/supabase/layoutScheduling";
import styles from "./CalendarView.module.scss";

/* ─── Constants ──────────────────────────────────────────────── */

const TOTAL_MINUTES = 24 * 60;
const GRID_HEIGHT = 600; // px
const EVEN_HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

const TYPE_LABEL: Record<RuleType, string> = {
    layout: "Layout",
    price: "Prezzi",
    visibility: "Visibilità"
};

const TYPE_SHORT: Record<RuleType, string> = {
    layout: "L",
    price: "P",
    visibility: "V"
};

const TYPE_COLOR: Record<RuleType, string> = {
    layout: "#4f46e5",
    price: "#16a34a",
    visibility: "#f59e0b"
};

const TYPE_ORDER: RuleType[] = ["layout", "price", "visibility"];

type ActiveFilter = RuleType | "all";

/* ─── Types ──────────────────────────────────────────────────── */

type TimeBlock = {
    rule: LayoutRule;
    day: number; // 0..6 column index (Mon=0..Sun=6)
    from: number; // minutes from 00:00
    to: number;
};

/* ─── Helpers ────────────────────────────────────────────────── */

function jsDayToCol(d: number): number {
    return d === 0 ? 6 : d - 1;
}

function parseMinutes(time: string): number {
    const [h, m] = time.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
}

function fmtTime(mins: number): string {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
}

function timeToPercent(mins: number): number {
    return (mins / TOTAL_MINUTES) * 100;
}

function getRuleName(rule: LayoutRule): string {
    return (rule.name ?? `${TYPE_LABEL[rule.rule_type]} · ${rule.id.slice(0, 6)}`).trim();
}

function getMonday(weekOffset: number): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function startOfDay(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function endOfDay(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(23, 59, 59, 999);
    return copy;
}

/* ─── Week-aware filtering ───────────────────────────────────── */

function isRuleRelevantForWeek(
    rule: LayoutRule,
    weekStart: Date,
    weekEnd: Date
): boolean {
    if (rule.start_at || rule.end_at) {
        const ruleStart = rule.start_at ? startOfDay(new Date(rule.start_at)) : new Date(0);
        const ruleEnd = rule.end_at ? endOfDay(new Date(rule.end_at)) : new Date(8640000000000000);
        return ruleStart <= endOfDay(weekEnd) && ruleEnd >= startOfDay(weekStart);
    }
    return true;
}

function getDaysForRule(rule: LayoutRule, weekDates: Date[]): number[] {
    if (rule.days_of_week && rule.days_of_week.length > 0) {
        return rule.days_of_week.map(jsDayToCol);
    }

    if (rule.start_at || rule.end_at) {
        const ruleStart = rule.start_at ? startOfDay(new Date(rule.start_at)) : new Date(0);
        const ruleEnd = rule.end_at ? endOfDay(new Date(rule.end_at)) : new Date(8640000000000000);

        return weekDates
            .map((date, colIndex) => ({ date, colIndex }))
            .filter(({ date }) => date >= ruleStart && date <= ruleEnd)
            .map(({ colIndex }) => colIndex);
    }

    return [0, 1, 2, 3, 4, 5, 6];
}

/* ─── Block computation ──────────────────────────────────────── */

function buildBlocks(rules: LayoutRule[], weekDates: Date[]): TimeBlock[] {
    const out: TimeBlock[] = [];

    for (const rule of rules) {
        if (!rule.enabled) continue;

        const days = getDaysForRule(rule, weekDates);

        // always or no time constraints → full day
        if (rule.time_mode === "always" || !rule.time_from || !rule.time_to) {
            for (const day of days) out.push({ rule, day, from: 0, to: TOTAL_MINUTES });
            continue;
        }

        const from = parseMinutes(rule.time_from);
        const to = parseMinutes(rule.time_to);

        if (to <= from) {
            for (const day of days) {
                out.push({ rule, day, from, to: TOTAL_MINUTES });
                out.push({ rule, day: (day + 1) % 7, from: 0, to });
            }
        } else {
            for (const day of days) out.push({ rule, day, from, to });
        }
    }

    return out;
}

/* ─── Specificity-first resolution (aligned with scheduleResolver.ts) ── */

function getRuleSpecificity(rule: LayoutRule): 0 | 1 | 2 {
    if (rule.activityIds.length > 0) return 2;
    if (rule.groupIds.length > 0) return 1;
    return 0;
}

function getTemporalScore(rule: LayoutRule): number {
    let score = 0;
    if (rule.start_at || rule.end_at) score += 4;
    if (rule.time_from && rule.time_to) score += 2;
    if (rule.days_of_week && rule.days_of_week.length > 0) score += 1;
    return score;
}

function compareBlocks(a: TimeBlock, b: TimeBlock): number {
    const specA = getRuleSpecificity(a.rule);
    const specB = getRuleSpecificity(b.rule);
    if (specA !== specB) return specB - specA;

    const tA = getTemporalScore(a.rule);
    const tB = getTemporalScore(b.rule);
    if (tA !== tB) return tB - tA;

    if (a.rule.priority !== b.rule.priority) return a.rule.priority - b.rule.priority;

    const createdDelta =
        new Date(a.rule.created_at).getTime() - new Date(b.rule.created_at).getTime();
    if (createdDelta !== 0) return createdDelta;

    return a.rule.id.localeCompare(b.rule.id);
}

function resolveTimeSegments(blocks: TimeBlock[]): TimeBlock[] {
    const groups = new Map<string, TimeBlock[]>();
    for (const b of blocks) {
        const key = `${b.day}-${b.rule.rule_type}`;
        const arr = groups.get(key);
        if (arr) arr.push(b);
        else groups.set(key, [b]);
    }

    const resolved: TimeBlock[] = [];

    for (const [, groupBlocks] of groups) {
        const sorted = [...groupBlocks].sort(compareBlocks);

        // Minute-level timeline: highest-priority rule claims first
        const timeline = new Array<string | null>(TOTAL_MINUTES).fill(null);
        for (const b of sorted) {
            for (let m = b.from; m < b.to; m++) {
                if (timeline[m] === null) timeline[m] = b.rule.id;
            }
        }

        // Compact consecutive same-rule minutes into segments
        const ruleMap = new Map<string, LayoutRule>();
        for (const b of groupBlocks) ruleMap.set(b.rule.id, b.rule);

        const day = groupBlocks[0].day;
        let segStart = 0;
        let currentId: string | null = timeline[0];

        for (let m = 1; m <= TOTAL_MINUTES; m++) {
            const id = m < TOTAL_MINUTES ? timeline[m] : null;
            if (id !== currentId) {
                if (currentId !== null) {
                    resolved.push({ rule: ruleMap.get(currentId)!, day, from: segStart, to: m });
                }
                segStart = m;
                currentId = id;
            }
        }
    }

    return resolved;
}

/* ─── Shared block renderer ──────────────────────────────────── */

function renderBlock(
    b: TimeBlock,
    dayIdx: number,
    i: number,
    color: string,
    vertical: boolean,
    onRuleClick?: (rule: LayoutRule) => void
) {
    const name = getRuleName(b.rule);
    const isAllDay = b.from === 0 && b.to === TOTAL_MINUTES;
    const top = timeToPercent(b.from);
    const height = timeToPercent(b.to) - timeToPercent(b.from);

    return (
        <Tooltip
            key={`${b.rule.id}-${dayIdx}-${b.rule.rule_type}-${i}`}
            content={
                <div className={styles.tipContent}>
                    <span className={styles.tipName}>{name}</span>
                    <span className={styles.tipMeta}>
                        {TYPE_LABEL[b.rule.rule_type]}
                        {" · "}
                        {isAllDay
                            ? "Tutto il giorno"
                            : `${fmtTime(b.from)}–${fmtTime(b.to)}`}
                    </span>
                </div>
            }
            side="top"
        >
            <button
                type="button"
                className={`${styles.ruleBlock} ${vertical ? styles.ruleBlockVertical : ""}`}
                style={{
                    top: `${top}%`,
                    height: `${Math.max(height, 0.7)}%`,
                    background: color
                }}
                onClick={() => onRuleClick?.(b.rule)}
            >
                <span className={vertical ? styles.blockLabelVertical : styles.blockLabel}>
                    {name}
                </span>
                {!vertical && height >= 8 && !isAllDay && (
                    <span className={styles.blockTime}>
                        {fmtTime(b.from)}–{fmtTime(b.to)}
                    </span>
                )}
            </button>
        </Tooltip>
    );
}

/* ─── Component ──────────────────────────────────────────────── */

export interface CalendarViewProps {
    rules: LayoutRule[];
    onRuleClick?: (rule: LayoutRule) => void;
}

export function CalendarView({ rules, onRuleClick }: CalendarViewProps) {
    const [weekOffset, setWeekOffset] = useState(0);
    const [activeType, setActiveType] = useState<ActiveFilter>("layout");

    // Week dates
    const weekDates = useMemo(() => {
        const monday = getMonday(weekOffset);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            return d;
        });
    }, [weekOffset]);

    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];
    const today = new Date();

    // Filtered rules for this week
    const relevantRules = useMemo(
        () => rules.filter(r => r.enabled && isRuleRelevantForWeek(r, weekStart, weekEnd)),
        [rules, weekStart, weekEnd]
    );

    // All blocks
    const allBlocks = useMemo(
        () => buildBlocks(relevantRules, weekDates),
        [relevantRules, weekDates]
    );

    // Resolved segments (minute-level, specificity-first)
    const resolvedBlocks = useMemo(
        () => resolveTimeSegments(allBlocks),
        [allBlocks]
    );

    // Winner count per type (unique rule IDs across resolved segments)
    const winnerCountByType = useMemo(() => {
        const counts: Record<RuleType, Set<string>> = {
            layout: new Set(),
            price: new Set(),
            visibility: new Set()
        };
        for (const b of resolvedBlocks) {
            counts[b.rule.rule_type].add(b.rule.id);
        }
        return counts;
    }, [resolvedBlocks]);

    // Current time marker
    const nowMins = today.getHours() * 60 + today.getMinutes();
    const isAll = activeType === "all";

    // Nav label
    const navLabel = `${weekStart.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short"
    })} — ${weekEnd.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    })}`;

    return (
        <div className={styles.calendarWrapper}>
            {/* ── Week navigation ─────────────────────────── */}
            <div className={styles.calendarNav}>
                <button
                    type="button"
                    className={styles.navBtn}
                    onClick={() => setWeekOffset(w => w - 1)}
                    aria-label="Settimana precedente"
                >
                    <ChevronLeft size={16} />
                </button>

                <span className={styles.calendarNavLabel}>{navLabel}</span>

                {weekOffset !== 0 && (
                    <button
                        type="button"
                        className={styles.navBtnText}
                        onClick={() => setWeekOffset(0)}
                    >
                        Oggi
                    </button>
                )}

                <button
                    type="button"
                    className={styles.navBtn}
                    onClick={() => setWeekOffset(w => w + 1)}
                    aria-label="Settimana successiva"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* ── Tab bar ─────────────────────────────────── */}
            <div className={styles.tabBar}>
                {TYPE_ORDER.map(type => {
                    const isActive = activeType === type;
                    const count = winnerCountByType[type].size;

                    return (
                        <button
                            key={type}
                            type="button"
                            className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
                            style={
                                isActive
                                    ? { borderBottomColor: TYPE_COLOR[type] }
                                    : undefined
                            }
                            onClick={() => setActiveType(type)}
                        >
                            {TYPE_LABEL[type]}
                            {count > 0 && (
                                <span
                                    className={styles.tabBadge}
                                    style={
                                        isActive
                                            ? { background: TYPE_COLOR[type] }
                                            : undefined
                                    }
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}

                <button
                    type="button"
                    className={`${styles.tab} ${isAll ? styles.tabActive : ""}`}
                    style={
                        isAll
                            ? { borderBottomColor: "var(--text, #334155)" }
                            : undefined
                    }
                    onClick={() => setActiveType("all")}
                >
                    Tutte
                </button>
            </div>

            {relevantRules.length === 0 && (
                <Text variant="caption" colorVariant="muted">
                    Nessuna regola attiva in questa settimana.
                </Text>
            )}

            {/* ── Grid ────────────────────────────────────── */}
            <div className={styles.calendarGrid}>
                {/* Header */}
                <div className={styles.gridHeader}>
                    <div className={styles.timeCorner} />
                    {weekDates.map((date, i) => {
                        const isToday = isSameDay(date, today);
                        return (
                            <div
                                key={i}
                                className={`${styles.dayHeader} ${isToday ? styles.dayHeaderToday : ""}`}
                            >
                                <span className={styles.dayName}>
                                    {date.toLocaleDateString("it-IT", { weekday: "short" })}
                                </span>
                                <span
                                    className={`${styles.dayNumber} ${isToday ? styles.dayNumberToday : ""}`}
                                >
                                    {date.getDate()}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Sub-header for "all" view */}
                {isAll && (
                    <div className={styles.subHeader}>
                        <div className={styles.timeCorner} />
                        {weekDates.map((_, i) => (
                            <div key={i} className={styles.subHeaderCell}>
                                {TYPE_ORDER.map(type => (
                                    <span
                                        key={type}
                                        className={styles.subHeaderLabel}
                                        style={{ color: TYPE_COLOR[type] }}
                                    >
                                        {TYPE_SHORT[type]}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                {/* Body */}
                <div className={styles.gridBody}>
                    {/* Time column */}
                    <div className={styles.timeCol} style={{ height: GRID_HEIGHT }}>
                        {EVEN_HOURS.map(h => (
                            <div
                                key={h}
                                className={styles.timeLabel}
                                style={{ top: `${timeToPercent(h * 60)}%` }}
                            >
                                {String(h).padStart(2, "0")}:00
                            </div>
                        ))}
                    </div>

                    {/* Day columns */}
                    {weekDates.map((date, dayIdx) => {
                        const isToday = isSameDay(date, today);

                        if (isAll) {
                            // ── "All" view: 3 sub-columns per day ──
                            return (
                                <div
                                    key={dayIdx}
                                    className={`${styles.dayColumnAll} ${isToday ? styles.dayColumnToday : ""}`}
                                    style={{ height: GRID_HEIGHT }}
                                >
                                    {/* Hour lines as overlay */}
                                    <div className={styles.hourLinesOverlay}>
                                        {EVEN_HOURS.map(h => (
                                            <div
                                                key={h}
                                                className={styles.hourLine}
                                                style={{ top: `${timeToPercent(h * 60)}%` }}
                                            />
                                        ))}

                                        {isToday && (
                                            <div
                                                className={styles.nowLine}
                                                style={{ top: `${timeToPercent(nowMins)}%` }}
                                            >
                                                <div className={styles.nowDot} />
                                            </div>
                                        )}
                                    </div>

                                    {/* 3 sub-columns */}
                                    {TYPE_ORDER.map(type => {
                                        const subBlocks = resolvedBlocks.filter(
                                            b => b.day === dayIdx && b.rule.rule_type === type
                                        );

                                        return (
                                            <div key={type} className={styles.subColumn}>
                                                {subBlocks.map((b, i) =>
                                                    renderBlock(
                                                        b,
                                                        dayIdx,
                                                        i,
                                                        TYPE_COLOR[type],
                                                        true,
                                                        onRuleClick
                                                    )
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        }

                        // ── Single-type view ──
                        const dayBlocks = resolvedBlocks.filter(
                            b => b.day === dayIdx && b.rule.rule_type === activeType
                        );

                        return (
                            <div
                                key={dayIdx}
                                className={`${styles.dayColumn} ${isToday ? styles.dayColumnToday : ""}`}
                                style={{ height: GRID_HEIGHT }}
                            >
                                {EVEN_HOURS.map(h => (
                                    <div
                                        key={h}
                                        className={styles.hourLine}
                                        style={{ top: `${timeToPercent(h * 60)}%` }}
                                    />
                                ))}

                                {isToday && (
                                    <div
                                        className={styles.nowLine}
                                        style={{ top: `${timeToPercent(nowMins)}%` }}
                                    >
                                        <div className={styles.nowDot} />
                                    </div>
                                )}

                                {dayBlocks.map((b, i) =>
                                    renderBlock(
                                        b,
                                        dayIdx,
                                        i,
                                        TYPE_COLOR[activeType as RuleType],
                                        false,
                                        onRuleClick
                                    )
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
