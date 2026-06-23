import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select, type SelectOption } from "@/components/ui/Select/Select";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete/AddressAutocomplete";
import { isValidPartitaIva, isValidCodiceFiscale } from "@/utils/fiscalValidators";
import type { LegalEntityType } from "@/types/tenant";
import styles from "../CreateBusinessWizard.module.scss";

interface StepBillingProps {
    entityType: LegalEntityType | "";
    onEntityTypeChange: (value: LegalEntityType | "") => void;
    legalName: string;
    onLegalNameChange: (value: string) => void;
    vatNumber: string;
    onVatNumberChange: (value: string) => void;
    fiscalCode: string;
    onFiscalCodeChange: (value: string) => void;
    firstName: string;
    onFirstNameChange: (value: string) => void;
    lastName: string;
    onLastNameChange: (value: string) => void;
    pec: string;
    onPecChange: (value: string) => void;
    codiceDestinatario: string;
    onCodiceDestinatarioChange: (value: string) => void;
    billingAddress: AddressResult | null;
    onAddressChange: (next: AddressResult) => void;
    disabled: boolean;
}

const ENTITY_OPTIONS: SelectOption[] = [
    { value: "", label: "Seleziona tipologia…", disabled: true },
    { value: "societa", label: "Società" },
    { value: "professionista", label: "Professionista / Ditta individuale" },
    { value: "associazione", label: "Associazione / Ente" },
];

const EMPTY_ADDRESS: AddressResult = {
    address: "",
    street_number: "",
    postal_code: "",
    city: "",
    province: "",
};

export function StepBilling({
    entityType,
    onEntityTypeChange,
    legalName,
    onLegalNameChange,
    vatNumber,
    onVatNumberChange,
    fiscalCode,
    onFiscalCodeChange,
    firstName,
    onFirstNameChange,
    lastName,
    onLastNameChange,
    pec,
    onPecChange,
    codiceDestinatario,
    onCodiceDestinatarioChange,
    billingAddress,
    onAddressChange,
    disabled,
}: StepBillingProps) {
    const vatError =
        vatNumber.trim().length > 0 && !isValidPartitaIva(vatNumber)
            ? "Partita IVA non valida (11 cifre)."
            : undefined;
    const fiscalError =
        fiscalCode.trim().length > 0 && !isValidCodiceFiscale(fiscalCode)
            ? "Codice fiscale non valido."
            : undefined;

    const isSocieta = entityType === "societa";
    const isProfessionista = entityType === "professionista";
    const isAssociazione = entityType === "associazione";

    // Structured address fields are the source of truth (editable). The
    // autocomplete is only a quick-fill helper that pre-populates them.
    const addr = billingAddress ?? EMPTY_ADDRESS;
    const setAddrField = (field: keyof AddressResult, value: string) => {
        onAddressChange({ ...addr, [field]: value });
    };

    return (
        <div className={styles.stepRoot}>
            <div className={styles.stepHeader}>
                <Text variant="title-sm" weight={700}>Dati di fatturazione</Text>
                <span className={styles.stepSubtitle}>
                    Questi dati intestano le fatture del tuo abbonamento. Puoi modificarli in seguito.
                </span>
            </div>

            <div className={styles.formStack}>
                <Select
                    label="Tipologia intestatario"
                    value={entityType}
                    onChange={e => onEntityTypeChange(e.target.value as LegalEntityType | "")}
                    options={ENTITY_OPTIONS}
                    disabled={disabled}
                    required
                />

                {isProfessionista && (
                    <div className={styles.fieldRow}>
                        <TextInput
                            label="Nome"
                            value={firstName}
                            onChange={e => onFirstNameChange(e.target.value)}
                            placeholder="es. Mario"
                            disabled={disabled}
                            required
                        />
                        <TextInput
                            label="Cognome"
                            value={lastName}
                            onChange={e => onLastNameChange(e.target.value)}
                            placeholder="es. Rossi"
                            disabled={disabled}
                            required
                        />
                    </div>
                )}

                {(isSocieta || isAssociazione) && (
                    <TextInput
                        label={isAssociazione ? "Denominazione" : "Ragione sociale"}
                        value={legalName}
                        onChange={e => onLegalNameChange(e.target.value)}
                        placeholder="es. Trattoria Da Mario S.r.l."
                        disabled={disabled}
                        required
                    />
                )}

                {isProfessionista && (
                    <TextInput
                        label="Nome ditta (opzionale)"
                        value={legalName}
                        onChange={e => onLegalNameChange(e.target.value)}
                        placeholder="es. Studio Rossi"
                        disabled={disabled}
                    />
                )}

                {entityType !== "" && (
                    <TextInput
                        label={isAssociazione ? "Partita IVA (opzionale)" : "Partita IVA"}
                        value={vatNumber}
                        onChange={e => onVatNumberChange(e.target.value)}
                        placeholder="11 cifre"
                        disabled={disabled}
                        required={!isAssociazione}
                        error={vatError}
                        inputMode="numeric"
                    />
                )}

                {entityType !== "" && (
                    <TextInput
                        label={isSocieta ? "Codice fiscale (opzionale)" : "Codice fiscale"}
                        value={fiscalCode}
                        onChange={e => onFiscalCodeChange(e.target.value)}
                        placeholder={isProfessionista ? "16 caratteri" : "11 cifre"}
                        disabled={disabled}
                        required={!isSocieta}
                        error={fiscalError}
                    />
                )}
            </div>

            {entityType !== "" && (
                <div className={styles.billingSection}>
                    <Text variant="body-sm" weight={600}>Sede legale</Text>
                    <span className={styles.stepSubtitle}>
                        Cerca l'indirizzo per compilare in automatico, poi correggi i campi se serve.
                    </span>

                    <AddressAutocomplete
                        onSelect={onAddressChange}
                        placeholder="Es. Via Roma 1, Milano"
                        disabled={disabled}
                    />

                    <div className={styles.addressGrid}>
                        <TextInput
                            label="Indirizzo (via)"
                            value={addr.address}
                            onChange={e => setAddrField("address", e.target.value)}
                            placeholder="es. Via Roma"
                            disabled={disabled}
                            required
                            containerClassName={styles.addressFull}
                        />
                        <TextInput
                            label="Civico (opzionale)"
                            value={addr.street_number}
                            onChange={e => setAddrField("street_number", e.target.value)}
                            placeholder="es. 12"
                            disabled={disabled}
                        />
                        <TextInput
                            label="CAP"
                            value={addr.postal_code}
                            onChange={e => setAddrField("postal_code", e.target.value)}
                            placeholder="es. 20121"
                            disabled={disabled}
                            required
                            inputMode="numeric"
                        />
                        <TextInput
                            label="Comune"
                            value={addr.city}
                            onChange={e => setAddrField("city", e.target.value)}
                            placeholder="es. Milano"
                            disabled={disabled}
                            required
                            containerClassName={styles.addressFull}
                        />
                        <TextInput
                            label="Provincia"
                            value={addr.province}
                            onChange={e => setAddrField("province", e.target.value)}
                            placeholder="es. MI"
                            disabled={disabled}
                            required
                        />
                    </div>
                </div>
            )}

            {entityType !== "" && (
                <div className={styles.billingSection}>
                    <Text variant="body-sm" weight={600}>Recapito fattura (opzionale)</Text>
                    <span className={styles.stepSubtitle}>
                        Inserisci il Codice Destinatario SDI oppure la PEC per la fatturazione elettronica.
                    </span>

                    <div className={styles.formStack}>
                        <TextInput
                            label="Codice Destinatario SDI"
                            value={codiceDestinatario}
                            onChange={e => onCodiceDestinatarioChange(e.target.value)}
                            placeholder="7 caratteri"
                            disabled={disabled}
                        />
                        <TextInput
                            label="PEC"
                            type="email"
                            value={pec}
                            onChange={e => onPecChange(e.target.value)}
                            placeholder="es. nome@pec.it"
                            disabled={disabled}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
