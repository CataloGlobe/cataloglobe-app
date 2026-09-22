import React, { useCallback } from "react";
import { FormGrid } from "@/components/ui/FormGrid/FormGrid";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import type { ActivityFeeKey } from "@/types/activity";
import { FEE_DEFINITIONS } from "@/constants/activityFees";
import type { FeesState } from "./feesState";

const NUMERIC_INPUT_RE = /^[0-9]*[.,]?[0-9]*$/;

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
        <FormGrid cols={2}>
            {FEE_DEFINITIONS.map(def => (
                <TextInput
                    key={def.key}
                    id={`fee-${def.key}`}
                    type="text"
                    inputMode="decimal"
                    label={def.label}
                    placeholder="—"
                    value={value[def.key]}
                    disabled={disabled}
                    onChange={e => handleChange(def.key, e.target.value)}
                    endAdornment={
                        <Text as="span" variant="caption" colorVariant="muted">
                            {def.unit}
                        </Text>
                    }
                />
            ))}
        </FormGrid>
    );
};
