import { useMemo, useState } from "react";
import Text from "@components/ui/Text/Text";
import { Button } from "@components/ui/Button/Button";
import { IconButton } from "@components/ui/Button/IconButton";
import { ChipGroupSingle } from "@components/ui/Chip/ChipGroup";
import { EmptyState } from "@components/ui/EmptyState/EmptyState";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Tooltip } from "@components/ui/Tooltip/Tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LayoutRule, RuleType } from "@services/supabase/layoutScheduling";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { ruleTypeLabel } from "../ruleTypeLabel";
import styles from "./CalendarView.module.scss";

export type CalendarRuleTypeFilter = RuleType | "all";

/* ─── Constants ──────────────────────────────────────────────── */

const TOTAL_MINUTES = 24 * 60;
const GRID_HEIGHT = 600; // px
const EVEN_HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

const TYPE_SHORT: Record<RuleType, string> = {
    layout: "M",
    featured: "E",
    price: "P",
    visibility: "D"
};

const TYPE_ORDER: RuleType[] = ["layout", "featured", "price", "visibility"];

/** I giorni in testata, sempre a tre lettere (colonna 0 = lunedì). */
const DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];


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

function getRuleName(rule: LayoutRule, catalogLabel: string): string {
    return (rule.name ?? `${ruleTypeLabel(rule.rule_type, catalogLabel)} · ${rule.id.slice(0, 6)}`).trim();
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
    i: number,
    vertical: boolean,
    catalogLabel: string,
    onRuleClick?: (rule: LayoutRule) => void
) {
    const name = getRuleName(b.rule, catalogLabel);
    const isAllDay = b.from === 0 && b.to === TOTAL_MINUTES;
    const top = timeToPercent(b.from);
    const height = timeToPercent(b.to) - timeToPercent(b.from);

    return (
        <Tooltip
            key={`${b.rule.id}-${b.day}-${b.rule.rule_type}-${i}`}
            content={
                <div className={styles.tipContent}>
                    <span className={styles.tipName}>{name}</span>
                    <span className={styles.tipMeta}>
                        {ruleTypeLabel(b.rule.rule_type, catalogLabel)}
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
                data-type={b.rule.rule_type}
                className={`${styles.ruleBlock} ${vertical ? styles.ruleBlockVertical : ""}`}
                // Posizione nella giornata: calcolata, non un colore né una misura di tema.
                style={{ top: `${top}%`, height: `${Math.max(height, 0.7)}%` }}
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
    ruleTypeFilter: CalendarRuleTypeFilter;
    onRuleClick?: (rule: LayoutRule) => void;
}

const DAY_LONG = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function todayColumn(): number {
    return jsDayToCol(new Date().getDay());
}

/**
 * La Settimana: sopra 768 sette colonne; sotto, un giorno alla volta (le
 * quattro sottocolonne di «Tutte» non si leggono a 44 px), con i sette giorni
 * come scelta e le frecce che spostano di un giorno.
 */
export function CalendarView({ rules, ruleTypeFilter, onRuleClick }: CalendarViewProps) {
    const [weekOffset, setWeekOffset] = useState(0);
    const [dayIdx, setDayIdx] = useState(todayColumn);
    const { catalogLabel } = useVerticalConfig();
    const isPhone = useMediaQuery("(max-width: 767px)");
    const activeType = ruleTypeFilter;

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

    const relevantRules = useMemo(
        () => rules.filter(r => r.enabled && isRuleRelevantForWeek(r, weekStart, weekEnd)),
        [rules, weekStart, weekEnd]
    );
    const allBlocks = useMemo(() => buildBlocks(relevantRules, weekDates), [relevantRules, weekDates]);
    // Resolved segments (minute-level, specificity-first)
    const resolvedBlocks = useMemo(() => resolveTimeSegments(allBlocks), [allBlocks]);

    const nowMins = today.getHours() * 60 + today.getMinutes();
    const isAll = activeType === "all";
    const visibleDays = isPhone ? [dayIdx] : [0, 1, 2, 3, 4, 5, 6];
    const isCurrent = weekOffset === 0 && (!isPhone || dayIdx === todayColumn());

    const stepDay = (delta: 1 | -1) => {
        const next = dayIdx + delta;
        if (next < 0) {
            setWeekOffset(w => w - 1);
            setDayIdx(6);
        } else if (next > 6) {
            setWeekOffset(w => w + 1);
            setDayIdx(0);
        } else {
            setDayIdx(next);
        }
    };
    const goToday = () => {
        setWeekOffset(0);
        setDayIdx(todayColumn());
    };

    const selected = weekDates[dayIdx];
    const navLabel = isPhone
        ? `${DAY_LONG[dayIdx]} ${selected.getDate()} ${selected.toLocaleDateString("it-IT", { month: "long" })}`
        : `${weekStart.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })} — ${weekEnd.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}`;

    return (
        <div className={styles.calendarWrapper}>
            <div className={styles.calendarNav}>
                <IconButton
                    icon={<ChevronLeft size={16} />}
                    variant="secondary"
                    size="sm"
                    aria-label={isPhone ? "Giorno precedente" : "Settimana precedente"}
                    onClick={() => (isPhone ? stepDay(-1) : setWeekOffset(w => w - 1))}
                />
                <Text as="span" variant="body-sm" weight={600} className={styles.calendarNavLabel}>
                    {navLabel}
                </Text>
                <IconButton
                    icon={<ChevronRight size={16} />}
                    variant="secondary"
                    size="sm"
                    aria-label={isPhone ? "Giorno successivo" : "Settimana successiva"}
                    onClick={() => (isPhone ? stepDay(1) : setWeekOffset(w => w + 1))}
                />
                {!isCurrent && (
                    <Button variant="ghost" size="sm" onClick={goToday}>
                        Oggi
                    </Button>
                )}
            </div>

            {isPhone && (
                <ChipGroupSingle<string>
                    ariaLabel="Giorno"
                    value={String(dayIdx)}
                    onChange={value => setDayIdx(Number(value))}
                    options={weekDates.map((date, i) => ({
                        value: String(i),
                        label: `${DAY_SHORT[i]} ${date.getDate()}`
                    }))}
                    layout="auto"
                    shape="pill"
                />
            )}

            {relevantRules.length === 0 && (
                <EmptyState variant="inline" title="Nessuna regola attiva questa settimana" />
            )}

            <div className={`${styles.calendarGrid} ${isPhone ? styles.singleDay : ""}`}>
                {!isPhone && (
                    <div className={styles.gridHeader}>
                        <div className={styles.timeCorner} />
                        {weekDates.map((date, i) => {
                            const isToday = isSameDay(date, today);
                            return (
                                <div
                                    key={i}
                                    className={`${styles.dayHeader} ${isToday ? styles.dayHeaderToday : ""}`}
                                >
                                    <span className={styles.dayName}>{DAY_SHORT[i]}</span>
                                    <span className={`${styles.dayNumber} ${isToday ? styles.dayNumberToday : ""}`}>
                                        {date.getDate()}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {isAll && (
                    <div className={styles.subHeader}>
                        <div className={styles.timeCorner} />
                        {visibleDays.map(i => (
                            <div key={i} className={styles.subHeaderCell}>
                                {TYPE_ORDER.map(type => (
                                    <span key={type} className={styles.subHeaderLabel} data-type={type}>
                                        {TYPE_SHORT[type]}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                <div className={styles.gridBody}>
                    <div className={styles.timeCol} style={{ height: GRID_HEIGHT }}>
                        {EVEN_HOURS.map(h => (
                            <div key={h} className={styles.timeLabel} style={{ top: `${timeToPercent(h * 60)}%` }}>
                                {String(h).padStart(2, "0")}:00
                            </div>
                        ))}
                    </div>

                    {visibleDays.map(col => {
                        const isToday = isSameDay(weekDates[col], today);
                        const nowLine = isToday && (
                            <div className={styles.nowLine} style={{ top: `${timeToPercent(nowMins)}%` }}>
                                <div className={styles.nowDot} />
                            </div>
                        );

                        if (isAll) {
                            return (
                                <div
                                    key={col}
                                    className={`${styles.dayColumnAll} ${isToday ? styles.dayColumnToday : ""}`}
                                    style={{ height: GRID_HEIGHT }}
                                >
                                    <div className={styles.hourLinesOverlay}>
                                        {EVEN_HOURS.map(h => (
                                            <div key={h} className={styles.hourLine} style={{ top: `${timeToPercent(h * 60)}%` }} />
                                        ))}
                                        {nowLine}
                                    </div>
                                    {TYPE_ORDER.map(type => (
                                        <div key={type} className={styles.subColumn}>
                                            {resolvedBlocks
                                                .filter(b => b.day === col && b.rule.rule_type === type)
                                                .map((b, i) => renderBlock(b, i, true, catalogLabel, onRuleClick))}
                                        </div>
                                    ))}
                                </div>
                            );
                        }

                        return (
                            <div
                                key={col}
                                className={`${styles.dayColumn} ${isToday ? styles.dayColumnToday : ""}`}
                                style={{ height: GRID_HEIGHT }}
                            >
                                {EVEN_HOURS.map(h => (
                                    <div key={h} className={styles.hourLine} style={{ top: `${timeToPercent(h * 60)}%` }} />
                                ))}
                                {nowLine}
                                {resolvedBlocks
                                    .filter(b => b.day === col && b.rule.rule_type === activeType)
                                    .map((b, i) => renderBlock(b, i, false, catalogLabel, onRuleClick))}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
