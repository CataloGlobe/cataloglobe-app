import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button/Button";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import Text from "@/components/ui/Text/Text";
import styles from "../PrezziOpzioniTab.module.scss";
import { describeChoiceRules, type MaxSelectableMode } from "./choiceRules";

type Props = {
    mode: MaxSelectableMode;
    onModeChange: (mode: MaxSelectableMode) => void;
    n: string;
    /** `badInput`: testo che il browser non legge come numero, con `n` = "". */
    onNChange: (n: string, badInput: boolean) => void;
    required: boolean;
    onRequiredChange: (required: boolean) => void;
    expanded: boolean;
    onExpand: () => void;
    disabled?: boolean;
    /** Errore su «Fino a quante?» (N = 1, 0, non intero o non numerico). */
    error?: string | null;
};

/**
 * Regole di scelta di un gruppo Configurazioni — progressive disclosure: una
 * riga di riepilogo e «Modifica le regole», poi due scelte su
 * `SegmentedControl` (erano pillole rifatte a mano, lotto Prodotti P7).
 * «Fino a quante?» compare solo quando il cliente può sceglierne più d'una;
 * vuoto vuol dire senza limite.
 */
export function ChoiceRulesEditor({
    mode,
    onModeChange,
    n,
    onNChange,
    required,
    onRequiredChange,
    expanded,
    onExpand,
    disabled,
    error
}: Props) {
    // Anche su onInput: da "" a «tre» il valore resta "" e React non chiama
    // onChange, ma badInput cambia.
    const reportN = (e: FormEvent<HTMLInputElement>) =>
        onNChange(e.currentTarget.value, e.currentTarget.validity.badInput);
    if (!expanded) {
        return (
            <div className={styles.rulesCollapsed}>
                <Text variant="body-sm" colorVariant="muted">
                    {describeChoiceRules(mode, n, required)}
                </Text>
                <Button variant="ghost" size="sm" onClick={onExpand} disabled={disabled}>
                    Modifica le regole di scelta
                </Button>
            </div>
        );
    }
    return (
        <fieldset className={styles.rulesExpanded} disabled={disabled}>
            <div className={styles.formSection}>
                <Text variant="body-sm" weight={600}>
                    Il cliente può scegliere più opzioni?
                </Text>
                <div className={styles.rulesRow}>
                    <SegmentedControl<MaxSelectableMode>
                        size="sm"
                        value={mode}
                        onChange={onModeChange}
                        options={[
                            { value: "one", label: "No, una sola" },
                            { value: "many", label: "Sì, più d'una" }
                        ]}
                    />
                    {mode === "many" && (
                        <NumberInput
                            aria-label="Fino a quante?"
                            placeholder="Senza limite"
                            min="2"
                            step="1"
                            value={n}
                            onChange={reportN}
                            onInput={reportN}
                            error={error ?? undefined}
                            containerClassName={styles.quantityN}
                        />
                    )}
                </div>
            </div>
            <div className={styles.formSection}>
                <Text variant="body-sm" weight={600}>
                    È obbligatorio scegliere?
                </Text>
                <SegmentedControl<"optional" | "required">
                    size="sm"
                    value={required ? "required" : "optional"}
                    onChange={v => onRequiredChange(v === "required")}
                    options={[
                        { value: "optional", label: "No, è facoltativo" },
                        { value: "required", label: "Sì, per ordinare" }
                    ]}
                />
            </div>
        </fieldset>
    );
}
