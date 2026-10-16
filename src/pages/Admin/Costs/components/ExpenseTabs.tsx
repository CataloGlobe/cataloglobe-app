import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ChipGroupSingle, type ChipOption } from "@/components/ui/Chip/ChipGroup";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
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
import { isJointAccount, payerKey, settlementText } from "@/utils/crm/expenseBalance";
import { filterHistory, historyByMonth, oneOffByMonth, type HistoryRow } from "@/utils/crm/expenseCalendar";
import type { ChargePayer } from "@/utils/crm/expenseTerms";
import { formatMonthIt, formatShortDateIt, type CrmExpenseMonth } from "@/utils/crm/expenses";
import type { CrmExpense, CrmExpenseCategory, CrmExpenseCharge, CrmExpenseSettlement } from "@/types/crm";
import { TileState } from "@/pages/Admin/Crm/components/TileState";
import { ExpenseIcon } from "./ExpenseIcon";
import { KindTag } from "./KindTag";
import { CATEGORY_META, expenseKind } from "./expenseCategoryMeta";
import { MonthsByCategory } from "./MonthsByCategory";
import styles from "../Costs.module.scss";

type ExpenseTab = "subscriptions" | "oneoff" | "history" | "months";

/** «comune» nell'indirizzo = i conti comuni; un nome = quella persona. */
const JOINT_FILTER = "comune";

/**
 * Una riga passa il filtro di chi paga: l'addebito se l'ha pagato lui (dal
 * conto in vigore quel giorno), il movimento se l'ha fatto o ricevuto. Il
 * filtro per tipo lascia fuori i movimenti: non sono spese.
 */
function historyMatch(
    row: HistoryRow,
    who: string,
    type: string,
    chargePayer: (expenseId: string, date: string) => ChargePayer
): boolean {
    if (row.kind === "move") {
        if (type) return false;
        if (!who) return true;
        const s = row.settlement;
        if (who === JOINT_FILTER) return isJointAccount(s.to_name) || isJointAccount(s.from_name);
        return payerKey(s.from_name) === payerKey(who) || payerKey(s.to_name) === payerKey(who);
    }
    if (type && row.expense.category !== type) return false;
    if (!who) return true;
    const payer = chargePayer(row.expense.id, row.date);
    if (who === JOINT_FILTER) return payer.type === "joint";
    return payer.type === "person" && payerKey(payer.name) === payerKey(who);
}

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
    return `si rinnova ${formatDaysLeft(days)}, ${formatShortDateIt(next)}`;
}

/**
 * Le spese a schede (canvas K2, scelta da Alex il 2026-10-05): abbonamenti a
 * tessere coi giorni al rinnovo (la barra è uscita il 2026-10-16), una tantum per mese, mese per mese.
 * Lo storico è la scheda di base (Alex, 2026-10-16).
 * Ogni tessera o riga apre la spesa; il «⋯» la elimina. Lo storico mette
 * insieme addebiti e movimenti, così si vedono anche i soldi passati fra voi.
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
    onCreate,
    accountLabel,
    charges,
    settlements,
    team,
    chargePayer,
    historyWho,
    historyType,
    onHistoryFilters,
    onDeleteMove
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
    /** Il nome della carta o del conto (al prossimo addebito); null senza conto. */
    accountLabel?: (expense: CrmExpense) => string | null;
    /** Addebiti caricati (lo storico tiene quelli fino a oggi). */
    charges: CrmExpenseCharge[];
    settlements: CrmExpenseSettlement[];
    /** I nomi della squadra, per il filtro di chi paga. */
    team: string[];
    chargePayer: (expenseId: string, date: string) => ChargePayer;
    /** Filtri dello storico dall'indirizzo: "" = tutti. */
    historyWho: string;
    historyType: string;
    onHistoryFilters: (values: { chi?: string; tipo?: string }) => void;
    onDeleteMove: (move: CrmExpenseSettlement) => void;
}) {
    const [tab, setTab] = useState<ExpenseTab>("history");

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
    // Quanto pesano al mese gli abbonamenti che si rinnovano ancora (gli annuali a 1/12).
    const activeSubs = subscriptions.filter(e => nextCharges.has(e.id) && !e.cancelled_on);
    const subsMonthlyCents = activeSubs.reduce(
        (sum, e) => sum + monthlyEquivalentCents(e.amount_cents, e.billing_interval ?? "month"),
        0
    );
    const oneOffMonths = useMemo(() => oneOffByMonth(expenses), [expenses]);
    const oneOffCount = useMemo(() => expenses.filter(e => e.kind === "one_off").length, [expenses]);
    const fullHistory = useMemo(
        () => historyByMonth(charges, expenses, settlements, today),
        [charges, expenses, settlements, today]
    );
    // Un valore dell'indirizzo che non c'è più (nome, tipo) vale «tutti».
    const who = historyWho === JOINT_FILTER || team.some(n => payerKey(n) === payerKey(historyWho)) ? historyWho : "";
    const type = historyType in CATEGORY_META ? historyType : "";
    const history = useMemo(
        () => (who || type ? filterHistory(fullHistory, row => historyMatch(row, who, type, chargePayer)) : fullHistory),
        [fullHistory, who, type, chargePayer]
    );
    const whoOptions: ChipOption<string>[] = [
        { value: "tutti", label: "Tutti" },
        ...team.map(name => ({ value: name, label: name })),
        { value: JOINT_FILTER, label: "Conto comune" }
    ];
    const typeOptions: ChipOption<string>[] = [
        { value: "tutti", label: "Tutti i tipi" },
        ...(Object.keys(CATEGORY_META) as CrmExpenseCategory[]).map(c => ({ value: c, label: CATEGORY_META[c].label }))
    ];

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
                    <Tabs.Tab value="history">Storico</Tabs.Tab>
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
                        <Text as="p" variant="caption" colorVariant="muted" className={styles.tilesTotal}>
                            {activeSubs.length === 1 ? "1 attivo" : `${activeSubs.length} attivi`}:{" "}
                            {formatEuroCents(subsMonthlyCents)} al mese in tutto
                        </Text>
                        <ul className={styles.tiles}>
                            {subscriptions.map(e => {
                                const next = nextCharges.get(e.id);
                                const interval = e.billing_interval ?? "month";
                                const soon =
                                    next !== undefined && e.remind_days_before != null && daysBetween(today, next) <= e.remind_days_before;
                                return (
                                    <li key={e.id} className={styles.tile} data-ended={next === undefined || undefined}>
                                        <div className={styles.tileHead}>
                                            <ExpenseIcon category={e.category} />
                                            <button type="button" className={styles.tileOpen} onClick={() => onOpen(e)}>
                                                <Text as="span" variant="body-sm" weight={600} className={styles.ellipsis}>
                                                    {e.name}
                                                </Text>
                                                <Text as="span" variant="caption" colorVariant="muted" className={styles.ellipsis}>
                                                    {accountLabel?.(e) ? `su ${accountLabel(e)}` : payerText(e)}
                                                </Text>
                                            </button>
                                            {actions(e)}
                                        </div>
                                        <span className={styles.nameCell}>
                                            <Text as="span" variant="body" weight={700} className={styles.figureValue}>
                                                {formatEuroCents(e.amount_cents)}{" "}
                                                <Text as="span" variant="caption" colorVariant="muted">
                                                    {CRM_BILLING_INTERVAL_LABEL[interval]}
                                                    {interval === "year"
                                                        ? ` · ${formatEuroCents(monthlyEquivalentCents(e.amount_cents, "year"))} al mese`
                                                        : ""}
                                                </Text>
                                            </Text>
                                            <KindTag kind={expenseKind(e)} />
                                        </span>
                                        <Text
                                            as="span"
                                            variant="caption"
                                            colorVariant={soon ? undefined : "muted"}
                                            className={soon ? styles.renewSoon : undefined}
                                        >
                                            {renewalText(e, next, today)}
                                        </Text>
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
                                                    <ExpenseIcon category={e.category} />
                                                    <Text as="span" variant="body-sm" className={styles.ellipsis}>
                                                        {e.name}
                                                    </Text>
                                                    <Text as="span" variant="caption" colorVariant="muted" className={styles.oneOffMeta}>
                                                        {formatShortDateIt(e.paid_on as string)}
                                                        {accountLabel?.(e) ? ` · ${accountLabel(e)}` : e.paid_by ? ` · ${e.paid_by}` : ""}
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

                <Tabs.Panel value="history">
                    <TileState
                        loading={loading}
                        error={error}
                        onRetry={onRetry}
                        empty={fullHistory.length === 0}
                        emptyText="Lo storico compare con la prima spesa o il primo movimento."
                    >
                        <div className={styles.historyFilters}>
                            <ChipGroupSingle
                                ariaLabel="Chi paga"
                                options={whoOptions}
                                value={who || "tutti"}
                                onChange={v => onHistoryFilters({ chi: v === "tutti" ? "" : v })}
                                layout="auto"
                                shape="pill"
                            />
                            <ChipGroupSingle
                                ariaLabel="Tipo di spesa"
                                options={typeOptions}
                                value={type || "tutti"}
                                onChange={v => onHistoryFilters({ tipo: v === "tutti" ? "" : v })}
                                layout="auto"
                                shape="pill"
                            />
                        </div>
                        {history.length === 0 && (
                            <Text as="p" variant="body-sm" colorVariant="muted">
                                Niente con questi filtri.{" "}
                                <Button variant="ghost" size="sm" onClick={() => onHistoryFilters({ chi: "", tipo: "" })}>
                                    Togli i filtri
                                </Button>
                            </Text>
                        )}
                        <div className={styles.monthBlocks}>
                            {history.map(m => (
                                <div key={m.month} className={styles.monthBlock}>
                                    <div className={styles.monthName}>
                                        <Text as="span" variant="body-sm" weight={600}>
                                            {capitalize(formatMonthIt(m.month))}
                                        </Text>
                                        <Text as="span" variant="caption" colorVariant="muted" className={styles.figureValue}>
                                            {formatEuroCents(m.spentCents)} di spese
                                        </Text>
                                    </div>
                                    <ul className={styles.oneOffRows}>
                                        {m.rows.map(row =>
                                            row.kind === "charge" ? (
                                                <li key={`c-${row.expense.id}-${row.date}`} className={styles.oneOffRow}>
                                                    <button type="button" className={styles.oneOffOpen} onClick={() => onOpen(row.expense)}>
                                                        <ExpenseIcon category={row.expense.category} />
                                                        <span className={styles.nameCell}>
                                                            <Text as="span" variant="body-sm" className={styles.ellipsis}>
                                                                {row.expense.name}
                                                            </Text>
                                                            <KindTag kind={expenseKind(row.expense)} />
                                                        </span>
                                                        <Text as="span" variant="caption" colorVariant="muted" className={styles.oneOffMeta}>
                                                            {formatShortDateIt(row.date)}
                                                            {accountLabel?.(row.expense)
                                                                ? ` · ${accountLabel(row.expense)}`
                                                                : row.expense.paid_by
                                                                  ? ` · ${row.expense.paid_by}`
                                                                  : ""}
                                                        </Text>
                                                        <Text as="span" variant="body-sm" weight={600} className={styles.figureValue}>
                                                            {formatEuroCents(row.amountCents)}
                                                        </Text>
                                                    </button>
                                                    {actions(row.expense)}
                                                </li>
                                            ) : (
                                                <li key={`m-${row.settlement.id}`} className={styles.oneOffRow}>
                                                    <div className={`${styles.oneOffOpen} ${styles.oneOffStill}`}>
                                                        <ExpenseIcon move />
                                                        <span className={styles.nameCell}>
                                                            <Text as="span" variant="body-sm" className={styles.ellipsis}>
                                                                {settlementText(row.settlement)}
                                                            </Text>
                                                            <KindTag kind="move" />
                                                        </span>
                                                        <Text as="span" variant="caption" colorVariant="muted" className={styles.oneOffMeta}>
                                                            {formatShortDateIt(row.date)}
                                                            {row.settlement.note ? ` · ${row.settlement.note}` : ""}
                                                        </Text>
                                                        <Text as="span" variant="body-sm" weight={600} className={styles.figureValue}>
                                                            {formatEuroCents(row.amountCents)}
                                                        </Text>
                                                    </div>
                                                    <TableRowActions
                                                        ariaLabel={`Azioni: ${settlementText(row.settlement)}, ${formatEuroCents(row.amountCents)}`}
                                                        actions={[rowAction.remove(() => onDeleteMove(row.settlement))]}
                                                    />
                                                </li>
                                            )
                                        )}
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
                            <MonthsByCategory months={months} />
                        </div>
                    </TileState>
                </Tabs.Panel>
            </Tabs>
        </section>
    );
}
