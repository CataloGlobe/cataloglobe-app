import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select, type SelectOption } from "@/components/ui/Select/Select";
import { isValidPartitaIva, isValidCodiceFiscale } from "@/utils/fiscalValidators";
import { isValidCapIT, isValidProvinciaIT } from "@/utils/addressValidators";
import { BILLING_FIELD_MAX, billingLengthError } from "@/components/Businesses/CreateBusinessWizard/steps/billingLimits";
import { billingRecipientRequired, type BillingDraft } from "./billingDraft";
import styles from "./BillingDetailsForm.module.scss";

interface BillingDetailsFormProps {
    value: BillingDraft;
    onChange: (patch: Partial<BillingDraft>) => void;
    disabled?: boolean;
}

const ENTITY_OPTIONS: SelectOption[] = [
    { value: "", label: "Seleziona tipologia…", disabled: true },
    { value: "societa", label: "Società" },
    { value: "professionista", label: "Professionista / Ditta individuale" },
    { value: "associazione", label: "Associazione / Ente" }
];

/**
 * Form puro dei dati di fatturazione (controllato via `value`/`onChange`).
 *
 * Deliberatamente SENZA logica di wizard e senza AddressAutocomplete: qui si
 * correggono dati già esistenti. Le regole di visibilità/obbligo dei campi
 * rispecchiano `StepBilling`; la validazione di salvabilità vive in
 * `isBillingDraftComplete` (billingDraft.ts).
 */
export function BillingDetailsForm({ value, onChange, disabled = false }: BillingDetailsFormProps) {
    const isSocieta = value.entityType === "societa";
    const isProfessionista = value.entityType === "professionista";
    const isAssociazione = value.entityType === "associazione";

    const vatError =
        value.vatNumber.trim().length > 0 && !isValidPartitaIva(value.vatNumber)
            ? "Partita IVA non valida (11 cifre)."
            : undefined;
    const fiscalError =
        value.fiscalCode.trim().length > 0 && !isValidCodiceFiscale(value.fiscalCode)
            ? "Codice fiscale non valido."
            : undefined;

    const recipientRequired = billingRecipientRequired(value);
    const recipientMissing =
        recipientRequired &&
        value.codiceDestinatario.trim().length === 0 &&
        value.pec.trim().length === 0;
    const codiceDestinatarioError =
        billingLengthError(value.codiceDestinatario, BILLING_FIELD_MAX.codiceDestinatario) ??
        (recipientMissing
            ? "Con la Partita IVA serve un recapito: Codice Destinatario SDI o PEC."
            : undefined);

    return (
        <div className={styles.formStack}>
            <Select
                label="Tipologia intestatario"
                value={value.entityType}
                onChange={e => onChange({ entityType: e.target.value as BillingDraft["entityType"] })}
                options={ENTITY_OPTIONS}
                disabled={disabled}
                required
            />

            {isProfessionista && (
                <div className={styles.fieldRow}>
                    <TextInput
                        label="Nome"
                        value={value.firstName}
                        onChange={e => onChange({ firstName: e.target.value })}
                        placeholder="es. Mario"
                        disabled={disabled}
                        required
                        error={billingLengthError(value.firstName, BILLING_FIELD_MAX.firstName)}
                    />
                    <TextInput
                        label="Cognome"
                        value={value.lastName}
                        onChange={e => onChange({ lastName: e.target.value })}
                        placeholder="es. Rossi"
                        disabled={disabled}
                        required
                        error={billingLengthError(value.lastName, BILLING_FIELD_MAX.lastName)}
                    />
                </div>
            )}

            {(isSocieta || isAssociazione) && (
                <TextInput
                    label={isAssociazione ? "Denominazione" : "Ragione sociale"}
                    value={value.legalName}
                    onChange={e => onChange({ legalName: e.target.value })}
                    placeholder="es. Trattoria Da Mario S.r.l."
                    disabled={disabled}
                    required
                    error={billingLengthError(value.legalName, BILLING_FIELD_MAX.legalName)}
                />
            )}

            {isProfessionista && (
                <TextInput
                    label="Nome ditta (opzionale)"
                    value={value.legalName}
                    onChange={e => onChange({ legalName: e.target.value })}
                    placeholder="es. Studio Rossi"
                    disabled={disabled}
                    error={billingLengthError(value.legalName, BILLING_FIELD_MAX.legalName)}
                />
            )}

            {value.entityType !== "" && (
                <TextInput
                    label={isAssociazione ? "Partita IVA (opzionale)" : "Partita IVA"}
                    value={value.vatNumber}
                    onChange={e => onChange({ vatNumber: e.target.value })}
                    placeholder="11 cifre"
                    disabled={disabled}
                    required={!isAssociazione}
                    error={vatError}
                    inputMode="numeric"
                />
            )}

            {value.entityType !== "" && (
                <TextInput
                    label={isSocieta ? "Codice fiscale (opzionale)" : "Codice fiscale"}
                    value={value.fiscalCode}
                    onChange={e => onChange({ fiscalCode: e.target.value })}
                    placeholder={isProfessionista ? "16 caratteri" : "11 cifre"}
                    disabled={disabled}
                    required={!isSocieta}
                    error={fiscalError}
                />
            )}

            {value.entityType !== "" && (
                <div className={styles.subSection}>
                    <Text variant="body-sm" weight={600}>Sede legale</Text>
                    <div className={styles.addressGrid}>
                        <TextInput
                            label="Indirizzo (via)"
                            value={value.address}
                            onChange={e => onChange({ address: e.target.value })}
                            placeholder="es. Via Roma"
                            disabled={disabled}
                            required
                            containerClassName={styles.addressFull}
                            error={billingLengthError(value.address, BILLING_FIELD_MAX.address)}
                        />
                        <TextInput
                            label="Civico (opzionale)"
                            value={value.streetNumber}
                            onChange={e => onChange({ streetNumber: e.target.value })}
                            placeholder="es. 12"
                            disabled={disabled}
                            error={billingLengthError(value.streetNumber, BILLING_FIELD_MAX.streetNumber)}
                        />
                        <TextInput
                            label="CAP"
                            value={value.postalCode}
                            onChange={e => onChange({ postalCode: e.target.value })}
                            placeholder="es. 20121"
                            disabled={disabled}
                            required
                            inputMode="numeric"
                            error={
                                value.postalCode.trim().length > 0 && !isValidCapIT(value.postalCode)
                                    ? "Inserisci un CAP valido (5 cifre)"
                                    : undefined
                            }
                        />
                        <TextInput
                            label="Comune"
                            value={value.city}
                            onChange={e => onChange({ city: e.target.value })}
                            placeholder="es. Milano"
                            disabled={disabled}
                            required
                            containerClassName={styles.addressFull}
                            error={billingLengthError(value.city, BILLING_FIELD_MAX.city)}
                        />
                        <TextInput
                            label="Provincia"
                            value={value.province}
                            onChange={e => onChange({ province: e.target.value })}
                            placeholder="es. MI"
                            disabled={disabled}
                            required
                            error={
                                value.province.trim().length > 0 && !isValidProvinciaIT(value.province)
                                    ? "Inserisci una sigla provincia valida (es. MI)"
                                    : undefined
                            }
                        />
                    </div>
                </div>
            )}

            {value.entityType !== "" && (
                <div className={styles.subSection}>
                    <Text variant="body-sm" weight={600}>
                        {recipientRequired ? "Recapito fattura" : "Recapito fattura (opzionale)"}
                    </Text>
                    <span className={styles.hint}>
                        {recipientRequired
                            ? "Con la Partita IVA è obbligatorio: inserisci il Codice Destinatario SDI oppure la PEC per la fatturazione elettronica."
                            : "Inserisci il Codice Destinatario SDI oppure la PEC per la fatturazione elettronica."}
                    </span>
                    <div className={styles.formStack}>
                        <TextInput
                            label="Codice Destinatario SDI"
                            value={value.codiceDestinatario}
                            onChange={e => onChange({ codiceDestinatario: e.target.value })}
                            placeholder="7 caratteri"
                            disabled={disabled}
                            error={codiceDestinatarioError}
                        />
                        <TextInput
                            label="PEC"
                            type="email"
                            value={value.pec}
                            onChange={e => onChange({ pec: e.target.value })}
                            placeholder="es. nome@pec.it"
                            disabled={disabled}
                            error={billingLengthError(value.pec, BILLING_FIELD_MAX.pec)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
