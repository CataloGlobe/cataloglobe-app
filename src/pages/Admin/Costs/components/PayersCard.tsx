import { Trash2 } from "lucide-react";
import { BarList } from "@/components/ui/BarList/BarList";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { formatEuroCents } from "@shared/crmExpenses";
import { isJointAccount, type ExpenseBalance } from "@/utils/crm/expenseBalance";
import { formatShortDateIt } from "@/utils/crm/expenses";
import type { CrmExpenseSettlement } from "@/types/crm";
import { TileState } from "@/pages/Admin/Crm/components/TileState";
import styles from "../Costs.module.scss";

/** Quanti movimenti si vedono sotto il conto. */
const RECENT_MOVES = 4;

function listNames(names: string[]): string {
    if (names.length <= 1) return names[0] ?? "nessuno";
    return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

function moveText(s: CrmExpenseSettlement): string {
    return isJointAccount(s.to_name) ? `${s.from_name} versa sul conto comune` : `${s.from_name} dà a ${s.to_name}`;
}

/**
 * Chi ha pagato cosa (decisione di Alex del 2026-10-05): quanto ha messo
 * ognuno, chi deve quanto a chi, e i rimborsi già fatti. Il conto è in
 * `computeExpenseBalance`; qui solo la vista.
 */
export function PayersCard({
    balance,
    loading,
    error,
    settlements,
    settlementsMissing,
    onRetry,
    onSettle,
    onRecord,
    onDeleteMove
}: {
    balance: ExpenseBalance;
    loading: boolean;
    error: string | null;
    settlements: CrmExpenseSettlement[];
    /** La tabella dei movimenti non c'è ancora sul database. */
    settlementsMissing: boolean;
    onRetry: () => void;
    onSettle: () => void;
    onRecord: () => void;
    onDeleteMove: (move: CrmExpenseSettlement) => void;
}) {
    const first = balance.transfers[0];

    return (
        <Card
            title="Chi ha pagato"
            subtitle={`Diviso in parti uguali fra ${listNames(balance.people.map(p => p.name))}: ${formatEuroCents(balance.sharedCents)} pagati di tasca vostra fino a oggi.`}
            actions={
                <Button variant="secondary" size="sm" onClick={onRecord} disabled={settlementsMissing}>
                    Registra un movimento
                </Button>
            }
        >
            <TileState loading={loading} error={error} onRetry={onRetry}>
                <div className={styles.payers}>
                    <div className={styles.payerStatus} data-even={balance.even || undefined}>
                        <Text as="p" variant="body" weight={600} color="inherit">
                            {first
                                ? balance.transfers.map(t => `${t.from} deve ${formatEuroCents(t.amountCents)} a ${t.to}`).join(" · ")
                                : "Siete in pari"}
                        </Text>
                        {first && (
                            <Button variant="primary" size="sm" onClick={onSettle} disabled={settlementsMissing}>
                                Segna come pareggiato
                            </Button>
                        )}
                    </div>

                    <BarList
                        aria-label="Quanto ha pagato ognuno"
                        labelColumn="fit"
                        items={balance.people.map(p => ({
                            id: p.name,
                            label: p.name,
                            value: p.paidCents,
                            valueLabel: formatEuroCents(p.paidCents)
                        }))}
                    />

                    {(balance.jointCents > 0 || balance.unassignedCount > 0) && (
                        <Text as="p" variant="caption" colorVariant="muted">
                            {[
                                balance.jointCents > 0 && `Dal conto comune ${formatEuroCents(balance.jointCents)}: non pesa su nessuno.`,
                                balance.unassignedCount > 0 &&
                                    `${balance.unassignedCount === 1 ? "1 spesa" : `${balance.unassignedCount} spese`} senza «Pagata da» (${formatEuroCents(balance.unassignedCents)}) restano fuori dal conto.`
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        </Text>
                    )}

                    {settlementsMissing ? (
                        <InlineBanner variant="info">
                            Rimborsi e versamenti si potranno segnare dopo l'aggiornamento del database. Il conto qui sopra vale già.
                        </InlineBanner>
                    ) : (
                        settlements.length > 0 && (
                            <div className={styles.moves}>
                                <Text as="span" variant="caption" colorVariant="muted">
                                    Ultimi movimenti
                                </Text>
                                <ul>
                                    {settlements.slice(0, RECENT_MOVES).map(s => (
                                        <li key={s.id} className={styles.move}>
                                            <Text as="span" variant="caption" colorVariant="muted" className={styles.moveWhen}>
                                                {formatShortDateIt(s.settled_on)}
                                            </Text>
                                            <Text as="span" variant="body-sm" className={styles.moveText}>
                                                {moveText(s)}
                                                {s.note ? ` · ${s.note}` : ""}
                                            </Text>
                                            <Text as="span" variant="body-sm" weight={600} className={styles.figureValue}>
                                                {formatEuroCents(s.amount_cents)}
                                            </Text>
                                            <Tooltip content="Togli il movimento" side="top">
                                                <span className={styles.tipWrap}>
                                                    <button
                                                        type="button"
                                                        className={styles.iconBtn}
                                                        aria-label={`Togli il movimento: ${moveText(s)}, ${formatEuroCents(s.amount_cents)}`}
                                                        onClick={() => onDeleteMove(s)}
                                                    >
                                                        <Trash2 size={14} aria-hidden="true" />
                                                    </button>
                                                </span>
                                            </Tooltip>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )
                    )}
                </div>
            </TileState>
        </Card>
    );
}
