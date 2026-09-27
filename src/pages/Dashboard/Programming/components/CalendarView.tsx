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

/** Ordine delle schede a parità d'orario: quello in cui i tipi si sommano. */
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

/**
 * Le schede di un giorno: prima quelle di tutto il giorno, poi per ora di
 * inizio; a parità, nell'ordine dei tipi.
 */
function compareCards(a: TimeBlock, b: TimeBlock): number {
    const allDayA = a.from === 0 && a.to === TOTAL_MINUTES;
    const allDayB = b.from === 0 && b.to === TOTAL_MINUTES;
    if (allDayA !== allDayB) return allDayA ? -1 : 1;
    if (a.from !== b.from) return a.from - b.from;
    const typeDelta = TYPE_ORDER.indexOf(a.rule.rule_type) - TYPE_ORDER.indexOf(b.rule.rule_type);
    if (typeDelta !== 0) return typeDelta;
    return (a.rule.name ?? "").localeCompare(b.rule.name ?? "", "it");
}

/* ─── Scheda ─────────────────────────────────────────────────── */

function renderCard(
    b: TimeBlock,
    i: number,
    catalogLabel: string,
    onRuleClick?: (rule: LayoutRule) => void
) {
    const name = getRuleName(b.rule, catalogLabel);
    const when = b.from === 0 && b.to === TOTAL_MINUTES ? "tutto il giorno" : `${fmtTime(b.from)}–${fmtTime(b.to)}`;

    return (
        <Tooltip
            key={`${b.rule.id}-${b.day}-${b.from}-${i}`}
            content={`${name} · ${ruleTypeLabel(b.rule.rule_type, catalogLabel)}`}
            side="top"
        >
            <button
                type="button"
                data-type={b.rule.rule_type}
                className={styles.card}
                onClick={() => onRuleClick?.(b.rule)}
            >
                <Text as="span" variant="body-sm" weight={500} className={styles.cardName}>
                    {name}
                </Text>
                <Text as="span" variant="caption" colorVariant="muted">
                    {when}
                </Text>
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
 * La Settimana come il mockup (`programmazione-settimana.png`): per ogni
 * giorno una pila di schede, una per regola accesa, col bordo del colore del
 * tipo, nome e orario. Niente asse delle ore. Sopra 768 sette colonne; sotto,
 * un giorno alla volta, con i sette giorni come scelta e le frecce che
 * spostano di un giorno.
 *
 * Ogni scheda è la finestra della regola, non il pezzo che vince: la
 * competizione vive per sede, e qui le sedi sono tutte insieme (mucchio 2/3).
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
    const cardsByDay = useMemo(() => {
        const byDay: TimeBlock[][] = Array.from({ length: 7 }, () => []);
        for (const block of buildBlocks(relevantRules, weekDates)) {
            if (activeType === "all" || block.rule.rule_type === activeType) byDay[block.day].push(block);
        }
        return byDay.map(cards => cards.sort(compareCards));
    }, [relevantRules, weekDates, activeType]);

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

            <div className={`${styles.week} ${isPhone ? styles.singleDay : ""}`}>
                {visibleDays.map(col => {
                    const isToday = isSameDay(weekDates[col], today);
                    return (
                        <div key={col} className={`${styles.day} ${isToday ? styles.dayToday : ""}`}>
                            {!isPhone && (
                                <div className={styles.dayHeader}>
                                    <Text as="span" variant="caption" weight={500} colorVariant={isToday ? undefined : "muted"} className={isToday ? styles.todayText : undefined}>
                                        {DAY_SHORT[col]}
                                    </Text>
                                    <Text as="span" variant="body-sm" weight={600} className={isToday ? styles.todayNumber : undefined}>
                                        {weekDates[col].getDate()}
                                    </Text>
                                </div>
                            )}
                            <div className={styles.cards}>
                                {cardsByDay[col].map((b, i) => renderCard(b, i, catalogLabel, onRuleClick))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
