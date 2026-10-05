import { forwardRef, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { DateInput } from "@/components/ui/Input/DateInput";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { CRM_BILLING_INTERVAL_LABEL, formatEuroCents } from "@shared/crmExpenses";
import { createCrmExpense } from "@/services/supabase/crmExpenses";
import {
    CRM_EXPENSE_FREQUENCY_OPTIONS,
    draftFromPrevious,
    expenseDateOf,
    expenseDraftSummary,
    expenseDraftToInput,
    frequencyOf,
    quickExpenseDraft,
    suggestExpenses,
    validateExpenseDraft,
    withExpenseDate,
    withFrequency,
    type CrmExpenseDraft,
    type CrmExpenseDraftErrors,
    type CrmExpenseFrequency
} from "@/utils/crm/expenses";
import { crmErrorMessage } from "@/utils/crm/stages";
import type { CrmExpense } from "@/types/crm";
import styles from "../Costs.module.scss";

type Props = {
    expenses: CrmExpense[];
    today: string;
    /** Chi è entrato: paga lui, finché non si dice altro. */
    defaultPayer: string;
    /** Dopo il salvataggio: la pagina ricarica e dice cosa è entrato. */
    onAdded: (summary: string, expense: CrmExpense) => void;
    /** «Più dettagli»: il drawer con quello scritto fin qui. */
    onDetails: (draft: CrmExpenseDraft) => void;
};

function previousLabel(e: CrmExpense): string {
    const interval = e.kind === "subscription" && e.billing_interval ? ` ${CRM_BILLING_INTERVAL_LABEL[e.billing_interval]}` : "";
    return `${e.name} · ${formatEuroCents(e.amount_cents)}${interval}`;
}

/**
 * Riga veloce in cima alle spese (Proposta 2 di D38, scelta da Alex il
 * 2026-10-05): Cosa, Importo, Quanto spesso, Data e Invio. Un nome già visto
 * propone gli stessi dati; «Più dettagli» apre il drawer già riempito.
 */
export const QuickExpenseRow = forwardRef<HTMLInputElement, Props>(function QuickExpenseRow(
    { expenses, today, defaultPayer, onAdded, onDetails },
    nameRef
) {
    const [draft, setDraft] = useState<CrmExpenseDraft>(() => quickExpenseDraft(today, defaultPayer));
    const [errors, setErrors] = useState<CrmExpenseDraftErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [picked, setPicked] = useState<string | null>(null);

    // Chi paga arriva dopo il primo render (il team si carica): lo si mette
    // solo finché la riga non l'ha già.
    const effective = draft.paidBy || !defaultPayer ? draft : { ...draft, paidBy: defaultPayer };

    const suggestions = useMemo(
        () => (picked === draft.name ? [] : suggestExpenses(expenses, draft.name)),
        [expenses, draft.name, picked]
    );

    function change(next: CrmExpenseDraft) {
        setDraft(next);
        if (Object.keys(errors).length > 0) setErrors({});
        setFormError(null);
    }

    function pick(e: CrmExpense) {
        setPicked(e.name);
        change(draftFromPrevious(e, today));
    }

    async function handleSubmit() {
        const found = validateExpenseDraft(effective);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setIsSaving(true);
        setFormError(null);
        try {
            const created = await createCrmExpense(expenseDraftToInput(effective));
            const summary = `${effective.name.trim()}, ${expenseDraftSummary(effective) ?? ""}`;
            setDraft(quickExpenseDraft(today, defaultPayer));
            setPicked(null);
            onAdded(summary, created);
            if (nameRef && typeof nameRef !== "function") nameRef.current?.focus();
        } catch (err) {
            setFormError(crmErrorMessage(err));
        } finally {
            setIsSaving(false);
        }
    }

    const isSubscription = effective.kind === "subscription";

    return (
        <section className={styles.quickBox} aria-label="Aggiungi una spesa">
            <form
                className={styles.quickRow}
                noValidate
                onSubmit={e => {
                    e.preventDefault();
                    void handleSubmit();
                }}
            >
                <div className={styles.quickName}>
                    <TextInput
                        ref={nameRef}
                        label="Cosa"
                        maxLength={120}
                        placeholder="Nuova spesa, per esempio Claude Max"
                        autoComplete="off"
                        value={effective.name}
                        onChange={e => change({ ...effective, name: e.target.value })}
                        error={errors.name}
                        disabled={isSaving}
                    />
                </div>
                <div className={styles.quickAmount}>
                    <TextInput
                        label="Importo in euro"
                        inputMode="decimal"
                        placeholder="90,00"
                        value={effective.amount}
                        onChange={e => change({ ...effective, amount: e.target.value })}
                        error={errors.amount}
                        disabled={isSaving}
                    />
                </div>
                <div className={styles.quickFrequency}>
                    <Select
                        label="Quanto spesso"
                        value={frequencyOf(effective)}
                        onChange={e => change(withFrequency(effective, e.target.value as CrmExpenseFrequency))}
                        options={CRM_EXPENSE_FREQUENCY_OPTIONS}
                        disabled={isSaving}
                    />
                </div>
                <div className={styles.quickDate}>
                    <DateInput
                        label={isSubscription ? "Primo addebito" : "Pagata il"}
                        value={expenseDateOf(effective)}
                        onChange={e => change(withExpenseDate(effective, e.target.value))}
                        error={isSubscription ? errors.firstChargeOn : errors.paidOn}
                        disabled={isSaving}
                    />
                </div>
                <div className={styles.quickActions}>
                    <Button variant="primary" type="submit" loading={isSaving}>
                        Aggiungi
                    </Button>
                    <Button variant="secondary" onClick={() => onDetails(effective)} disabled={isSaving}>
                        Più dettagli
                    </Button>
                </div>
            </form>
            {suggestions.length > 0 && (
                <div className={styles.quickSuggestions}>
                    <Text as="span" variant="caption" colorVariant="muted">
                        Come l'ultima volta:
                    </Text>
                    {suggestions.map(e => (
                        <button key={e.id} type="button" className={styles.quickSuggestion} onClick={() => pick(e)}>
                            <Text as="span" variant="caption" weight={500}>
                                {previousLabel(e)}
                            </Text>
                        </button>
                    ))}
                </div>
            )}
            {formError && (
                <Text as="p" variant="caption" className={styles.quickError} role="alert">
                    {formError}
                </Text>
            )}
        </section>
    );
});
