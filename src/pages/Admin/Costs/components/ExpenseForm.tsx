import { ChipGroupSingle } from "@/components/ui/Chip/ChipGroup";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection/CollapsibleSection";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import { TextInput } from "@/components/ui/Input/TextInput";
import { DateInput } from "@/components/ui/Input/DateInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import Text from "@/components/ui/Text/Text";
import { CRM_EXPENSE_CATEGORIES, type CrmExpenseCategory } from "@shared/crmExpenses";
import {
    CRM_EXPENSE_FREQUENCY_OPTIONS,
    expenseDateOf,
    expenseDraftSummary,
    frequencyOf,
    withExpenseDate,
    withFrequency,
    type CrmExpenseDraft,
    type CrmExpenseDraftErrors,
    type CrmExpenseFrequency
} from "@/utils/crm/expenses";
import { JOINT_ACCOUNT } from "@/utils/crm/expenseBalance";
import { paidByForAccount } from "@/utils/crm/expenseTerms";
import type { CrmExpenseAccount } from "@/types/crm";
import styles from "../Costs.module.scss";

/**
 * Form puro di una spesa: controllato, nessuna logica di drawer né di
 * salvataggio. La bozza e gli errori stanno in `ExpenseDrawer`.
 *
 * Proposta 1 di D38 (scelta da Alex il 2026-10-05): cinque campi a vista
 * (Cosa, Importo, Quanto spesso, Data, Pagata da), il resto in «Altre
 * opzioni», «Disdetto» solo su una spesa che c'è già. La categoria a vista
 * sotto «Cosa» (Alex, 2026-10-16: l'icona della riga viene da lì).
 */

/** Nomi corti per la fila di scelte; quello intero resta nelle liste. */
const CATEGORY_SHORT: Record<CrmExpenseCategory, string> = {
    software: "Software",
    advertising: "Pubblicità",
    services: "Servizi",
    hardware: "Attrezzatura",
    other: "Altro"
};

const CATEGORY_OPTIONS = CRM_EXPENSE_CATEGORIES.map(value => ({ value, label: CATEGORY_SHORT[value] }));

type Props = {
    formId: string;
    draft: CrmExpenseDraft;
    errors: CrmExpenseDraftErrors;
    disabled: boolean;
    /** Spesa già salvata: compare «Disdetto». */
    isEdit: boolean;
    onChange: (next: CrmExpenseDraft) => void;
    onSubmit: () => void;
    /** Nomi pronti per «Pagata da»: il team e il conto comune. */
    payers?: string[];
    /** Carte e conti; vuoto = solo «Pagata da» (tabelle non ancora sul database). */
    accounts?: CrmExpenseAccount[];
    /** `crm_team_members.user_id` → nome. */
    memberNames?: Map<string, string>;
    /** Ci sono «Cambia da…»: il conto del primo addebito non si tocca più. */
    accountLocked?: boolean;
};

const NO_MAP = new Map<string, string>();

export function ExpenseForm({
    formId,
    draft,
    errors,
    disabled,
    isEdit,
    onChange,
    onSubmit,
    payers = [],
    accounts = [],
    memberNames = NO_MAP,
    accountLocked = false
}: Props) {
    const patch = (p: Partial<CrmExpenseDraft>) => onChange({ ...draft, ...p });
    const frequency = frequencyOf(draft);
    const isSubscription = draft.kind === "subscription";
    const pickedPayer = payers.find(p => p.toLocaleLowerCase("it") === draft.paidBy.trim().toLocaleLowerCase("it"));
    const summary = expenseDraftSummary(draft);
    const dateError = isSubscription ? errors.firstChargeOn : errors.paidOn;
    // Il Select offre i conti aperti, più quello già scelto anche se chiuso.
    const pickedAccount = accounts.find(a => a.id === draft.accountId);
    const accountOptions = [
        { value: "", label: "Nessuno: scrivo chi l'ha pagata" },
        ...accounts
            .filter(a => !a.closed_on || a.id === draft.accountId)
            .map(a => ({ value: a.id, label: a.closed_on ? `${a.name} (chiuso)` : a.name }))
    ];
    // Un conto personale il cui titolare non è nel team non dice chi paga:
    // allora «Pagata da» resta a vista.
    const accountPayer = pickedAccount ? paidByForAccount(pickedAccount, memberNames, JOINT_ACCOUNT) : null;
    const pickAccount = (accountId: string) => {
        const account = accounts.find(a => a.id === accountId);
        const paidBy = account ? paidByForAccount(account, memberNames, JOINT_ACCOUNT) : null;
        onChange({ ...draft, accountId, paidBy: paidBy ?? draft.paidBy });
    };

    return (
        <form
            id={formId}
            className={styles.form}
            noValidate
            onSubmit={e => {
                e.preventDefault();
                onSubmit();
            }}
        >
            <TextInput
                label="Cosa"
                required
                maxLength={120}
                placeholder="Per esempio Claude Max, dominio"
                value={draft.name}
                onChange={e => patch({ name: e.target.value })}
                error={errors.name}
                disabled={disabled}
            />
            <ChipGroupSingle
                label="Tipo di spesa"
                options={CATEGORY_OPTIONS.map(o => ({ ...o, disabled }))}
                value={draft.category}
                onChange={category => patch({ category })}
                ariaLabel="Tipo di spesa"
                layout="auto"
            />
            <div className={styles.fieldRow}>
                <TextInput
                    label="Importo in euro"
                    required
                    inputMode="decimal"
                    placeholder="109,80"
                    value={draft.amount}
                    onChange={e => patch({ amount: e.target.value })}
                    error={errors.amount}
                    helperText={
                        isEdit && isSubscription
                            ? "Il prezzo dal primo addebito. Se aumenta, usa «Cambia da…» qui sotto: i mesi passati restano."
                            : undefined
                    }
                    disabled={disabled}
                />
                <Select
                    label="Quanto spesso"
                    value={frequency}
                    onChange={e => onChange(withFrequency(draft, e.target.value as CrmExpenseFrequency))}
                    options={CRM_EXPENSE_FREQUENCY_OPTIONS}
                    disabled={disabled}
                />
            </div>
            <DateInput
                label={isSubscription ? "Primo addebito" : "Pagata il"}
                required
                value={expenseDateOf(draft)}
                onChange={e => onChange(withExpenseDate(draft, e.target.value))}
                error={dateError}
                disabled={disabled}
            />
            {accounts.length > 0 && (
                <Select
                    label="Carta o conto"
                    value={draft.accountId}
                    onChange={e => pickAccount(e.target.value)}
                    options={accountOptions}
                    helperText={
                        accountLocked
                            ? "Per spostarla su un altro conto da una data usa «Cambia da…» qui sotto."
                            : pickedAccount
                              ? pickedAccount.kind === "joint"
                                  ? "Conto comune: non pesa su nessuno dei due."
                                  : accountPayer
                                    ? `La paga ${accountPayer}, divisa a metà.`
                                    : "Il titolare non è nel team: scrivi qui sotto chi l'ha pagata."
                              : undefined
                    }
                    disabled={disabled || accountLocked}
                />
            )}
            {(!pickedAccount || accountPayer == null) && (
                <div className={styles.payerField}>
                    <TextInput
                        label="Pagata da"
                        maxLength={60}
                        placeholder="Per esempio Alessandro"
                        value={draft.paidBy}
                        onChange={e => patch({ paidBy: e.target.value })}
                        disabled={disabled}
                    />
                    {payers.length > 0 && (
                        <ChipGroupSingle
                            options={payers.map(p => ({ value: p, label: p, disabled }))}
                            value={pickedPayer}
                            onChange={paidBy => patch({ paidBy })}
                            ariaLabel="Chi l'ha pagata"
                            layout="auto"
                        />
                    )}
                </div>
            )}
            {summary && (
                <Text as="p" variant="body-sm" colorVariant="muted" className={styles.formSummary} aria-live="polite">
                    {summary}
                </Text>
            )}
            {isEdit && isSubscription && (
                <>
                    <Switch
                        label="Disdetto"
                        description="Dal giorno della disdetta non si contano più rinnovi."
                        checked={draft.cancelled}
                        onChange={cancelled => patch({ cancelled })}
                        disabled={disabled}
                    />
                    {draft.cancelled && (
                        <DateInput
                            label="Disdetto il"
                            required
                            value={draft.cancelledOn}
                            onChange={e => patch({ cancelledOn: e.target.value })}
                            error={errors.cancelledOn}
                            disabled={disabled}
                        />
                    )}
                </>
            )}
            <CollapsibleSection label="Altre opzioni" defaultOpen={Boolean(draft.notes.trim() || errors.remindDaysBefore)}>
                <div className={styles.form}>
                    {isSubscription && (
                        <>
                            <Switch
                                label="Promemoria su Telegram prima del rinnovo"
                                checked={draft.remind}
                                onChange={remind => patch({ remind })}
                                disabled={disabled}
                            />
                            {draft.remind && (
                                <TextInput
                                    label="Giorni prima"
                                    inputMode="numeric"
                                    value={draft.remindDaysBefore}
                                    onChange={e => patch({ remindDaysBefore: e.target.value })}
                                    error={errors.remindDaysBefore}
                                    disabled={disabled}
                                />
                            )}
                        </>
                    )}
                    <Textarea
                        label="Note"
                        rows={3}
                        maxLength={1000}
                        placeholder="Per esempio: divisa su Splitwise, da disdire a fine mese."
                        value={draft.notes}
                        onChange={e => patch({ notes: e.target.value })}
                        disabled={disabled}
                    />
                </div>
            </CollapsibleSection>
        </form>
    );
}
