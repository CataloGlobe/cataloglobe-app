import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ChipGroupSingle } from "@/components/ui/Chip/ChipGroup";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { createCrmExpenseAccount, setCrmExpenseAccountClosed } from "@/services/supabase/crmExpenses";
import {
    accountDraftToInput,
    isDuplicateError,
    validateAccountDraft,
    type AccountDraft,
    type AccountDraftErrors
} from "@/utils/crm/expenseForms";
import { accountOwnerText } from "@/utils/crm/expenseTerms";
import { formatShortDateIt, romeTodayIso } from "@/utils/crm/expenses";
import { crmErrorMessage } from "@/utils/crm/stages";
import type { CrmExpenseAccount, CrmExpenseAccountKind } from "@/types/crm";
import styles from "./Costs.module.scss";

const FORM_ID = "crm-account-form";

const KIND_OPTIONS: { value: CrmExpenseAccountKind; label: string }[] = [
    { value: "personal", label: "Di una persona" },
    { value: "joint", label: "Comune, metà a testa" }
];

type Props = {
    open: boolean;
    accounts: CrmExpenseAccount[];
    /** Il team del CRM: `user_id` e nome. */
    members: { user_id: string; display_name: string }[];
    memberNames: Map<string, string>;
    onClose: () => void;
    /** Dopo ogni modifica: la pagina ricarica. */
    onChanged: (message: string) => void;
};

function emptyDraft(): AccountDraft {
    return { name: "", kind: "personal", ownerMemberId: "" };
}

/**
 * Carte e conti (piano di Alex del 2026-10-16): l'elenco, uno nuovo con nome
 * generico e di chi è, chiudi e riapri. Chiuso non si cancella: gli addebiti
 * di prima restano suoi; gli abbonamenti ancora sopra compaiono «da spostare».
 */
export function AccountsDrawer({ open, accounts, members, memberNames, onClose, onChanged }: Props) {
    const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
    const [errors, setErrors] = useState<AccountDraftErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setDraft(emptyDraft());
        setErrors({});
        setFormError(null);
        setIsSaving(false);
    }, [open]);

    const patch = (p: Partial<AccountDraft>) => {
        setDraft(prev => ({ ...prev, ...p }));
        setFormError(null);
    };

    async function handleSubmit() {
        const found = validateAccountDraft(draft, accounts);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setIsSaving(true);
        setFormError(null);
        try {
            const input = accountDraftToInput(draft);
            await createCrmExpenseAccount(input);
            setDraft(emptyDraft());
            onChanged(`Aggiunto: ${input.name}.`);
        } catch (err) {
            setFormError(isDuplicateError(err) ? "C'è già un conto con questo nome." : crmErrorMessage(err));
        } finally {
            setIsSaving(false);
        }
    }

    async function toggleClosed(account: CrmExpenseAccount) {
        setBusyId(account.id);
        setFormError(null);
        try {
            const closing = !account.closed_on;
            await setCrmExpenseAccountClosed(account.id, closing ? romeTodayIso() : null);
            onChanged(closing ? `${account.name} chiuso.` : `${account.name} riaperto.`);
        } catch (err) {
            setFormError(crmErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    }

    const sorted = [...accounts].sort((a, b) => Number(Boolean(a.closed_on)) - Number(Boolean(b.closed_on)) || a.name.localeCompare(b.name, "it"));
    const ownerOptions = [{ value: "", label: "Scegli…" }, ...members.map(m => ({ value: m.user_id, label: m.display_name }))];

    return (
        <SystemDrawer open={open} onClose={onClose} size="sm">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Carte e conti
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Chiudi
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving}>
                            Aggiungi
                        </Button>
                    </>
                }
            >
                <div className={styles.form}>
                    {formError && <InlineBanner variant="error">{formError}</InlineBanner>}
                    <Text as="p" variant="body-sm" colorVariant="muted">
                        Con cosa pagate le spese. Scelto il conto in una spesa, chi l'ha pagata viene da sé: un conto di una persona
                        lo paga lei e si divide a metà, un conto comune non pesa su nessuno.
                    </Text>

                    {sorted.length > 0 ? (
                        <Card title="I vostri conti" flush>
                            {sorted.map(a => (
                                <ListRow
                                    key={a.id}
                                    title={a.name}
                                    subtitle={[accountOwnerText(a, memberNames), a.closed_on && `chiuso il ${formatShortDateIt(a.closed_on)}`]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    muted={Boolean(a.closed_on)}
                                    trailing={
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            loading={busyId === a.id}
                                            disabled={busyId != null && busyId !== a.id}
                                            onClick={() => void toggleClosed(a)}
                                            aria-label={a.closed_on ? `Riapri ${a.name}` : `Chiudi ${a.name}`}
                                        >
                                            {a.closed_on ? "Riapri" : "Chiudi"}
                                        </Button>
                                    }
                                />
                            ))}
                        </Card>
                    ) : (
                        <Text as="p" variant="body-sm">
                            Ancora nessun conto. Aggiungi le carte di ognuno e i conti comuni, per esempio «Postepay Alex» e
                            «Revolut cointestato».
                        </Text>
                    )}

                    <form
                        id={FORM_ID}
                        className={styles.form}
                        noValidate
                        onSubmit={e => {
                            e.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        <Text as="h3" variant="body" weight={600}>
                            Aggiungi un conto
                        </Text>
                        <TextInput
                            label="Nome"
                            required
                            maxLength={60}
                            placeholder="Per esempio Postepay Alex"
                            helperText="Un nome per riconoscerlo, mai il numero della carta o del conto."
                            value={draft.name}
                            onChange={e => patch({ name: e.target.value })}
                            error={errors.name}
                            disabled={isSaving}
                        />
                        <ChipGroupSingle
                            options={KIND_OPTIONS.map(o => ({ ...o, disabled: isSaving }))}
                            value={draft.kind}
                            onChange={kind => patch({ kind, ownerMemberId: kind === "joint" ? "" : draft.ownerMemberId })}
                            ariaLabel="Di chi è"
                            layout="auto"
                        />
                        {draft.kind === "personal" && (
                            <Select
                                label="Di chi"
                                value={draft.ownerMemberId}
                                onChange={e => patch({ ownerMemberId: e.target.value })}
                                options={ownerOptions}
                                error={errors.ownerMemberId}
                                disabled={isSaving}
                            />
                        )}
                    </form>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
