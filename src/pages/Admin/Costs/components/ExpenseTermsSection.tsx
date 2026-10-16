import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { DateInput } from "@/components/ui/Input/DateInput";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { formatEuroCents } from "@shared/crmExpenses";
import { createCrmExpenseTerm, deleteCrmExpenseTerm } from "@/services/supabase/crmExpenses";
import {
    isDuplicateError,
    termDraftFor,
    termDraftPreview,
    termDraftToInput,
    validateTermDraft,
    type TermDraft,
    type TermDraftErrors
} from "@/utils/crm/expenseForms";
import { termAt } from "@/utils/crm/expenseTerms";
import { formatShortDateIt } from "@/utils/crm/expenses";
import { crmErrorMessage } from "@/utils/crm/stages";
import type { CrmExpense, CrmExpenseAccount, CrmExpenseTerm } from "@/types/crm";
import styles from "../Costs.module.scss";

type Props = {
    expense: CrmExpense;
    /** I «Cambia da…» di questa spesa. */
    terms: CrmExpenseTerm[];
    accounts: CrmExpenseAccount[];
    today: string;
    /** Dopo ogni salvataggio: la pagina ricarica. */
    onChanged: (message: string) => void;
};

/**
 * «Prezzo e conto» di un abbonamento (piano di Alex del 2026-10-16): la
 * storia dei cambi e «Cambia da…», che si salva subito. Un cambio vale
 * dall'addebito di quel giorno o dopo; i mesi prima restano come sono.
 * Niente `<form>`: sta dentro il drawer, accanto al form della spesa.
 */
export function ExpenseTermsSection({ expense, terms, accounts, today, onChanged }: Props) {
    const [draft, setDraft] = useState<TermDraft | null>(null);
    const [errors, setErrors] = useState<TermDraftErrors>({});
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [toDelete, setToDelete] = useState<CrmExpenseTerm | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const own = terms.filter(t => t.expense_id === expense.id).sort((a, b) => a.valid_from.localeCompare(b.valid_from));
    const accountName = (id: string | null) => (id ? accounts.find(a => a.id === id)?.name : undefined);
    const firstAccount = accountName(expense.account_id);
    const accountOptions = [
        { value: "", label: "Resta dov'è" },
        ...accounts.filter(a => !a.closed_on).map(a => ({ value: a.id, label: a.name }))
    ];
    const preview = draft ? termDraftPreview(draft, expense, terms, accounts) : null;
    const current = termAt(expense, terms, today);

    const patch = (p: Partial<TermDraft>) => {
        setDraft(prev => (prev ? { ...prev, ...p } : prev));
        setError(null);
    };

    async function save() {
        if (!draft) return;
        const found = validateTermDraft(draft, expense, terms);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setIsSaving(true);
        setError(null);
        try {
            await createCrmExpenseTerm(termDraftToInput(draft, expense.id));
            setDraft(null);
            onChanged(`Cambio dal ${formatShortDateIt(draft.validFrom)} salvato.`);
        } catch (err) {
            setError(isDuplicateError(err) ? "C'è già un cambio da questo giorno: toglilo e rifallo." : crmErrorMessage(err));
        } finally {
            setIsSaving(false);
        }
    }

    async function remove() {
        if (!toDelete) return false;
        setDeleteError(null);
        try {
            await deleteCrmExpenseTerm(toDelete.id);
            setToDelete(null);
            onChanged("Cambio tolto.");
        } catch (err) {
            setDeleteError(crmErrorMessage(err));
            return false;
        }
    }

    return (
        <section className={styles.extraSection} aria-labelledby="crm-expense-terms-title">
            <div className={styles.extraHead}>
                <Text as="h3" id="crm-expense-terms-title" variant="body" weight={600}>
                    Prezzo e conto
                </Text>
                {!draft && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setErrors({});
                            setError(null);
                            setDraft(termDraftFor(expense, terms, today));
                        }}
                    >
                        Cambia da…
                    </Button>
                )}
            </div>
            <Text as="p" variant="body-sm" colorVariant="muted">
                Oggi {formatEuroCents(current.amountCents)}
                {accountName(current.accountId) ? `, su ${accountName(current.accountId)}` : ""}. Un aumento o un cambio di carta
                si segna da una data: i mesi prima restano come sono.
            </Text>

            <ul className={styles.extraList}>
                <li className={styles.extraRow}>
                    <Text as="span" variant="caption" colorVariant="muted" className={styles.moveWhen}>
                        {expense.first_charge_on ? formatShortDateIt(expense.first_charge_on) : "—"}
                    </Text>
                    <Text as="span" variant="body-sm" className={styles.moveText}>
                        Primo addebito{firstAccount ? ` · ${firstAccount}` : ""}
                    </Text>
                    <Text as="span" variant="body-sm" weight={600} className={styles.figureValue}>
                        {formatEuroCents(expense.amount_cents)}
                    </Text>
                    <span className={styles.iconBtnSpacer} aria-hidden="true" />
                </li>
                {own.map(t => (
                    <li key={t.id} className={styles.extraRow}>
                        <Text as="span" variant="caption" colorVariant="muted" className={styles.moveWhen}>
                            dal {formatShortDateIt(t.valid_from)}
                        </Text>
                        <Text as="span" variant="body-sm" className={styles.moveText}>
                            {accountName(t.account_id) ? `Passa su ${accountName(t.account_id)}` : "Nuovo prezzo"}
                        </Text>
                        <Text as="span" variant="body-sm" weight={600} className={styles.figureValue}>
                            {formatEuroCents(t.amount_cents)}
                        </Text>
                        <Tooltip content="Togli il cambio" side="top">
                            <span className={styles.tipWrap}>
                                <button
                                    type="button"
                                    className={styles.iconBtn}
                                    aria-label={`Togli il cambio dal ${formatShortDateIt(t.valid_from)}`}
                                    onClick={() => {
                                        setDeleteError(null);
                                        setToDelete(t);
                                    }}
                                >
                                    <Trash2 size={14} aria-hidden="true" />
                                </button>
                            </span>
                        </Tooltip>
                    </li>
                ))}
            </ul>

            {draft && (
                <div className={styles.extraForm}>
                    <div className={styles.fieldRow}>
                        <DateInput
                            label="Dal giorno"
                            required
                            value={draft.validFrom}
                            onChange={e => patch({ validFrom: e.target.value })}
                            error={errors.validFrom}
                            disabled={isSaving}
                        />
                        <TextInput
                            label="Nuovo importo in euro"
                            required
                            inputMode="decimal"
                            value={draft.amount}
                            onChange={e => patch({ amount: e.target.value })}
                            error={errors.amount}
                            disabled={isSaving}
                        />
                    </div>
                    {accounts.length > 0 && (
                        <Select
                            label="Carta o conto da quel giorno"
                            value={draft.accountId}
                            onChange={e => patch({ accountId: e.target.value })}
                            options={accountOptions}
                            disabled={isSaving}
                        />
                    )}
                    {draft.validFrom < today && (
                        <Text as="p" variant="body-sm" colorVariant="warning" role="status">
                            Il giorno è passato: cambiano anche gli addebiti già fatti da allora, e il conto tra voi.
                        </Text>
                    )}
                    {preview && (
                        <Text as="p" variant="body-sm" className={styles.formSummary} aria-live="polite">
                            {preview}
                        </Text>
                    )}
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
                            Salva il cambio
                        </Button>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={toDelete != null}
                onClose={() => setToDelete(null)}
                onConfirm={remove}
                title="Togliere il cambio?"
                message={
                    toDelete
                        ? `Dal ${formatShortDateIt(toDelete.valid_from)} torna a valere il prezzo e il conto di prima, anche sugli addebiti già passati.`
                        : undefined
                }
                confirmLabel="Togli"
                confirmVariant="danger"
                error={deleteError}
            />
        </section>
    );
}
