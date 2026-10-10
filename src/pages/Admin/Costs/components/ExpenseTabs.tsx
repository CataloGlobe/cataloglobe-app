import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { BarList } from "@/components/ui/BarList/BarList";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import Text from "@/components/ui/Text/Text";
import {
    CRM_BILLING_INTERVAL_LABEL,
    CRM_EXPENSE_CATEGORY_LABEL,
    daysBetween,
    formatDaysLeft,
    formatEuroCents,
    monthlyEquivalentCents
} from "@shared/crmExpenses";
import { isJointAccount } from "@/utils/crm/expenseBalance";
import { oneOffByMonth, renewalProgress } from "@/utils/crm/expenseCalendar";
import { formatMonthIt, formatShortDateIt, type CrmExpenseMonth } from "@/utils/crm/expenses";
import type { CrmExpense } from "@/types/crm";
import { TileState } from "@/pages/Admin/Crm/components/TileState";
import styles from "../Costs.module.scss";

type ExpenseTab = "subscriptions" | "oneoff" | "months";

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Chi la paga; senza, la categoria. */
function payerText(expense: CrmExpense): string {
    if (!expense.paid_by) return CRM_EXPENSE_CATEGORY_LABEL[expense.category];
    return isJointAccount(expense.paid_by) ? "dal conto comune" : `paga ${expense.paid_by}`;
}

function renewalText(expense: CrmExpense, next: string | undefined, today: string): string {
    if (expense.cancelled_on) {
        return next ? `disdetto, ultimo addebito il ${formatShortDateIt(next)}` : `disdetto il ${formatShortDateIt(expense.cancelled_on)}`;
    }
    if (!next) return "concluso";
    const days = daysBetween(today, next);
    return days <= 7 ? `si rinnova ${formatDaysLeft(days)}, ${formatShortDateIt(next)}` : `si rinnova il ${formatShortDateIt(next)}`;
}

/**
 * Le spese a schede (canvas K2, scelta da Alex il 2026-10-05): abbonamenti a
 * tessere con la barra verso il rinnovo, una tantum per mese, mese per mese.
 * Ogni tessera o riga apre la spesa; il «⋯» la elimina.
 */
export function ExpenseTabs({
    expenses,
    nextCharges,
    months,
    today,
    loading,
    error,
    onRetry,
    onOpen,
    onDelete,
    onCreate
}: {
    expenses: CrmExpense[];
    nextCharges: Map<string, string>;
    months: CrmExpenseMonth[];
    today: string;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    onOpen: (expense: CrmExpense) => void;
    onDelete: (expense: CrmExpense) => void;
    onCreate: () => void;
}) {
    const [tab, setTab] = useState<ExpenseTab>("subscriptions");

    const subscriptions = useMemo(() => {
        const subs = expenses.filter(e => e.kind === "subscription");
        // Prima chi si rinnova, dal più vicino; poi i finiti.
        return subs.sort((a, b) => {
            const na = nextCharges.get(a.id);
            const nb = nextCharges.get(b.id);
            if (na && nb) return na < nb ? -1 : na > nb ? 1 : a.name.localeCompare(b.name, "it");
            if (na) return -1;
            if (nb) return 1;
            return a.name.localeCompare(b.name, "it");
        });
    }, [expenses, nextCharges]);
    const oneOffMonths = useMemo(() => oneOffByMonth(expenses), [expenses]);
    const oneOffCount = useMemo(() => expenses.filter(e => e.kind === "one_off").length, [expenses]);

    const actions = (expense: CrmExpense) => (
        <TableRowActions
            ariaLabel={`Azioni: ${expense.name}`}
            actions={[
                rowAction.edit(() => onOpen(expense)),
                rowAction.remove(() => onDelete(expense))
            ]}
        />
    );

    if (!loading && !error && expenses.length === 0) {
        return (
            <section className={styles.box}>
                <EmptyState
                    title="Ancora nessuna spesa"
                    description="Aggiungi gli abbonamenti con la data del rinnovo e le spese una tantum: i totali si fanno da soli."
                    icon={<Wallet size={32} strokeWidth={1.5} />}
                    action={
                        <Button variant="primary" size="sm" onClick={onCreate}>
                            Aggiungi spesa
                        </Button>
                    }
                />
            </section>
        );
    }

    return (
        <section className={styles.tabsBox} aria-label="Le spese">
            <Tabs value={tab} onChange={setTab} variant="line">
                <Tabs.List aria-label="Le spese">
                    <Tabs.Tab value="subscriptions" badge={subscriptions.length || undefined}>
                        Abbonamenti
                    </Tabs.Tab>
                    <Tabs.Tab value="oneoff" badge={oneOffCount || undefined}>
                        Una tantum
                    </Tabs.Tab>
                    <Tabs.Tab value="months">Mese per mese</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="subscriptions">
                    <TileState
                        loading={loading}
                        error={error}
                        onRetry={onRetry}
                        empty={subscriptions.length === 0}
                        emptyText="Nessun abbonamento. Aggiungine uno con la data del primo addebito."
                    >
                        <ul className={styles.tiles}>
                            {subscriptions.map(e => {
                                const next = nextCharges.get(e.id);
                                const interval = e.billing_interval ?? "month";
                                const soon =
                                    next !== undefined && e.remind_days_before != null && daysBetween(today, next) <= e.remind_days_before;
                                return (
                                    <li key={e.id} className={styles.tile} data-ended={next === undefined || undefined}>
                                        <div className={styles.tileHead}>
                                            <span className={styles.mark} aria-hidden="true">
                                                {e.name.trim().charAt(0).toUpperCase()}
                                            </span>
                                            <button type="button" className={styles.tileOpen} onClick={() => onOpen(e)}>
                                                <Text as="span" variant="body-sm" weight={600} className={styles.ellipsis}>
                                                    {e.name}
                                                </Text>
                                                <Text as="span" variant="caption" colorVariant="muted" className={styles.ellipsis}>
                                                    {payerText(e)}
                                                </Text>
                                            </button>
                                            {actions(e)}
                                        </div>
                                        <Text as="span" variant="body" weight={700} className={styles.figureValue}>
                                            {formatEuroCents(e.amount_cents)}{" "}
                                            <Text as="span" variant="caption" colorVariant="muted">
                                                {CRM_BILLING_INTERVAL_LABEL[interval]}
                                                {interval === "year"
                                                    ? ` · ${formatEuroCents(monthlyEquivalentCents(e.amount_cents, "year"))} al mese`
                                                    : ""}
                                            </Text>
                                        </Text>
                                        {next ? (
                                            <ProgressBar
                                                value={renewalProgress(next, interval, today)}
                                                max={1}
                                                variant={soon ? "warning" : "brand"}
                                                label={renewalText(e, next, today)}
                                            />
                                        ) : (
                                            <Text as="span" variant="caption" colorVariant="muted">
                                                {renewalText(e, next, today)}
                                            </Text>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </TileState>
                </Tabs.Panel>

                <Tabs.Panel value="oneoff">
                    <TileState
                        loading={loading}
                        error={error}
                        onRetry={onRetry}
                        empty={oneOffMonths.length === 0}
                        emptyText="Nessuna spesa una tantum."
                    >
                        <div className={styles.monthBlocks}>
                            {oneOffMonths.map(m => (
                                <div key={m.month} className={styles.monthBlock}>
                                    <div className={styles.monthName}>
                                        <Text as="span" variant="body-sm" weight={600}>
                                            {capitalize(formatMonthIt(m.month))}
                                        </Text>
                                        <Text as="span" variant="caption" colorVariant="muted" className={styles.figureValue}>
                                            {formatEuroCents(m.totalCents)}
                                        </Text>
                                    </div>
                                    <ul className={styles.oneOffRows}>
                                        {m.expenses.map(e => (
                                            <li key={e.id} className={styles.oneOffRow}>
                                                <button type="button" className={styles.oneOffOpen} onClick={() => onOpen(e)}>
                                                    <Text as="span" variant="body-sm" className={styles.ellipsis}>
                                                        {e.name}
                                                    </Text>
                                                    <Text as="span" variant="caption" colorVariant="muted" className={styles.oneOffMeta}>
                                                        {formatShortDateIt(e.paid_on as string)}
                                                        {e.paid_by ? ` · ${e.paid_by}` : ""}
                                                    </Text>
                                                    <Text as="span" variant="body-sm" weight={600} className={styles.figureValue}>
                                                        {formatEuroCents(e.amount_cents)}
                                                    </Text>
                                                </button>
                                                {actions(e)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </TileState>
                </Tabs.Panel>

                <Tabs.Panel value="months">
                    <TileState
                        loading={loading}
                        error={error}
                        onRetry={onRetry}
                        empty={months.length === 0}
                        emptyText="I mesi compaiono con la prima spesa."
                    >
                        <div className={styles.monthsPanel}>
                            <BarList
                                aria-label="Speso mese per mese"
                                items={months.map(m => ({
                                    id: m.month,
                                    label: capitalize(formatMonthIt(m.month)),
                                    value: m.totalCents,
                                    valueLabel: `${formatEuroCents(m.totalCents)} · abbonamenti ${formatEuroCents(m.subscriptionCents)}`
                                }))}
                            />
                        </div>
                    </TileState>
                </Tabs.Panel>
            </Tabs>
        </section>
    );
}
