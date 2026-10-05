import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, List } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useAuth } from "@/context/useAuth";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listCrmTeamMembers } from "@/services/supabase/crm";
import {
    createCrmExpenseSettlements,
    deleteCrmExpense,
    deleteCrmExpenseSettlement,
    listCrmExpenseCharges,
    listCrmExpenseNextCharges,
    listCrmExpenses,
    listCrmExpenseSettlements
} from "@/services/supabase/crmExpenses";
import { CRM_BILLING_INTERVAL_LABEL, daysBetween, formatDaysLeft, formatEuroCents } from "@shared/crmExpenses";
import { computeExpenseBalance, isJointAccount, payerSuggestions, transfersToSettlements } from "@/utils/crm/expenseBalance";
import { lastDayOfMonth, shiftDay, shiftMonth } from "@/utils/crm/expenseCalendar";
import {
    formatMonthIt,
    formatShortDateIt,
    recurringMonthlyCents,
    romeTodayIso,
    summarizeCharges,
    upcomingRenewals,
    type CrmExpenseDraft
} from "@/utils/crm/expenses";
import { isMissingOnDatabase } from "@/utils/crm/stages";
import type { CrmExpense, CrmExpenseSettlement } from "@/types/crm";
import { TileState } from "@/pages/Admin/Crm/components/TileState";
import { useCrmLoad } from "@/pages/Admin/Crm/hooks/useCrmLoad";
import { CostsCalendar } from "./components/CostsCalendar";
import { ExpenseTabs } from "./components/ExpenseTabs";
import { PayersCard } from "./components/PayersCard";
import { QuickExpenseRow } from "./components/QuickExpenseRow";
import { ExpenseDrawer } from "./ExpenseDrawer";
import { SettlementDrawer } from "./SettlementDrawer";
import styles from "./Costs.module.scss";

/**
 * Sezione costi del CRM (rifatta il 2026-10-05 dalle scelte di Alex sul
 * canvas: K2 come base, il calendario K5 accanto, chi ha pagato cosa). Spese a
 * mano, una tantum e abbonamenti; il promemoria dei rinnovi su Telegram lo
 * manda crm-notify alle 9. Qonto, Stripe e Meta in Fase 3.
 */

type CostsView = "list" | "calendar";

/** Quanti giorni guarda «In arrivo». */
const UPCOMING_DAYS = 30;

const VIEW_OPTIONS = [
    { value: "list" as const, label: "Elenco", icon: <List size={16} aria-hidden="true" /> },
    { value: "calendar" as const, label: "Calendario", icon: <CalendarDays size={16} aria-hidden="true" /> }
];

function signedDelta(cents: number, previousMonth: string): string {
    if (cents === 0) return `come ${previousMonth}`;
    return `${cents > 0 ? "+" : "−"}${formatEuroCents(Math.abs(cents))} su ${previousMonth}`;
}

export default function CostsPage() {
    usePageTitle("Costi");
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const view: CostsView = searchParams.get("vista") === "calendario" ? "calendar" : "list";
    const [tick, setTick] = useState(0);
    const isPhone = useMediaQuery("(max-width: 767px)");
    const figureVariant = isPhone ? "title-sm" : "title-lg";
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selected, setSelected] = useState<CrmExpense | null>(null);
    const [drawerDraft, setDrawerDraft] = useState<CrmExpenseDraft | null>(null);
    const quickNameRef = useRef<HTMLInputElement>(null);
    const { user } = useAuth();
    const [toDelete, setToDelete] = useState<CrmExpense | null>(null);
    const [moveToDelete, setMoveToDelete] = useState<CrmExpenseSettlement | null>(null);
    const [isSettleOpen, setIsSettleOpen] = useState(false);
    const [isMoveOpen, setIsMoveOpen] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [dialogError, setDialogError] = useState<string | null>(null);

    const today = useMemo(() => romeTodayIso(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
    const [calMonth, setCalMonth] = useState(() => today.slice(0, 7));
    const [calDay, setCalDay] = useState(today);

    // Gli addebiti arrivano fino alla fine del mese prossimo: servono al
    // calendario e a «In arrivo» (oggi + 30 giorni, se va oltre).
    const until = useMemo(() => {
        const endNext = lastDayOfMonth(shiftMonth(today.slice(0, 7), 1));
        const in30 = shiftDay(today, UPCOMING_DAYS);
        return in30 > endNext ? in30 : endNext;
    }, [today]);

    // Letture che stanno da sole: se una manca si spegne solo il suo pezzo.
    const expensesLoad = useCrmLoad(listCrmExpenses, tick);
    const chargesLoad = useCrmLoad(() => listCrmExpenseCharges(until), tick);
    const nextLoad = useCrmLoad(() => listCrmExpenseNextCharges(today), tick);
    const teamLoad = useCrmLoad(listCrmTeamMembers, tick);
    const settlementsLoad = useCrmLoad(
        () =>
            listCrmExpenseSettlements().catch((err: unknown) => {
                // Tabella non ancora sul database: il conto vale lo stesso.
                if (isMissingOnDatabase(err)) return null;
                throw err;
            }),
        tick
    );
    const reload = useCallback(() => setTick(t => t + 1), []);

    const expenses = useMemo(() => expensesLoad.data ?? [], [expensesLoad.data]);
    const allCharges = useMemo(() => chargesLoad.data ?? [], [chargesLoad.data]);
    const nextCharges = useMemo(() => nextLoad.data ?? new Map<string, string>(), [nextLoad.data]);
    const team = useMemo(() => (teamLoad.data ?? []).map(m => m.display_name), [teamLoad.data]);
    const settlementsMissing = settlementsLoad.data === null && !settlementsLoad.loading && !settlementsLoad.error;
    const settlements = useMemo(() => settlementsLoad.data ?? [], [settlementsLoad.data]);

    const isLoading = expensesLoad.loading && !expensesLoad.data;
    const figuresLoading = isLoading || (chargesLoad.loading && !chargesLoad.data) || (nextLoad.loading && !nextLoad.data);
    const figuresError = expensesLoad.error ?? chargesLoad.error ?? nextLoad.error;

    const summary = useMemo(() => summarizeCharges(allCharges, expenses, today), [allCharges, expenses, today]);
    const monthlyRecurring = useMemo(() => recurringMonthlyCents(expenses, nextCharges), [expenses, nextCharges]);
    const activeCount = useMemo(() => upcomingRenewals(expenses, nextCharges).length, [expenses, nextCharges]);
    const upcoming = useMemo(() => {
        const last = shiftDay(today, UPCOMING_DAYS);
        return allCharges.filter(c => c.chargedOn >= today && c.chargedOn <= last).sort((a, b) => (a.chargedOn < b.chargedOn ? -1 : 1));
    }, [allCharges, today]);
    const upcomingTotal = upcoming.reduce((sum, c) => sum + c.amountCents, 0);
    const byId = useMemo(() => new Map(expenses.map(e => [e.id, e])), [expenses]);

    const balance = useMemo(
        () => computeExpenseBalance({ charges: allCharges, expenses, settlements, team, today }),
        [allCharges, expenses, settlements, team, today]
    );
    const payers = useMemo(() => payerSuggestions(team), [team]);
    const myName = useMemo(
        () => (teamLoad.data ?? []).find(m => m.user_id === user?.id)?.display_name ?? "",
        [teamLoad.data, user?.id]
    );
    const people = useMemo(() => balance.people.map(p => p.name), [balance.people]);

    const currentMonth = today.slice(0, 7);
    const firstMonth = summary.months.at(-1)?.month ?? currentMonth;

    const setView = useCallback(
        (next: CostsView) => {
            setSearchParams(
                prev => {
                    const params = new URLSearchParams(prev);
                    if (next === "calendar") params.set("vista", "calendario");
                    else params.delete("vista");
                    return params;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    // «Aggiungi spesa»: nell'elenco porta alla riga veloce, nel calendario
    // (dove la riga non c'è) apre il drawer.
    const openCreate = useCallback(() => {
        if (view === "list" && quickNameRef.current) {
            quickNameRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
            quickNameRef.current.focus({ preventScroll: true });
            return;
        }
        setSelected(null);
        setDrawerDraft(null);
        setIsDrawerOpen(true);
    }, [view]);

    const openDetails = useCallback((draft: CrmExpenseDraft) => {
        setSelected(null);
        setDrawerDraft(draft);
        setIsDrawerOpen(true);
    }, []);

    const openEdit = useCallback((expense: CrmExpense) => {
        setSelected(expense);
        setDrawerDraft(null);
        setIsDrawerOpen(true);
    }, []);

    const handleQuickAdded = useCallback(
        (summary: string, expense: CrmExpense) => {
            reload();
            showToast({
                message: `Aggiunta: ${summary}.`,
                type: "success",
                actionLabel: "Dettagli",
                onAction: () => openEdit(expense)
            });
        },
        [reload, showToast, openEdit]
    );

    const askDelete = useCallback((expense: CrmExpense) => {
        setDialogError(null);
        setToDelete(expense);
    }, []);

    const handleSaved = useCallback(
        async (mode: "create" | "edit") => {
            reload();
            setIsDrawerOpen(false);
            showToast({ message: mode === "create" ? "Spesa aggiunta." : "Spesa salvata.", type: "success" });
        },
        [reload, showToast]
    );

    const handleMoveSaved = useCallback(async () => {
        reload();
        setIsMoveOpen(false);
        showToast({ message: "Movimento registrato.", type: "success" });
    }, [reload, showToast]);

    /** Le tre conferme della pagina: stessa forma, cambia solo cosa fanno. */
    const confirm = useCallback(
        async (work: () => Promise<void>, done: string, close: () => void) => {
            setIsBusy(true);
            setDialogError(null);
            try {
                await work();
                reload();
                close();
                showToast({ message: done, type: "success" });
            } catch {
                // L'errore lo dice il dialogo, che resta aperto.
                setDialogError("Non è andata a buon fine. Riprova.");
                return false;
            } finally {
                setIsBusy(false);
            }
        },
        [reload, showToast]
    );

    // MEMOIZZATO: usePageHeader confronta `actions` per reference.
    const headerActions = useMemo(
        () => (
            <div className={styles.headerActions}>
                <SegmentedControl value={view} onChange={setView} options={VIEW_OPTIONS} size="sm" />
                <Button variant="primary" onClick={openCreate}>
                    Aggiungi spesa
                </Button>
            </div>
        ),
        [view, setView, openCreate]
    );

    const headerCompact = useMemo<PageHeaderCompactConfig>(
        () => ({ primaryAction: { label: "Aggiungi spesa", onClick: openCreate } }),
        [openCreate]
    );

    usePageHeader({ title: "Costi", subtitle: "Spese inserite a mano, IVA inclusa.", actions: headerActions, compact: headerCompact });

    const monthName = formatMonthIt(currentMonth).split(" ")[0];
    const previousName = formatMonthIt(shiftMonth(currentMonth, -1)).split(" ")[0];
    const delta = summary.thisMonthCents - (summary.months[1]?.totalCents ?? 0);

    return (
        <div className={styles.page}>
            <section className={styles.figures} aria-label="Totali">
                <TileState loading={figuresLoading} error={figuresError} onRetry={reload}>
                    <div className={styles.figure}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            Speso a {monthName}
                        </Text>
                        <Text as="span" variant={figureVariant} weight={700} className={styles.figureValue}>
                            {formatEuroCents(summary.thisMonthCents)}
                        </Text>
                        {summary.months.length > 1 && (
                            <Text as="span" variant="caption" colorVariant="muted">
                                {signedDelta(delta, previousName)}
                            </Text>
                        )}
                    </div>
                    <div className={styles.figure}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            Abbonamenti, al mese
                        </Text>
                        <Text as="span" variant={figureVariant} weight={700} className={styles.figureValue}>
                            {formatEuroCents(monthlyRecurring)}
                        </Text>
                        <Text as="span" variant="caption" colorVariant="muted">
                            {activeCount === 1 ? "1 attivo" : `${activeCount} attivi`}
                        </Text>
                    </div>
                    <div className={styles.figure}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            Da inizio
                        </Text>
                        <Text as="span" variant={figureVariant} weight={700} className={styles.figureValue}>
                            {formatEuroCents(summary.sinceStartCents)}
                        </Text>
                        {summary.months.length > 0 && (
                            <Text as="span" variant="caption" colorVariant="muted">
                                da {formatMonthIt(firstMonth)}
                            </Text>
                        )}
                    </div>
                </TileState>
            </section>

            {view === "calendar" ? (
                <CostsCalendar
                    month={calMonth}
                    minMonth={firstMonth < currentMonth ? firstMonth : shiftMonth(currentMonth, -1)}
                    maxMonth={shiftMonth(currentMonth, 1)}
                    selectedDay={calDay}
                    today={today}
                    charges={allCharges}
                    expenses={expenses}
                    isPhone={isPhone}
                    loading={figuresLoading}
                    error={figuresError}
                    onRetry={reload}
                    onMonth={m => {
                        setCalMonth(m);
                        setCalDay(m === currentMonth ? today : `${m}-01`);
                    }}
                    onDay={setCalDay}
                    onOpen={openEdit}
                />
            ) : (
                <>
                    <QuickExpenseRow
                        ref={quickNameRef}
                        expenses={expenses}
                        today={today}
                        defaultPayer={myName}
                        onAdded={handleQuickAdded}
                        onDetails={openDetails}
                    />

                    <div className={styles.duo}>
                        <PayersCard
                            balance={balance}
                            loading={figuresLoading || (teamLoad.loading && !teamLoad.data)}
                            error={figuresError ?? settlementsLoad.error}
                            settlements={settlements}
                            settlementsMissing={settlementsMissing}
                            onRetry={reload}
                            onSettle={() => {
                                setDialogError(null);
                                setIsSettleOpen(true);
                            }}
                            onRecord={() => setIsMoveOpen(true)}
                            onDeleteMove={move => {
                                setDialogError(null);
                                setMoveToDelete(move);
                            }}
                        />

                        <Card
                            title={`In arrivo, ${UPCOMING_DAYS} giorni`}
                            subtitle={upcoming.length > 0 ? `${formatEuroCents(upcomingTotal)} in tutto.` : undefined}
                            flush
                        >
                            <TileState
                                loading={figuresLoading}
                                error={figuresError}
                                onRetry={reload}
                                empty={upcoming.length === 0}
                                emptyText="Nessun addebito nei prossimi 30 giorni."
                            >
                                {upcoming.map((c, i) => {
                                    const expense = byId.get(c.expenseId);
                                    const daysLeft = daysBetween(today, c.chargedOn);
                                    const soon = expense?.remind_days_before != null && daysLeft <= expense.remind_days_before;
                                    const interval = expense?.billing_interval;
                                    return (
                                        <ListRow
                                            key={`${c.expenseId}-${c.chargedOn}-${i}`}
                                            title={expense?.name ?? "Spesa"}
                                            subtitle={[
                                                `${formatEuroCents(c.amountCents)}${interval ? ` ${CRM_BILLING_INTERVAL_LABEL[interval]}` : ""}`,
                                                expense?.paid_by &&
                                                    (isJointAccount(expense.paid_by) ? "dal conto comune" : `paga ${expense.paid_by}`)
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                            onClick={expense ? () => openEdit(expense) : undefined}
                                            trailing={
                                                soon ? (
                                                    <StatusBadge variant="warning" label={formatDaysLeft(daysLeft)} />
                                                ) : (
                                                    formatShortDateIt(c.chargedOn)
                                                )
                                            }
                                        />
                                    );
                                })}
                            </TileState>
                        </Card>
                    </div>

                    <ExpenseTabs
                        expenses={expenses}
                        nextCharges={nextCharges}
                        months={summary.months}
                        today={today}
                        loading={figuresLoading}
                        error={figuresError}
                        onRetry={reload}
                        onOpen={openEdit}
                        onDelete={askDelete}
                        onCreate={openCreate}
                    />
                </>
            )}

            <ExpenseDrawer
                open={isDrawerOpen}
                expense={selected}
                initialDraft={drawerDraft}
                payers={payers}
                onClose={() => setIsDrawerOpen(false)}
                onSaved={handleSaved}
            />
            <SettlementDrawer open={isMoveOpen} people={people} onClose={() => setIsMoveOpen(false)} onSaved={handleMoveSaved} />

            <ConfirmDialog
                isOpen={toDelete != null}
                onClose={() => setToDelete(null)}
                onConfirm={() =>
                    toDelete
                        ? confirm(
                              () => deleteCrmExpense(toDelete.id),
                              "Spesa eliminata.",
                              () => setToDelete(null)
                          )
                        : false
                }
                title="Eliminare la spesa?"
                message={
                    toDelete
                        ? `«${toDelete.name}» esce dai totali e dal conto tra voi, anche dai mesi passati. Per un abbonamento finito usa piuttosto «Disdetto»: i mesi pagati restano.`
                        : undefined
                }
                confirmLabel="Elimina"
                confirmVariant="danger"
                isLoading={isBusy}
                error={dialogError}
            />

            <ConfirmDialog
                isOpen={isSettleOpen}
                onClose={() => setIsSettleOpen(false)}
                onConfirm={() =>
                    confirm(
                        () => createCrmExpenseSettlements(transfersToSettlements(balance.transfers, today)),
                        "Conto pareggiato.",
                        () => setIsSettleOpen(false)
                    )
                }
                title="Segnare il conto come pareggiato?"
                message={`Si registra ${balance.transfers
                    .map(t => `${t.from} → ${t.to}, ${formatEuroCents(t.amountCents)}`)
                    .join("; ")}, con la data di oggi. Fallo dopo che i soldi sono passati davvero.`}
                confirmLabel="Segna come pareggiato"
                isLoading={isBusy}
                error={dialogError}
            />

            <ConfirmDialog
                isOpen={moveToDelete != null}
                onClose={() => setMoveToDelete(null)}
                onConfirm={() =>
                    moveToDelete
                        ? confirm(
                              () => deleteCrmExpenseSettlement(moveToDelete.id),
                              "Movimento tolto.",
                              () => setMoveToDelete(null)
                          )
                        : false
                }
                title="Togliere il movimento?"
                message={
                    moveToDelete
                        ? `${moveToDelete.from_name} → ${moveToDelete.to_name}, ${formatEuroCents(moveToDelete.amount_cents)} del ${formatShortDateIt(moveToDelete.settled_on)}: il conto tra voi torna come prima.`
                        : undefined
                }
                confirmLabel="Togli"
                confirmVariant="danger"
                isLoading={isBusy}
                error={dialogError}
            />
        </div>
    );
}
