import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { DateInput } from "@/components/ui/Input/DateInput";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { formatEuroCents, parseEuroToCents } from "@shared/crmExpenses";
import { createCrmExpenseRefund, deleteCrmExpenseRefund } from "@/services/supabase/crmExpenses";
import {
    refundDraftToInput,
    validateRefundDraft,
    type RefundDraft,
    type RefundDraftErrors
} from "@/utils/crm/expenseForms";
import { formatShortDateIt } from "@/utils/crm/expenses";
import { crmErrorMessage } from "@/utils/crm/stages";
import type { CrmExpense, CrmExpenseRefund } from "@/types/crm";
import styles from "../Costs.module.scss";

type Props = {
    expense: CrmExpense;
    /** I rimborsi di questa spesa. */
    refunds: CrmExpenseRefund[];
    today: string;
    onChanged: (message: string) => void;
};

/**
 * Rimborsi del fornitore (piano di Alex del 2026-10-16): si salvano subito e
 * contano in meno nel loro mese, su chi pagava la spesa quel giorno.
 */
export function ExpenseRefundsSection({ expense, refunds, today, onChanged }: Props) {
    const [draft, setDraft] = useState<RefundDraft | null>(null);
    const [errors, setErrors] = useState<RefundDraftErrors>({});
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [toDelete, setToDelete] = useState<CrmExpenseRefund | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const own = refunds.filter(r => r.expense_id === expense.id).sort((a, b) => b.refunded_on.localeCompare(a.refunded_on));
    const draftCents = draft ? parseEuroToCents(draft.amount) : null;

    const patch = (p: Partial<RefundDraft>) => {
        setDraft(prev => (prev ? { ...prev, ...p } : prev));
        setError(null);
    };

    async function save() {
        if (!draft) return;
        const found = validateRefundDraft(draft);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setIsSaving(true);
        setError(null);
        try {
            const input = refundDraftToInput(draft, expense.id);
            await createCrmExpenseRefund(input);
            setDraft(null);
            onChanged(`Rimborso di ${formatEuroCents(input.amountCents)} segnato.`);
        } catch (err) {
            setError(crmErrorMessage(err));
        } finally {
            setIsSaving(false);
        }
    }

    async function remove() {
        if (!toDelete) return false;
        setDeleteError(null);
        try {
            await deleteCrmExpenseRefund(toDelete.id);
            setToDelete(null);
            onChanged("Rimborso tolto.");
        } catch (err) {
            setDeleteError(crmErrorMessage(err));
            return false;
        }
    }

    return (
        <section className={styles.extraSection} aria-labelledby="crm-expense-refunds-title">
            <div className={styles.extraHead}>
                <Text as="h3" id="crm-expense-refunds-title" variant="body" weight={600}>
                    Rimborsi
                </Text>
                {!draft && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setErrors({});
                            setError(null);
                            setDraft({ refundedOn: today, amount: "", note: "" });
                        }}
                    >
                        Segna un rimborso
                    </Button>
                )}
            </div>
            {own.length === 0 && !draft && (
                <Text as="p" variant="body-sm" colorVariant="muted">
                    Se il fornitore restituisce dei soldi, segnali qui: contano in meno nel mese in cui rientrano.
                </Text>
            )}

            {own.length > 0 && (
                <ul className={styles.extraList}>
                    {own.map(r => (
                        <li key={r.id} className={styles.extraRow}>
                            <Text as="span" variant="caption" colorVariant="muted" className={styles.moveWhen}>
                                {formatShortDateIt(r.refunded_on)}
                            </Text>
                            <Text as="span" variant="body-sm" className={styles.moveText}>
                                {r.note ?? "Rimborso"}
                            </Text>
                            <Text as="span" variant="body-sm" weight={600} className={styles.figureValue}>
                                −{formatEuroCents(r.amount_cents)}
                            </Text>
                            <Tooltip content="Togli il rimborso" side="top">
                                <span className={styles.tipWrap}>
                                    <button
                                        type="button"
                                        className={styles.iconBtn}
                                        aria-label={`Togli il rimborso del ${formatShortDateIt(r.refunded_on)}, ${formatEuroCents(r.amount_cents)}`}
                                        onClick={() => {
                                            setDeleteError(null);
                                            setToDelete(r);
                                        }}
                                    >
                                        <Trash2 size={14} aria-hidden="true" />
                                    </button>
                                </span>
                            </Tooltip>
                        </li>
                    ))}
                </ul>
            )}

            {draft && (
                <div className={styles.extraForm}>
                    <div className={styles.fieldRow}>
                        <DateInput
                            label="Rientrato il"
                            required
                            value={draft.refundedOn}
                            onChange={e => patch({ refundedOn: e.target.value })}
                            error={errors.refundedOn}
                            disabled={isSaving}
                        />
                        <TextInput
                            label="Importo in euro"
                            required
                            inputMode="decimal"
                            placeholder="5"
                            value={draft.amount}
                            onChange={e => patch({ amount: e.target.value })}
                            error={errors.amount}
                            helperText={
                                draftCents != null && draftCents > expense.amount_cents
                                    ? "È più di un addebito: va bene se rimborsano più mesi insieme."
                                    : undefined
                            }
                            disabled={isSaving}
                        />
                    </div>
                    <TextInput
                        label="Nota"
                        maxLength={300}
                        placeholder="Per esempio addebito doppio di marzo"
                        value={draft.note}
                        onChange={e => patch({ note: e.target.value })}
                        error={errors.note}
                        disabled={isSaving}
                    />
                    {error && (
                        <Text as="p" variant="body-sm" colorVariant="error" role="alert">
                            {error}
                        </Text>
                    )}
                    <div className={styles.extraActions}>
                        <Button variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" size="sm" onClick={() => void save()} loading={isSaving}>
                            Segna il rimborso
                        </Button>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={toDelete != null}
                onClose={() => setToDelete(null)}
                onConfirm={remove}
                title="Togliere il rimborso?"
                message={
                    toDelete
                        ? `${formatEuroCents(toDelete.amount_cents)} del ${formatShortDateIt(toDelete.refunded_on)}: torna a contare come spesa piena.`
                        : undefined
                }
                confirmLabel="Togli"
                confirmVariant="danger"
                error={deleteError}
            />
        </section>
    );
}
