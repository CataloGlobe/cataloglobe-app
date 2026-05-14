import React, { useCallback } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import type { ActivityFee, ActivityFeeKey } from "@/types/activity";
import { FEE_DEFINITIONS } from "@/constants/activityFees";
import styles from "./FeesSection.module.scss";

export type FeesState = Record<ActivityFeeKey, string>;

const NUMERIC_INPUT_RE = /^[0-9]*[.,]?[0-9]*$/;

export function feesToState(fees: ActivityFee[] | null | undefined): FeesState {
    const next: FeesState = {
        coperto: "",
        servizio: "",
        prenotazione_minima: "",
        spesa_minima: "",
        eta_minima: ""
    };
    if (!fees) return next;
    for (const fee of fees) {
        if (fee.key in next) {
            next[fee.key] = fee.value ?? "";
        }
    }
    return next;
}

export function buildFeesPayload(state: FeesState): ActivityFee[] {
    return FEE_DEFINITIONS.map(def => {
        const raw = state[def.key]?.trim() ?? "";
        if (!raw || raw === "0") return null;
        return { key: def.key, value: raw };
    }).filter((x): x is ActivityFee => x !== null);
}

export function feesStateEqual(a: FeesState, b: FeesState): boolean {
    return FEE_DEFINITIONS.every(def => a[def.key] === b[def.key]);
}

interface FeesSectionProps {
    value: FeesState;
    onChange: (next: FeesState) => void;
    disabled?: boolean;
}

export const FeesSection: React.FC<FeesSectionProps> = ({
    value,
    onChange,
    disabled
}) => {
    const handleChange = useCallback(
        (key: ActivityFeeKey, raw: string) => {
            const normalized = raw.replace(/\s/g, "");
            if (normalized && !NUMERIC_INPUT_RE.test(normalized)) {
                return;
            }
            onChange({ ...value, [key]: normalized });
        },
        [value, onChange]
    );

    return (
        <div>
            <div className={styles.feeList}>
                {FEE_DEFINITIONS.map(def => (
                    <div key={def.key} className={styles.feeRow}>
                        <label
                            htmlFor={`fee-${def.key}`}
                            className={styles.feeLabel}
                        >
                            {def.label}
                        </label>
                        <div className={styles.feeInputWrap}>
                            <TextInput
                                id={`fee-${def.key}`}
                                type="text"
                                inputMode="decimal"
                                placeholder={def.placeholder}
                                value={value[def.key]}
                                disabled={disabled}
                                onChange={e =>
                                    handleChange(def.key, e.target.value)
                                }
                                endAdornment={
                                    <span className={styles.unitBadge}>
                                        {def.unit}
                                    </span>
                                }
                                containerClassName={styles.feeInputContainer}
                            />
                        </div>
                    </div>
                ))}
            </div>
            <Text
                as="p"
                variant="body-sm"
                colorVariant="muted"
                className={styles.hint}
            >
                Le tariffe non compilate non verranno mostrate nella pagina pubblica.
            </Text>
        </div>
    );
};
