import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ChipGroupSingle, type ChipOption } from "@/components/ui/Chip/ChipGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import {
    DataTable,
    DATA_TABLE_CLASSES,
    type ColumnDefinition
} from "@/components/ui/DataTable/DataTable";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatCard } from "@/components/ui/StatCard/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
    deleteCrmExpense,
    listCrmExpenseCharges,
    listCrmExpenseNextCharges,
    listCrmExpenses
} from "@/services/supabase/crmExpenses";
import {
    CRM_BILLING_INTERVAL_LABEL,
    CRM_EXPENSE_CATEGORY_LABEL,
    daysBetween,
    formatDaysLeft,
    formatEuroCents
} from "@shared/crmExpenses";
import {
    formatMonthIt,
    formatShortDateIt,
    recurringMonthlyCents,
    romeTodayIso,
    summarizeCharges,
    upcomingRenewals,
    type CrmExpenseMonth
} from "@/utils/crm/expenses";
import type { CrmExpense, CrmExpenseCharge } from "@/types/crm";
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
    const [expenses, setExpenses] = useState<CrmExpense[]>([]);
    const [charges, setCharges] = useState<CrmExpenseCharge[]>([]);
    const [nextCharges, setNextCharges] = useState<Map<string, string>>(new Map());
    const [today, setToday] = useState(() => romeTodayIso());
    const [isLoading, setIsLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [filter, setFilter] = useState<KindFilter>("all");
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selected, setSelected] = useState<CrmExpense | null>(null);
    const [toDelete, setToDelete] = useState<CrmExpense | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setPageError(null);
        const day = romeTodayIso();
        try {
            const [rows, chargeRows, next] = await Promise.all([
                listCrmExpenses(),
                listCrmExpenseCharges(day),
                listCrmExpenseNextCharges(day)
            ]);
            setExpenses(rows);
            setCharges(chargeRows);
            setNextCharges(next);
            setToday(day);
        } catch (err) {
            setPageError(
                `Non è stato possibile caricare i costi: ${err instanceof Error ? err.message : String(err)}`
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

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

    const visible = useMemo(
        () => (filter === "all" ? expenses : expenses.filter(e => e.kind === filter)),
        [expenses, filter]
    );

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

    const monthColumns = useMemo<ColumnDefinition<CrmExpenseMonth>[]>(
        () => [
            { id: "month", header: "Mese", cell: (_v, row) => formatMonthIt(row.month) },
            {
                id: "subscriptions",
                header: "Abbonamenti",
                align: "right",
                hideOnPhone: true,
                cell: (_v, row) => formatEuroCents(row.subscriptionCents)
            },
            {
                id: "oneOff",
                header: "Una tantum",
                align: "right",
                hideOnPhone: true,
                cell: (_v, row) => formatEuroCents(row.oneOffCents)
            },
            {
                id: "total",
                header: "Totale",
                align: "right",
                cell: (_v, row) => formatEuroCents(row.totalCents)
            }
        ],
        []
    );

    const monthRows = useMemo(() => summary.months.map(m => ({ ...m, id: m.month })), [summary.months]);

    const subtitle = "Spese inserite a mano, IVA inclusa. Qonto, Stripe e Meta si collegano più avanti.";

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

    return (
        <div className={styles.page}>
            {pageError && (
                <InlineBanner
                    variant="error"
                    action={
                        <Button variant="secondary" size="sm" onClick={() => void load()}>
                            Riprova
                        </Button>
                    }
                >
                    {pageError}
                </InlineBanner>
            )}

            <div className={styles.statGrid}>
                <StatCard
                    label={`Speso a ${formatMonthIt(today.slice(0, 7)).split(" ")[0]}`}
                    value={formatEuroCents(summary.thisMonthCents)}
                    variant="plain"
                    loading={isLoading}
                />
                <StatCard
                    label="Speso da inizio"
                    value={formatEuroCents(summary.sinceStartCents)}
                    variant="plain"
                    loading={isLoading}
                />
                <StatCard
                    label={
                        activeCount === 1
                            ? "1 abbonamento attivo, al mese"
                            : `${activeCount} abbonamenti attivi, al mese`
                    }
                    value={formatEuroCents(monthlyRecurring)}
                    variant="plain"
                    loading={isLoading}
                />
            </div>

            {renewals.length > 0 && (
                <Card title="Prossimi rinnovi" flush>
                    {renewals.map(({ expense, nextChargeOn }) => {
                        const daysLeft = daysBetween(today, nextChargeOn);
                        const soon =
                            expense.remind_days_before != null && daysLeft <= expense.remind_days_before;
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
                </Card>
            )}

            {monthRows.length > 0 && (
                <Card title="Mese per mese">
                    <DataTable
                        data={monthRows}
                        columns={monthColumns}
                        ariaLabel="Spese mese per mese"
                        pageSize={12}
                    />
                </Card>
            )}

            <Card title="Tutte le spese">
                <ChipGroupSingle
                    options={filterOptions}
                    value={filter}
                    onChange={setFilter}
                    ariaLabel="Filtra per tipo"
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
            </Card>

            <ExpenseDrawer
                open={isDrawerOpen}
                expense={selected}
                onClose={() => setIsDrawerOpen(false)}
                onSaved={handleSaved}
            />

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
