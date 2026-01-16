import { memo } from "react";
import { Pill } from "@/components/ui/Pill/Pill";
import Text from "../Text/Text";
import styles from "./PillGroup.module.scss";
import clsx from "clsx";
import type { ReactElement } from "react";
import { useId } from "react";

export type PillOption<T extends string> = {
    value: T;
    label: string;
};

type PillGroupLayout = "auto" | "equal" | "stretch";

export interface PillGroupMultipleProps<T extends string> {
    options: readonly PillOption<T>[];
    value: readonly T[];
    label?: string;
    onChange: (value: readonly T[]) => void;
    ariaLabel: string;
    layout?: PillGroupLayout;
    shape?: "pill" | "rounded" | "circle";
}

function PillGroupMultipleInner<T extends string>({
    options,
    value,
    label,
    onChange,
    ariaLabel,
    layout = "equal",
    shape = "rounded"
}: PillGroupMultipleProps<T>) {
    const groupId = useId();
    const labelId = label ? `${groupId}-label` : undefined;
    function toggle(v: T) {
        onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
    }

    return (
        <div className={styles.wrapper}>
            {label && (
                <Text as="label" variant="caption" weight={600} htmlFor={labelId}>
                    {label}
                </Text>
            )}

            <div role="group" aria-label={ariaLabel} className={clsx(styles.group, styles[layout])}>
                {options.map(opt => {
                    const active = value.includes(opt.value);

                    return (
                        <div key={opt.value} role="checkbox" aria-checked={active}>
                            <Pill
                                label={opt.label}
                                active={active}
                                shape={shape}
                                onClick={() => toggle(opt.value)}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const PillGroupMultiple = memo(PillGroupMultipleInner) as <T extends string>(
    props: PillGroupMultipleProps<T>
) => ReactElement;
