import { KeyboardEvent, memo } from "react";
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

export interface PillGroupSingleProps<T extends string> {
    options: readonly PillOption<T>[];
    label?: string;
    value: T | undefined;
    onChange: (value: T) => void;
    ariaLabel: string;
    layout?: PillGroupLayout;
    shape?: "pill" | "rounded" | "square" | "circle";
}

function PillGroupSingleInner<T extends string>({
    options,
    value,
    label,
    onChange,
    ariaLabel,
    layout = "equal",
    shape = "rounded"
}: PillGroupSingleProps<T>) {
    const values = options.map(o => o.value);
    const currentIndex = value ? values.indexOf(value) : -1;

    const groupId = useId();
    const labelId = label ? `${groupId}-label` : undefined;

    function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        if (values.length === 0) return;

        let nextIndex = currentIndex;

        switch (e.key) {
            case "ArrowRight":
            case "ArrowDown":
                nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % values.length;
                break;

            case "ArrowLeft":
            case "ArrowUp":
                nextIndex =
                    currentIndex === -1
                        ? values.length - 1
                        : (currentIndex - 1 + values.length) % values.length;
                break;

            default:
                return;
        }

        e.preventDefault();
        onChange(values[nextIndex]);
    }

    return (
        <div className={styles.wrapper}>
            {label && (
                <Text as="label" variant="caption" weight={600} htmlFor={labelId}>
                    {label}
                </Text>
            )}
            <div
                role="radiogroup"
                aria-label={ariaLabel}
                className={clsx(styles.group, styles[layout])}
                onKeyDown={handleKeyDown}
            >
                {options.map(opt => {
                    const active = opt.value === value;

                    return (
                        <div
                            key={opt.value}
                            role="radio"
                            aria-checked={active}
                            tabIndex={active || value === undefined ? 0 : -1}
                        >
                            <Pill
                                label={opt.label}
                                active={active}
                                shape={shape}
                                onClick={() => onChange(opt.value)}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const PillGroupSingle = memo(PillGroupSingleInner) as <T extends string>(
    props: PillGroupSingleProps<T>
) => ReactElement;
