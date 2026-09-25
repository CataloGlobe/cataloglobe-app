import { memo, useId, type KeyboardEvent, type ReactElement } from "react";
import clsx from "clsx";
import Text from "../Text/Text";
import { Chip, type ChipShape } from "./Chip";
import styles from "./ChipGroup.module.scss";

/**
 * ChipGroupSingle / ChipGroupMultiple — scheda «Chip». Erano
 * `PillGroupSingle` / `PillGroupMultiple` (re-export deprecati in
 * `ui/PillGroup`), stesse props e stesso comportamento da tastiera.
 */

export type ChipOption<T extends string> = {
    value: T;
    label: string;
    /** Conteggio a vista accanto al label. */
    count?: number;
    /** Spento, non nascosto: a zero la voce resta nella fila (si salta con le frecce). */
    disabled?: boolean;
    tone?: "warning";
};

export type ChipGroupLayout = "auto" | "equal" | "stretch";

export interface ChipGroupSingleProps<T extends string> {
    options: readonly ChipOption<T>[];
    label?: string;
    value: T | undefined;
    onChange: (value: T) => void;
    ariaLabel: string;
    layout?: ChipGroupLayout;
    /** @deprecated Solo `pill` è nel sistema. Default storico `rounded`, invariato. */
    shape?: ChipShape;
}

function ChipGroupSingleInner<T extends string>({
    options,
    value,
    label,
    onChange,
    ariaLabel,
    layout = "equal",
    shape = "rounded"
}: ChipGroupSingleProps<T>) {
    const values = options.map(o => o.value);
    const currentIndex = value ? values.indexOf(value) : -1;

    const groupId = useId();
    const labelId = label ? `${groupId}-label` : undefined;

    function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        if (values.length === 0) return;

        let step: number;
        switch (e.key) {
            case "ArrowRight":
            case "ArrowDown":
                step = 1;
                break;
            case "ArrowLeft":
            case "ArrowUp":
                step = -1;
                break;
            default:
                return;
        }

        e.preventDefault();
        // Le voci spente si saltano.
        let nextIndex = currentIndex;
        for (let i = 0; i < values.length; i++) {
            nextIndex =
                nextIndex === -1
                    ? step === 1 ? 0 : values.length - 1
                    : (nextIndex + step + values.length) % values.length;
            if (!options[nextIndex].disabled) {
                onChange(values[nextIndex]);
                return;
            }
        }
    }

    return (
        <div className={styles.wrapper}>
            {label && (
                <Text as="label" variant="body-sm" weight={500} htmlFor={labelId}>
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
                    const selected = opt.value === value;

                    return (
                        <div
                            key={opt.value}
                            role="radio"
                            aria-checked={selected}
                            aria-disabled={opt.disabled || undefined}
                            tabIndex={selected || value === undefined ? 0 : -1}
                        >
                            <Chip
                                label={opt.label}
                                count={opt.count}
                                tone={opt.tone}
                                disabled={opt.disabled}
                                selected={selected}
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

export const ChipGroupSingle = memo(ChipGroupSingleInner) as <T extends string>(
    props: ChipGroupSingleProps<T>
) => ReactElement;

export interface ChipGroupMultipleProps<T extends string> {
    options: readonly ChipOption<T>[];
    value: readonly T[];
    label?: string;
    onChange: (value: readonly T[]) => void;
    ariaLabel: string;
    layout?: ChipGroupLayout;
    /** @deprecated Solo `pill` è nel sistema. Default storico `rounded`, invariato. */
    shape?: "pill" | "rounded" | "circle";
}

function ChipGroupMultipleInner<T extends string>({
    options,
    value,
    label,
    onChange,
    ariaLabel,
    layout = "equal",
    shape = "rounded"
}: ChipGroupMultipleProps<T>) {
    const groupId = useId();
    const labelId = label ? `${groupId}-label` : undefined;
    function toggle(v: T) {
        onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
    }

    return (
        <div className={styles.wrapper}>
            {label && (
                <Text as="label" variant="body-sm" weight={500} htmlFor={labelId}>
                    {label}
                </Text>
            )}

            <div role="group" aria-label={ariaLabel} className={clsx(styles.group, styles[layout])}>
                {options.map(opt => {
                    const selected = value.includes(opt.value);

                    return (
                        <div key={opt.value} role="checkbox" aria-checked={selected}>
                            <Chip label={opt.label} selected={selected} shape={shape} onClick={() => toggle(opt.value)} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const ChipGroupMultiple = memo(ChipGroupMultipleInner) as <T extends string>(
    props: ChipGroupMultipleProps<T>
) => ReactElement;
