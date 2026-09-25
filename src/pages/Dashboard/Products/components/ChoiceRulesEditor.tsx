import { Button } from "@/components/ui/Button/Button";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import Text from "@/components/ui/Text/Text";
import styles from "../PrezziOpzioniTab.module.scss";

export type MaxSelectableMode = "one" | "many";

export function parseMaxSelectable(mode: MaxSelectableMode, n: string): number | null {
    if (mode === "one") return 1;
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Frase collassata di riepilogo delle regole di scelta — deve restare
 * coerente coi valori reali del gruppo anche quando il pannello è chiuso
 * (in modifica di un gruppo esistente i default possono non essere quelli
 * di fabbrica "una sola/facoltativo"). */
export function describeChoiceRules(mode: MaxSelectableMode, n: string, required: boolean): string {
    const parsedN = parseMaxSelectable(mode, n);
    const countPart = mode === "one" ? "una sola opzione" : `fino a ${parsedN ?? "più"} opzioni`;
    const requiredPart = required ? "e deve sceglierla per ordinare" : "e può anche non sceglierla";
    return `Il cliente sceglie ${countPart}, ${requiredPart}.`;
}

type Props = {
    mode: MaxSelectableMode;
    onModeChange: (mode: MaxSelectableMode) => void;
    n: string;
    onNChange: (n: string) => void;
    required: boolean;
    onRequiredChange: (required: boolean) => void;
    expanded: boolean;
    onExpand: () => void;
    disabled?: boolean;
};

/**
 * Regole di scelta di un gruppo Configurazioni — progressive disclosure: una
 * riga di riepilogo e «Modifica le regole», poi due scelte su
 * `SegmentedControl` (erano pillole rifatte a mano, lotto Prodotti P7).
 * «Fino a quante?» compare solo quando il cliente può sceglierne più d'una.
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
    disabled
}: Props) {
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
                            placeholder="Fino a quante?"
                            min="2"
                            value={n}
                            onChange={e => onNChange(e.target.value)}
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
