import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { FileInput } from "@/components/ui/Input/FileInput";
import { SUBTYPE_OPTIONS, type BusinessSubtype } from "@/constants/verticalTypes";
import styles from "../CreateBusinessWizard.module.scss";

interface Step1InfoProps {
    name: string;
    onNameChange: (value: string) => void;
    subtype: BusinessSubtype;
    onSubtypeChange: (value: BusinessSubtype) => void;
    logoFile: File | null;
    onLogoChange: (file: File | null) => void;
    disabled: boolean;
}

export function Step1Info({
    name,
    onNameChange,
    subtype,
    onSubtypeChange,
    logoFile,
    onLogoChange,
    disabled,
}: Step1InfoProps) {
    return (
        <div className={styles.stepRoot}>
            <div className={styles.stepHeader}>
                <Text variant="title-sm" weight={700}>Informazioni di base</Text>
                <span className={styles.stepSubtitle}>
                    Inizia con qualche dato sulla tua attività. Potrai modificare tutto in seguito.
                </span>
            </div>

            <div className={styles.formStack}>
                <TextInput
                    label="Nome attività"
                    value={name}
                    onChange={e => onNameChange(e.target.value)}
                    placeholder="es. Trattoria Da Mario"
                    disabled={disabled}
                    required
                />

                <Select
                    label="Tipo di attività"
                    value={subtype}
                    onChange={e => onSubtypeChange(e.target.value as BusinessSubtype)}
                    options={SUBTYPE_OPTIONS}
                    disabled={disabled}
                />

                <FileInput
                    label="Logo (opzionale)"
                    accept="image/png,image/jpeg,image/webp"
                    helperText="PNG, JPG o WEBP — max 5MB."
                    maxSizeMb={5}
                    value={logoFile}
                    onChange={onLogoChange}
                    disabled={disabled}
                />
            </div>
        </div>
    );
}
