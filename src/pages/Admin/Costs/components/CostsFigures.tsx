import { useState, type ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { CRM_BILLING_INTERVAL_LABEL, formatEuroCents } from "@shared/crmExpenses";
import { formatMonthIt, formatShortDateIt, type CostsOverview, type CrmExpenseMonth } from "@/utils/crm/expenses";
import type { CrmExpense } from "@/types/crm";
import { TileState } from "@/pages/Admin/Crm/components/TileState";
import { ExpenseIcon } from "./ExpenseIcon";
import { KindTag } from "./KindTag";
import { expenseKind } from "./expenseCategoryMeta";
import { MonthsByCategory } from "./MonthsByCategory";
import styles from "../Costs.module.scss";

type FigureKey = "spent" | "monthly" | "recharge" | "month";

export interface MonthRow {
    expense: CrmExpense;
    date: string;
    amountCents: number;
}

function signedDelta(cents: number, previousMonth: string): string {
    if (cents === 0) return `come ${previousMonth}`;
    return `${formatEuroCents(Math.abs(cents))} ${cents > 0 ? "più" : "meno"} di ${previousMonth}`;
}

/**
 * Il quadro in alto a pulsantoni, come Andamento del back office (D258, Alex
 * 2026-10-16): un clic su una cifra apre sotto da dove viene, un altro clic la
 * richiude. L'interruttore decide se gli annuali entrano nel costo al mese.
 */
export function CostsFigures({
    loading,
    error,
    onRetry,
    overview,
    months,
    firstMonth,
    currentMonth,
    previousMonth,
    renewals,
    monthRows,
    includeYearly,
    onIncludeYearly,
    onOpen,
    figureVariant
}: {
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    overview: CostsOverview;
    months: CrmExpenseMonth[];
    firstMonth: string;
    currentMonth: string;
    previousMonth: string;
    /** Abbonamenti attivi, dal rinnovo più vicino. */
    renewals: { expense: CrmExpense; nextChargeOn: string }[];
    /** Gli addebiti del mese corrente fino a oggi, rimborsi compresi. */
    monthRows: MonthRow[];
    includeYearly: boolean;
    onIncludeYearly: (value: boolean) => void;
    onOpen: (expense: CrmExpense) => void;
    figureVariant: "title-sm" | "title-lg";
}) {
    const [open, setOpen] = useState<FigureKey | null>(null);
    const monthName = formatMonthIt(currentMonth).split(" ")[0];
    const previousName = formatMonthIt(previousMonth).split(" ")[0];
    const thisMonth = months[0]?.totalCents ?? 0;
    const delta = thisMonth - (months[1]?.totalCents ?? 0);
    const monthlyCount = renewals.filter(r => r.expense.billing_interval !== "year").length;
    const counted = includeYearly ? renewals.length : monthlyCount;

    const cell = (key: FigureKey, label: string, value: string, caption: ReactNode) => (
        <button
            type="button"
            className={styles.figureCell}
            aria-pressed={open === key}
            aria-controls="costi-quadro-dettaglio"
            onClick={() => setOpen(current => (current === key ? null : key))}
        >
            <Text as="span" variant="caption" colorVariant="muted">
                {label}
            </Text>
            <Text as="span" variant={figureVariant} weight={700} className={styles.figureValue}>
                {value}
            </Text>
            {caption}
        </button>
    );

    const caption = (text: string) => (
        <Text as="span" variant="caption" colorVariant="muted">
            {text}
        </Text>
    );

    return (
        <section className={styles.figuresCard} aria-label="Il quadro">
            <div className={styles.figuresHead}>
                <div className={styles.inlineSwitch}>
                    <Text as="span" variant="body-sm" aria-hidden="true">
                        Conta anche gli annuali
                    </Text>
                    <Switch
                        size="sm"
                        ariaLabel="Conta anche gli annuali nel costo al mese"
                        checked={includeYearly}
                        onChange={onIncludeYearly}
                        disabled={overview.yearlyCount === 0}
                    />
                </div>
            </div>
            <div className={styles.figures}>
                <TileState loading={loading} error={error} onRetry={onRetry}>
                    {cell(
                        "spent",
                        months.length > 0 ? `Speso da ${formatMonthIt(firstMonth)}` : "Speso finora",
                        formatEuroCents(overview.spentSoFarCents),
                        caption(months.length > 0 ? "rimborsi tolti" : "ancora niente")
                    )}
                    {cell(
                        "monthly",
                        "Costo al mese, da ora",
                        formatEuroCents(overview.monthlyFromNowCents),
                        caption(
                            includeYearly
                                ? `${counted} abbonamenti, annuali a 1/12`
                                : `${counted === 1 ? "1 mensile" : `${counted} mensili`}${overview.yearlyCount > 0 ? ", annuali a parte" : ""}`
                        )
                    )}
                    {cell(
                        "recharge",
                        "Ricarica a testa",
                        formatEuroCents(overview.rechargePerPersonCents),
                        caption("ogni mese, metà del costo all'euro in su")
                    )}
                    {cell(
                        "month",
                        `Speso a ${monthName}`,
                        formatEuroCents(thisMonth),
                        months.length > 1 ? (
                            <span className={styles.figureDelta} data-trend={delta > 0 ? "up" : delta < 0 ? "down" : undefined}>
                                {delta > 0 && <TrendingUp size={14} aria-hidden="true" />}
                                {delta < 0 && <TrendingDown size={14} aria-hidden="true" />}
                                <Text as="span" variant="caption" color="inherit">
                                    {signedDelta(delta, previousName)}
                                </Text>
                            </span>
                        ) : null
                    )}
                </TileState>
            </div>

            {open && !loading && !error && (
                <div id="costi-quadro-dettaglio" className={styles.figureDetail}>
                    {open === "spent" && <MonthsByCategory months={months} />}

                    {open === "monthly" &&
                        (renewals.length === 0 ? (
                            caption("Nessun abbonamento attivo.")
                        ) : (
                            <ul className={styles.detailRows}>
                                {renewals.map(({ expense, nextChargeOn }) => {
                                    const interval = expense.billing_interval ?? "month";
                                    const out = interval === "year" && !includeYearly;
                                    return (
                                        <li key={expense.id}>
                                            <ListRow
                                                leading={<ExpenseIcon category={expense.category} />}
                                                title={
                                                    <span className={styles.nameCell}>
                                                        <span className={styles.ellipsis}>{expense.name}</span>
                                                        <KindTag kind={expenseKind(expense)} />
                                                    </span>
                                                }
                                                subtitle={`${formatEuroCents(expense.amount_cents)} ${CRM_BILLING_INTERVAL_LABEL[interval]}${out ? " · fuori dal costo al mese" : ""}`}
                                                muted={out}
                                                onClick={() => onOpen(expense)}
                                                trailing={`rinnovo ${formatShortDateIt(nextChargeOn)}`}
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                        ))}

                    {open === "recharge" && (
                        <Text as="p" variant="body-sm">
                            Metà di {formatEuroCents(overview.monthlyFromNowCents)} al mese, arrotondata all'euro in su:{" "}
                            {formatEuroCents(overview.rechargePerPersonCents)} a testa.
                            {overview.monthlyOnJointCents > 0 &&
                                ` Di questi, ${formatEuroCents(overview.monthlyOnJointCents)} al mese li prende già il conto comune.`}
                            {!includeYearly &&
                                overview.yearlyCount > 0 &&
                                ` Gli annuali (${formatEuroCents(overview.yearlyCents)} l'anno) non ci sono: si coprono a parte prima del rinnovo.`}
                        </Text>
                    )}

                    {open === "month" &&
                        (monthRows.length === 0 ? (
                            caption(`Nessuna spesa a ${monthName}.`)
                        ) : (
                            <ul className={styles.detailRows}>
                                {monthRows.map((row, i) => (
                                    <li key={`${row.expense.id}-${row.date}-${i}`}>
                                        <ListRow
                                            leading={<ExpenseIcon category={row.expense.category} />}
                                            title={row.expense.name}
                                            subtitle={formatShortDateIt(row.date)}
                                            onClick={() => onOpen(row.expense)}
                                            trailing={formatEuroCents(row.amountCents)}
                                        />
                                    </li>
                                ))}
                            </ul>
                        ))}
                </div>
            )}
        </section>
    );
}
