import { useCallback, useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ChipGroupSingle, type ChipOption } from "@/components/ui/Chip/ChipGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { deleteCrmExpense, listCrmExpenseCharges, listCrmExpenseNextCharges, listCrmExpenses } from "@/services/supabase/crmExpenses";
import { CRM_BILLING_INTERVAL_LABEL, CRM_EXPENSE_CATEGORY_LABEL, daysBetween, formatDaysLeft, formatEuroCents } from "@shared/crmExpenses";
import {
    formatMonthIt,
    formatShortDateIt,
    recurringMonthlyCents,
    romeTodayIso,
    summarizeCharges,
    upcomingRenewals
} from "@/utils/crm/expenses";
import type { CrmExpense } from "@/types/crm";
import { TileState } from "@/pages/Admin/Crm/components/TileState";
import { useCrmLoad } from "@/pages/Admin/Crm/hooks/useCrmLoad";
import { ExpenseDrawer } from "./ExpenseDrawer";
import styles from "./Costs.module.scss";

/**
 * Sezione costi del CRM, prima versione a mano (decisione di Alex del
 * 2026-10-02): spese una tantum e abbonamenti, totale del mese e da inizio,
 * mese per mese, prossimi rinnovi. Il promemoria su Telegram lo manda
 * crm-notify alle 9 (mig 20261003120300). Qonto, Stripe e Meta in Fase 3.
 */

type KindFilter = "all" | "subscription" | "one_off";

function describeWhen(expense: CrmExpense, nextChargeOn: string | undefined): string {
    if (expense.kind === "one_off") return expense.paid_on ? formatShortDateIt(expense.paid_on) : "—";
    if (expense.cancelled_on) return `Disdetto il ${formatShortDateIt(expense.cancelled_on)}`;
    if (nextChargeOn) return `Rinnovo il ${formatShortDateIt(nextChargeOn)}`;
    return "Concluso";
}

function describeAmount(expense: CrmExpense): string {
    const amount = formatEuroCents(expense.amount_cents);
    if (expense.kind === "one_off" || !expense.billing_interval) return `${amount} una tantum`;
    return `${amount} ${CRM_BILLING_INTERVAL_LABEL[expense.billing_interval]}`;
}

export default function CostsPage() {
    usePageTitle("Costi");
    const { showToast } = useToast();
    const [tick, setTick] = useState(0);
    const isPhone = useMediaQuery("(max-width: 767px)");
    const figureVariant = isPhone ? "title-sm" : "title-lg";
    const [filter, setFilter] = useState<KindFilter>("all");
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selected, setSelected] = useState<CrmExpense | null>(null);
    const [toDelete, setToDelete] = useState<CrmExpense | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Tre letture che stanno da sole: se una manca si spegne solo il suo pezzo.
    const today = useMemo(() => romeTodayIso(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
    const expensesLoad = useCrmLoad(listCrmExpenses, tick);
    const chargesLoad = useCrmLoad(() => listCrmExpenseCharges(today), tick);
    const nextLoad = useCrmLoad(() => listCrmExpenseNextCharges(today), tick);
    const reload = useCallback(() => setTick(t => t + 1), []);
    const load = useCallback(async () => reload(), [reload]);

    const expenses = useMemo(() => expensesLoad.data ?? [], [expensesLoad.data]);
    const charges = useMemo(() => chargesLoad.data ?? [], [chargesLoad.data]);
    const nextCharges = useMemo(() => nextLoad.data ?? new Map<string, string>(), [nextLoad.data]);
    const isLoading = expensesLoad.loading && !expensesLoad.data;
    const figuresLoading = isLoading || (chargesLoad.loading && !chargesLoad.data) || (nextLoad.loading && !nextLoad.data);
    const figuresError = expensesLoad.error ?? chargesLoad.error ?? nextLoad.error;

    const summary = useMemo(() => summarizeCharges(charges, expenses, today), [charges, expenses, today]);
    const monthlyRecurring = useMemo(() => recurringMonthlyCents(expenses, nextCharges), [expenses, nextCharges]);
    const renewals = useMemo(() => upcomingRenewals(expenses, nextCharges), [expenses, nextCharges]);

    const openCreate = useCallback(() => {
        setSelected(null);
        setIsDrawerOpen(true);
    }, []);

    const openEdit = useCallback((expense: CrmExpense) => {
        setSelected(expense);
        setIsDrawerOpen(true);
    }, []);

    const handleSaved = useCallback(
        async (mode: "create" | "edit") => {
            await load();
            setIsDrawerOpen(false);
            showToast({ message: mode === "create" ? "Spesa aggiunta." : "Spesa salvata.", type: "success" });
        },
        [load, showToast]
    );

    const handleDelete = useCallback(async () => {
        if (!toDelete) return false;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await deleteCrmExpense(toDelete.id);
            await load();
            setToDelete(null);
            showToast({ message: "Spesa eliminata.", type: "success" });
        } catch {
            // L'errore lo dice il dialogo, che resta aperto.
            setDeleteError("Non è stato possibile eliminarla. Riprova.");
            return false;
        } finally {
            setIsDeleting(false);
        }
    }, [toDelete, load, showToast]);

    const counts = useMemo(
        () => ({
            all: expenses.length,
            subscription: expenses.filter(e => e.kind === "subscription").length,
            one_off: expenses.filter(e => e.kind === "one_off").length
        }),
        [expenses]
    );

    const filterOptions = useMemo<ChipOption<KindFilter>[]>(
        () => [
            { value: "all", label: "Tutte", count: counts.all },
            { value: "subscription", label: "Abbonamenti", count: counts.subscription, disabled: counts.subscription === 0 },
            { value: "one_off", label: "Una tantum", count: counts.one_off, disabled: counts.one_off === 0 }
        ],
        [counts]
    );

    const visible = useMemo(() => (filter === "all" ? expenses : expenses.filter(e => e.kind === filter)), [expenses, filter]);

    const columns = useMemo<ColumnDefinition<CrmExpense>[]>(
        () => [
            {
                id: "name",
                header: "Spesa",
                cell: (_v, row) => (
                    <div className={`${DATA_TABLE_CLASSES.cellTwoLine} ${DATA_TABLE_CLASSES.cellTwoLineWrap}`}>
                        <span>{row.name}</span>
                        <span>{CRM_EXPENSE_CATEGORY_LABEL[row.category]}</span>
                    </div>
                )
            },
            {
                id: "amount",
                header: "Importo",
                cell: (_v, row) => (
                    <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                        <span>{describeAmount(row)}</span>
                        <span>{describeWhen(row, nextCharges.get(row.id))}</span>
                    </div>
                )
            },
            {
                id: "paidBy",
                header: "Pagata da",
                hideOnPhone: true,
                cell: (_v, row) => row.paid_by ?? "—"
            },
            {
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_v, row) => (
                    <TableRowActions
                        actions={[
                            { label: "Modifica", onClick: () => openEdit(row) },
                            {
                                label: "Elimina",
                                variant: "destructive",
                                separator: true,
                                onClick: () => {
                                    setDeleteError(null);
                                    setToDelete(row);
                                }
                            }
                        ]}
                    />
                )
            }
        ],
        [nextCharges, openEdit]
    );

    const monthRows = summary.months;

    const subtitle = "Spese inserite a mano, IVA inclusa.";

    // MEMOIZZATO: usePageHeader confronta `actions` per reference.
    const headerActions = useMemo(
        () => (
            <div className={styles.headerActions}>
                <Button variant="primary" onClick={openCreate}>
                    Aggiungi spesa
                </Button>
            </div>
        ),
        [openCreate]
    );

    const headerCompact = useMemo<PageHeaderCompactConfig>(
        () => ({ primaryAction: { label: "Aggiungi spesa", onClick: openCreate } }),
        [openCreate]
    );

    usePageHeader({ title: "Costi", subtitle, actions: headerActions, compact: headerCompact });

    const activeCount = renewals.length;

    const monthName = formatMonthIt(today.slice(0, 7)).split(" ")[0];

    return (
        <div className={styles.page}>
            <section className={styles.figures} aria-label="Totali">
                <TileState loading={figuresLoading} error={figuresError} onRetry={reload}>
                    <div className={styles.figure}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            {isPhone ? monthName.charAt(0).toUpperCase() + monthName.slice(1) : `Speso a ${monthName}`}
                        </Text>
                        <Text as="span" variant={figureVariant} weight={700} className={styles.figureValue}>
                            {formatEuroCents(summary.thisMonthCents)}
                        </Text>
                    </div>
                    <div className={styles.figure}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            Da inizio
                        </Text>
                        <Text as="span" variant={figureVariant} weight={700} className={styles.figureValue}>
                            {formatEuroCents(summary.sinceStartCents)}
                        </Text>
                    </div>
                    <div className={styles.figure}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            {isPhone ? "Al mese" : activeCount === 1 ? "1 abbonamento, al mese" : `${activeCount} abbonamenti, al mese`}
                        </Text>
                        <Text as="span" variant={figureVariant} weight={700} className={styles.figureValue}>
                            {formatEuroCents(monthlyRecurring)}
                        </Text>
                    </div>
                </TileState>
            </section>

            <div className={styles.bottom}>
                <Card title="Prossimi rinnovi" flush>
                    <TileState
                        loading={figuresLoading}
                        error={figuresError}
                        onRetry={reload}
                        empty={renewals.length === 0}
                        emptyText="Nessun abbonamento attivo."
                    >
                        {renewals.map(({ expense, nextChargeOn }) => {
                            const daysLeft = daysBetween(today, nextChargeOn);
                            const soon = expense.remind_days_before != null && daysLeft <= expense.remind_days_before;
                            return (
                                <ListRow
                                    key={expense.id}
                                    title={expense.name}
                                    subtitle={[describeAmount(expense), expense.paid_by].filter(Boolean).join(" · ")}
                                    onClick={() => openEdit(expense)}
                                    trailing={
                                        soon ? (
                                            <StatusBadge variant="warning" label={formatDaysLeft(daysLeft)} />
                                        ) : (
                                            formatShortDateIt(nextChargeOn)
                                        )
                                    }
                                />
                            );
                        })}
                    </TileState>
                </Card>

                <Card title="Mese per mese" flush>
                    <TileState
                        loading={figuresLoading}
                        error={figuresError}
                        onRetry={reload}
                        empty={monthRows.length === 0}
                        emptyText="I mesi compaiono con la prima spesa."
                    >
                        {monthRows.map(m => (
                            <ListRow
                                key={m.month}
                                title={formatMonthIt(m.month)}
                                subtitle={`Abbonamenti ${formatEuroCents(m.subscriptionCents)} · una tantum ${formatEuroCents(m.oneOffCents)}`}
                                trailing={
                                    <Text as="span" variant="body-sm" weight={700} className={styles.figureValue}>
                                        {formatEuroCents(m.totalCents)}
                                    </Text>
                                }
                            />
                        ))}
                    </TileState>
                </Card>
            </div>

            <Card title="Tutte le spese">
                <TileState loading={false} error={expensesLoad.error} onRetry={reload}>
                    <div className={styles.listBody}>
                        <ChipGroupSingle
                            options={filterOptions}
                            value={filter}
                            onChange={setFilter}
                            ariaLabel="Filtra per tipo"
                            layout="auto"
                        />
                        <DataTable
                            data={visible}
                            columns={columns}
                            isLoading={isLoading}
                            onRowClick={row => openEdit(row)}
                            ariaLabel="Spese"
                            pageSize={20}
                            isFiltered={filter !== "all"}
                            onClearFilters={() => setFilter("all")}
                            emptyState={{
                                title: "Ancora nessuna spesa",
                                description:
                                    "Aggiungi gli abbonamenti con la data del rinnovo e le spese una tantum: i totali si fanno da soli.",
                                icon: <Wallet size={32} strokeWidth={1.5} />,
                                action: (
                                    <Button variant="primary" size="sm" onClick={openCreate}>
                                        Aggiungi spesa
                                    </Button>
                                )
                            }}
                        />
                    </div>
                </TileState>
            </Card>

            <ExpenseDrawer open={isDrawerOpen} expense={selected} onClose={() => setIsDrawerOpen(false)} onSaved={handleSaved} />

            <ConfirmDialog
                isOpen={toDelete != null}
                onClose={() => setToDelete(null)}
                onConfirm={handleDelete}
                title="Eliminare la spesa?"
                message={
                    toDelete
                        ? `«${toDelete.name}» esce dai totali, anche dai mesi passati. Per un abbonamento finito usa piuttosto «Disdetto»: i mesi pagati restano.`
                        : undefined
                }
                confirmLabel="Elimina"
                confirmVariant="danger"
                isLoading={isDeleting}
                error={deleteError}
            />
        </div>
    );
}
