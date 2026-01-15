import React, { useEffect, useRef, useState } from "react";
import Text from "@components/ui/Text/Text";
import styles from "./SegmentedControl.module.scss";

interface SegmentedOption<T extends string | number> {
    value: T;
    label: string;
    icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string | number> {
    value: T;
    onChange: (value: T) => void;
    options: SegmentedOption<T>[];
    iconsOnly?: boolean;
}

export function SegmentedControl<T extends string | number>({
    value,
    onChange,
    options,
    iconsOnly
}: SegmentedControlProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Record<T, HTMLButtonElement | null>>(
        {} as Record<T, HTMLButtonElement | null>
    );

    const [hasInteracted, setHasInteracted] = useState(false);
    const [indicatorStyle, setIndicatorStyle] = useState({
        width: 0,
        left: 0
    });

    useEffect(() => {
        const activeEl = itemRefs.current[value];
        const containerEl = containerRef.current;

        if (activeEl && containerEl) {
            setIndicatorStyle({
                width: activeEl.offsetWidth,
                left: activeEl.offsetLeft
            });
        }
    }, [value, options]);

    return (
        <div ref={containerRef} className={styles.wrapper} role="radiogroup">
            <div
                className={`${styles.indicator} ${hasInteracted ? styles.animate : ""}`}
                style={{
                    width: indicatorStyle.width,
                    transform: `translateX(${indicatorStyle.left}px)`
                }}
            />

            {options.map(opt => {
                const isActive = opt.value === value;

                return (
                    <button
                        key={opt.value}
                        ref={el => {
                            itemRefs.current[opt.value] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        className={styles.item}
                        onClick={() => {
                            setHasInteracted(true);
                            onChange(opt.value);
                        }}
                    >
                        {opt.icon}
                        {!iconsOnly && (
                            <Text weight={600} variant="body-sm">
                                {opt.label}
                            </Text>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
