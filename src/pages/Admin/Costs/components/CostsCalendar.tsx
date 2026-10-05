import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button/Button";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import Text from "@/components/ui/Text/Text";
import { CRM_BILLING_INTERVAL_LABEL, formatDayIt, formatEuroCents } from "@shared/crmExpenses";
import { isJointAccount } from "@/utils/crm/expenseBalance";
import { calendarDays, chargesByDay, shiftMonth } from "@/utils/crm/expenseCalendar";
import { formatMonthIt } from "@/utils/crm/expenses";
import type { CrmExpense, CrmExpenseCharge } from "@/types/crm";
import { TileState } from "@/pages/Admin/Crm/components/TileState";
import styles from "../Costs.module.scss";

const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
/** Righe di spese per giorno nella griglia; le altre in «+N». */
const CHIPS_PER_DAY = 2;

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function chargeSubtitle(expense: CrmExpense | undefined, chargedOn: string, today: string): string {
    if (!expense) return "";
    const kind =
        expense.kind === "subscription" && expense.billing_interval
            ? `abbonamento, ${CRM_BILLING_INTERVAL_LABEL[expense.billing_interval]}`
            : "una tantum";
    const who = !expense.paid_by ? "senza chi paga" : isJointAccount(expense.paid_by) ? "dal conto comune" : `paga ${expense.paid_by}`;
    return [kind, who, chargedOn > today ? "in arrivo" : null].filter(Boolean).join(" · ");
}

/**
 * Costi a calendario (canvas K5, voluto da Alex il 2026-10-05 accanto alla
 * vista a elenco): il mese con gli addebiti di ogni giorno, il giorno scelto
 * a destra. Al telefono la griglia lascia il posto all'elenco dei giorni con
 * spese.
 */
export function CostsCalendar({
    month,
    minMonth,
    maxMonth,
    selectedDay,
    today,
    charges,
    expenses,
    isPhone,
    loading,
    error,
    onRetry,
    onMonth,
    onDay,
    onOpen
}: {
    /** «AAAA-MM». */
    month: string;
    minMonth: string;
    maxMonth: string;
    selectedDay: string;
    today: string;
    charges: CrmExpenseCharge[];
    expenses: CrmExpense[];
    isPhone: boolean;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    onMonth: (month: string) => void;
    onDay: (day: string) => void;
    onOpen: (expense: CrmExpense) => void;
}) {
    const reduceMotion = useReducedMotion();
    const byId = useMemo(() => new Map(expenses.map(e => [e.id, e])), [expenses]);
    const byDay = useMemo(() => chargesByDay(charges), [charges]);
    const days = useMemo(() => calendarDays(month), [month]);
    const monthCharges = useMemo(() => charges.filter(c => c.chargedOn.startsWith(month)), [charges, month]);
    const monthTotal = monthCharges.reduce((sum, c) => sum + c.amountCents, 0);
    const dayCharges = byDay.get(selectedDay) ?? [];
    const dayTotal = dayCharges.reduce((sum, c) => sum + c.amountCents, 0);
    const kindOf = (c: CrmExpenseCharge) => byId.get(c.expenseId)?.kind ?? "one_off";

    const nav = (
        <div className={styles.calNav}>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onMonth(shiftMonth(month, -1))}
                disabled={month <= minMonth}
                aria-label="Mese prima"
            >
                <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <Text as="h2" variant="body" weight={700} className={styles.calMonth} aria-live="polite">
                {capitalize(formatMonthIt(month))}
            </Text>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onMonth(shiftMonth(month, 1))}
                disabled={month >= maxMonth}
                aria-label="Mese dopo"
            >
                <ChevronRight size={16} aria-hidden="true" />
            </Button>
            <Text as="span" variant="caption" colorVariant="muted" className={styles.calTotal}>
                {formatEuroCents(monthTotal)} nel mese
            </Text>
            <span className={styles.calLegend} aria-hidden="true">
                <Text as="span" variant="caption" color="inherit" data-kind="subscription">
                    abbonamenti
                </Text>
                <Text as="span" variant="caption" color="inherit" data-kind="one_off">
                    una tantum
                </Text>
            </span>
        </div>
    );

    const row = (c: CrmExpenseCharge, i: number) => {
        const expense = byId.get(c.expenseId);
        return (
            <ListRow
                key={`${c.expenseId}-${c.chargedOn}-${i}`}
                title={expense?.name ?? "Spesa"}
                subtitle={chargeSubtitle(expense, c.chargedOn, today)}
                trailing={formatEuroCents(c.amountCents)}
                onClick={expense ? () => onOpen(expense) : undefined}
            />
        );
    };

    if (isPhone) {
        const withCharges = [...new Set(monthCharges.map(c => c.chargedOn))].sort();
        return (
            <section className={styles.box} aria-label="Calendario delle spese">
                {nav}
                <TileState
                    loading={loading}
                    error={error}
                    onRetry={onRetry}
                    empty={withCharges.length === 0}
                    emptyText="Nessuna spesa in questo mese."
                >
                    {withCharges.map(day => (
                        <div key={day} className={styles.calPhoneDay}>
                            <Text as="h3" variant="caption" weight={600} colorVariant="muted">
                                {capitalize(formatDayIt(day))}
                                {day === today ? " · oggi" : ""}
                            </Text>
                            {(byDay.get(day) ?? []).map(row)}
                        </div>
                    ))}
                </TileState>
            </section>
        );
    }

    return (
        <section className={styles.calendar} aria-label="Calendario delle spese">
            <div className={styles.calMain}>
                {nav}
                <TileState loading={loading} error={error} onRetry={onRetry}>
                    <div className={styles.calGrid}>
                        <div className={styles.calWeek}>
                            {WEEKDAYS.map(d => (
                                <Text key={d} as="span" variant="caption" colorVariant="muted" className={styles.calWeekday}>
                                    {d}
                                </Text>
                            ))}
                        </div>
                        {Array.from({ length: days.length / 7 }, (_, w) => (
                            <div key={w} className={styles.calWeek}>
                                {days.slice(w * 7, w * 7 + 7).map(d => {
                                    const list = byDay.get(d.date) ?? [];
                                    const total = list.reduce((sum, c) => sum + c.amountCents, 0);
                                    return (
                                        <button
                                            key={d.date}
                                            type="button"
                                            className={styles.calDay}
                                            data-out={!d.inMonth || undefined}
                                            data-today={d.date === today || undefined}
                                            aria-pressed={d.date === selectedDay}
                                            aria-label={`${formatDayIt(d.date)}: ${list.length === 0 ? "nessuna spesa" : formatEuroCents(total)}`}
                                            onClick={() => {
                                                if (!d.inMonth) onMonth(d.date.slice(0, 7));
                                                onDay(d.date);
                                            }}
                                        >
                                            <span className={styles.calDayHead}>
                                                <Text as="span" variant="caption" weight={600} color="inherit" className={styles.calNum}>
                                                    {d.day}
                                                </Text>
                                                {total > 0 && (
                                                    <Text as="span" variant="caption" colorVariant="muted" className={styles.figureValue}>
                                                        {formatEuroCents(total)}
                                                    </Text>
                                                )}
                                            </span>
                                            {list.slice(0, CHIPS_PER_DAY).map((c, i) => (
                                                <Text
                                                    key={`${c.expenseId}-${i}`}
                                                    as="span"
                                                    variant="caption"
                                                    className={styles.calChip}
                                                    data-kind={kindOf(c)}
                                                    data-future={c.chargedOn > today || undefined}
                                                >
                                                    {byId.get(c.expenseId)?.name ?? "Spesa"}
                                                </Text>
                                            ))}
                                            {list.length > CHIPS_PER_DAY && (
                                                <Text as="span" variant="caption" colorVariant="muted">
                                                    +{list.length - CHIPS_PER_DAY}
                                                </Text>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </TileState>
            </div>

            <aside className={styles.calSide} aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={selectedDay}
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                        transition={{ duration: reduceMotion ? 0 : 0.18 }}
                    >
                        <div className={styles.calSideHead}>
                            <Text as="h3" variant="body" weight={700}>
                                {capitalize(formatDayIt(selectedDay))}
                            </Text>
                            <Text as="span" variant="body-sm" weight={600} className={styles.figureValue}>
                                {formatEuroCents(dayTotal)}
                            </Text>
                        </div>
                        {dayCharges.length === 0 ? (
                            <Text variant="body-sm" colorVariant="muted" className={styles.calSideEmpty}>
                                Nessuna spesa in questo giorno.
                            </Text>
                        ) : (
                            dayCharges.map(row)
                        )}
                    </motion.div>
                </AnimatePresence>
            </aside>
        </section>
    );
}
