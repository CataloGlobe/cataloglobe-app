import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, List } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
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
    listCrmExpenseAccounts,
    listCrmExpenseCharges,
    listCrmExpenseNextCharges,
    listCrmExpenseRefunds,
    listCrmExpenses,
    listCrmExpenseSettlements,
    listCrmExpenseTerms
} from "@/services/supabase/crmExpenses";
import { CRM_BILLING_INTERVAL_LABEL, daysBetween, formatDaysLeft, formatEuroCents } from "@shared/crmExpenses";
import {
    computeExpenseBalance,
    evenByDeposit,
    isJointAccount,
    JOINT_ACCOUNT,
    payerSuggestions,
    transfersToSettlements,
    type SettlementDraft
} from "@/utils/crm/expenseBalance";
import { refundsAsCharges, termAt } from "@/utils/crm/expenseTerms";
import { lastDayOfMonth, shiftDay, shiftMonth } from "@/utils/crm/expenseCalendar";
import {
    buildCostsOverview,
    formatMonthIt,
    formatShortDateIt,
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
import { AccountsDrawer } from "./AccountsDrawer";
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

/** Tabella non ancora sul database: null, e la sua parte di pagina si spegne. */
function orMissing<T>(load: Promise<T>): Promise<T | null> {
    return load.catch((err: unknown) => {
        if (isMissingOnDatabase(err)) return null;
        throw err;
    });
}

function centsToInput(cents: number): string {
    return (cents / 100).toFixed(2).replace(".", ",");
}

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
    const [moveDraft, setMoveDraft] = useState<Partial<SettlementDraft> | null>(null);
    const [isAccountsOpen, setIsAccountsOpen] = useState(false);
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
    // Carte e conti, cambi e rimborsi (mig 20261016120000): prima della
    // migrazione la pagina resta com'era.
    const accountsLoad = useCrmLoad(() => orMissing(listCrmExpenseAccounts()), tick);
    const termsLoad = useCrmLoad(() => orMissing(listCrmExpenseTerms()), tick);
    const refundsLoad = useCrmLoad(() => orMissing(listCrmExpenseRefunds()), tick);
    const reload = useCallback(() => setTick(t => t + 1), []);

    const expenses = useMemo(() => expensesLoad.data ?? [], [expensesLoad.data]);
    const allCharges = useMemo(() => chargesLoad.data ?? [], [chargesLoad.data]);
    const nextCharges = useMemo(() => nextLoad.data ?? new Map<string, string>(), [nextLoad.data]);
    const team = useMemo(() => (teamLoad.data ?? []).map(m => m.display_name), [teamLoad.data]);
    const members = useMemo(() => teamLoad.data ?? [], [teamLoad.data]);
    const memberNames = useMemo(() => new Map(members.map(m => [m.user_id, m.display_name])), [members]);
    const accounts = useMemo(() => accountsLoad.data ?? [], [accountsLoad.data]);
    const terms = useMemo(() => termsLoad.data ?? [], [termsLoad.data]);
    const refunds = useMemo(() => refundsLoad.data ?? [], [refundsLoad.data]);
    const extrasReady = accountsLoad.data != null && termsLoad.data != null && refundsLoad.data != null;
    const openJoint = useMemo(() => accounts.filter(a => a.kind === "joint" && !a.closed_on), [accounts]);
    // Addebiti più rimborsi (negativi): totali, saldo e quadro. Calendario e
    // «In arrivo» restano sui soli addebiti.
    const chargesAndRefunds = useMemo(() => [...allCharges, ...refundsAsCharges(refunds)], [allCharges, refunds]);
    const settlementsMissing = settlementsLoad.data === null && !settlementsLoad.loading && !settlementsLoad.error;
    const settlements = useMemo(() => settlementsLoad.data ?? [], [settlementsLoad.data]);

    const isLoading = expensesLoad.loading && !expensesLoad.data;
    const figuresLoading = isLoading || (chargesLoad.loading && !chargesLoad.data) || (nextLoad.loading && !nextLoad.data);
    const figuresError = expensesLoad.error ?? chargesLoad.error ?? nextLoad.error;
    // Un errore sui dati nuovi spegne solo le parti nuove, non il quadro.
    const extrasError = accountsLoad.error ?? termsLoad.error ?? refundsLoad.error;

    const summary = useMemo(() => summarizeCharges(chargesAndRefunds, expenses, today), [chargesAndRefunds, expenses, today]);
    const overview = useMemo(
        () => buildCostsOverview({ expenses, charges: chargesAndRefunds, nextCharges, terms, accounts, today }),
        [expenses, chargesAndRefunds, nextCharges, terms, accounts, today]
    );
    const activeCount = useMemo(() => upcomingRenewals(expenses, nextCharges).length, [expenses, nextCharges]);
    const upcoming = useMemo(() => {
        const last = shiftDay(today, UPCOMING_DAYS);
        return allCharges.filter(c => c.chargedOn >= today && c.chargedOn <= last).sort((a, b) => (a.chargedOn < b.chargedOn ? -1 : 1));
    }, [allCharges, today]);
    const upcomingTotal = upcoming.reduce((sum, c) => sum + c.amountCents, 0);
    const byId = useMemo(() => new Map(expenses.map(e => [e.id, e])), [expenses]);
    const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
    /** Su che conto sta la spesa quel giorno (con i «Cambia da…»); null senza conto. */
    const accountNameAt = useCallback(
        (expense: CrmExpense, date: string) => {
            const id = termAt(expense, terms, date).accountId;
            return id ? (accountById.get(id)?.name ?? null) : null;
        },
        [terms, accountById]
    );

    const balance = useMemo(
        () => computeExpenseBalance({ charges: chargesAndRefunds, expenses, settlements, team, today, accounts, terms, memberNames }),
        [chargesAndRefunds, expenses, settlements, team, today, accounts, terms, memberNames]
    );
    const depositHint = useMemo(() => {
        const hint = evenByDeposit(balance);
        const target = openJoint[0];
        return hint && target ? { ...hint, accountName: target.name, accountId: target.id } : null;
    }, [balance, openJoint]);
    const payers = useMemo(() => payerSuggestions(team), [team]);
    const myName = useMemo(
        () => (teamLoad.data ?? []).find(m => m.user_id === user?.id)?.display_name ?? "",
        [teamLoad.data, user?.id]
    );
    const people = useMemo(() => balance.people.map(p => p.name), [balance.people]);
    /** Il conto personale aperto di chi è entrato, se ne ha uno solo: la riga veloce parte da lì. */
    const myAccountId = useMemo(() => {
        const mine = accounts.filter(a => a.kind === "personal" && !a.closed_on && a.owner_member_id === user?.id);
        return mine.length === 1 ? mine[0].id : "";
    }, [accounts, user?.id]);

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

    const handleExtraChanged = useCallback(
        (message: string) => {
            reload();
            showToast({ message, type: "success" });
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
                {extrasReady && (
                    <Button variant="secondary" onClick={() => setIsAccountsOpen(true)}>
                        Carte e conti
                    </Button>
                )}
                <Button variant="primary" onClick={openCreate}>
                    Aggiungi spesa
                </Button>
            </div>
        ),
        [view, setView, openCreate, extrasReady]
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
            <section className={styles.figures} aria-label="Il quadro">
                <TileState loading={figuresLoading} error={figuresError} onRetry={reload}>
                    <div className={styles.figure}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            Speso finora
                        </Text>
                        <Text as="span" variant={figureVariant} weight={700} className={styles.figureValue}>
                            {formatEuroCents(overview.spentSoFarCents)}
                        </Text>
                        <Text as="span" variant="caption" colorVariant="muted">
                            {summary.months.length > 0 ? `da ${formatMonthIt(firstMonth)}, rimborsi tolti` : "ancora niente"}
                        </Text>
                    </div>
                    <div className={styles.figure}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            Costo al mese, da ora
                        </Text>
                        <Text as="span" variant={figureVariant} weight={700} className={styles.figureValue}>
                            {formatEuroCents(overview.monthlyFromNowCents)}
                        </Text>
                        <Text as="span" variant="caption" colorVariant="muted">
                            {activeCount === 1 ? "1 abbonamento attivo" : `${activeCount} abbonamenti attivi`}
                        </Text>
                    </div>
                    <div className={styles.figure}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            Ricarica a testa, al mese
                        </Text>
                        <Text as="span" variant={figureVariant} weight={700} className={styles.figureValue}>
                            {formatEuroCents(overview.rechargePerPersonCents)}
                        </Text>
                        <Text as="span" variant="caption" colorVariant="muted">
                            {overview.monthlyOnJointCents > 0
                                ? `di cui ${formatEuroCents(overview.monthlyOnJointCents)} al mese già sul conto comune`
                                : "metà del costo al mese, all'euro in su"}
                        </Text>
                    </div>
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
                </TileState>
            </section>
            <Text as="p" variant="caption" colorVariant="muted">
                Gli abbonamenti annuali contano 1/12 al mese; le spese una tantum non sono nella ricarica.
            </Text>

            {extrasError && (
                <InlineBanner variant="warning">
                    Carte, conti e rimborsi non si sono caricati: i totali qui sopra non li contano.{" "}
                    <Button variant="ghost" size="sm" onClick={reload}>
                        Riprova
                    </Button>
                </InlineBanner>
            )}

            {extrasReady && !figuresLoading && !figuresError && (
                <Card
                    title="Carte e conti comuni"
                    subtitle={
                        openJoint.length > 0
                            ? "Versato meno speso: quanto c'è ancora sopra."
                            : "Aggiungi le carte di ognuno e i conti comuni: scelto il conto, chi ha pagato viene da sé."
                    }
                    actions={
                        <Button variant="secondary" size="sm" onClick={() => setIsAccountsOpen(true)}>
                            Carte e conti
                        </Button>
                    }
                    flush={balance.jointAccounts.length > 0}
                >
                    {overview.toMove.length > 0 && (
                        <div className={styles.toMove}>
                            <InlineBanner variant="warning">
                                {overview.toMove.length === 1 ? "1 abbonamento è" : `${overview.toMove.length} abbonamenti sono`} ancora su
                                un conto chiuso. Apri la spesa e usa «Cambia da…» per spostarlo, dal prossimo addebito.
                            </InlineBanner>
                        </div>
                    )}
                    {overview.toMove.map(m => (
                        <ListRow
                            key={`move-${m.expense.id}`}
                            title={m.expense.name}
                            subtitle={`Da spostare: è su ${m.accountName}, chiuso`}
                            onClick={() => openEdit(m.expense)}
                            trailing={`prossimo ${formatShortDateIt(m.nextChargeOn)}`}
                        />
                    ))}
                    {balance.jointAccounts.map(j => (
                        <ListRow
                            key={j.accountId ?? "manual"}
                            title={j.accountId ? (accountById.get(j.accountId)?.name ?? JOINT_ACCOUNT) : JOINT_ACCOUNT}
                            subtitle={`Versati ${formatEuroCents(j.depositedCents)} · spesi ${formatEuroCents(j.spentCents)}`}
                            trailing={
                                <span className={styles.figureValue} data-negative={j.balanceCents < 0 || undefined}>
                                    {formatEuroCents(j.balanceCents)}
                                </span>
                            }
                        />
                    ))}
                </Card>
            )}

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
                        defaultAccountId={myAccountId}
                        isAccountOpen={id => accountById.get(id)?.closed_on == null}
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
                            onRecord={() => {
                                setMoveDraft(null);
                                setIsMoveOpen(true);
                            }}
                            onDeleteMove={move => {
                                setDialogError(null);
                                setMoveToDelete(move);
                            }}
                            depositHint={depositHint}
                            onDeposit={
                                depositHint
                                    ? () => {
                                          setMoveDraft({
                                              fromName: depositHint.from,
                                              toName: depositHint.accountName,
                                              accountId: depositHint.accountId,
                                              amount: centsToInput(depositHint.amountCents),
                                              note: "Pareggio"
                                          });
                                          setIsMoveOpen(true);
                                      }
                                    : undefined
                            }
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
                                                expense && accountNameAt(expense, c.chargedOn)
                                                    ? `su ${accountNameAt(expense, c.chargedOn)}`
                                                    : expense?.paid_by &&
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
                        accountLabel={e => accountNameAt(e, nextCharges.get(e.id) ?? e.paid_on ?? today)}
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
                extras={
                    extrasReady
                        ? { accounts, terms, refunds, memberNames, today, onChanged: handleExtraChanged }
                        : null
                }
            />
            <SettlementDrawer
                open={isMoveOpen}
                people={people}
                jointAccounts={openJoint}
                initialDraft={moveDraft}
                onClose={() => setIsMoveOpen(false)}
                onSaved={handleMoveSaved}
            />
            {extrasReady && (
                <AccountsDrawer
                    open={isAccountsOpen}
                    accounts={accounts}
                    members={members}
                    memberNames={memberNames}
                    onClose={() => setIsAccountsOpen(false)}
                    onChanged={handleExtraChanged}
                />
            )}

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
