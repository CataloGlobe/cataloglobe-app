import React, { useEffect, useRef, useState } from "react";
import Text from "@components/ui/Text/Text";
import { Tooltip } from "@components/ui/Tooltip/Tooltip";
import { useHorizontalOverflow } from "@/hooks/useHorizontalOverflow";
import styles from "./SegmentedControl.module.scss";

interface SegmentedOption<T extends string | number> {
    value: T;
    label: string;
    /** Nome accessibile quando `label` è una forma corta del nome intero. */
    ariaLabel?: string;
    icon?: React.ReactNode;
    /** Elencato ma spento (es. «Inviti in attesa» a zero): non si sceglie. */
    disabled?: boolean;
}

interface SegmentedControlProps<T extends string | number> {
    value: T;
    onChange: (value: T) => void;
    options: SegmentedOption<T>[];
    iconsOnly?: boolean;
    /** `sm` = variante compatta per contesti densi (es. header di pagina). Default `md`. */
    size?: "md" | "sm";
    /** Nome del gruppo per chi usa un lettore di schermo. */
    label?: string;
}

export function SegmentedControl<T extends string | number>({
    value,
    onChange,
    options,
    iconsOnly,
    size = "md",
    label
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

    // Come le tab: i segmenti non si comprimono e non vanno a capo — scorrono,
    // con sfumatura sul bordo destro finché resta contenuto oltre il bordo.
    const { atEnd } = useHorizontalOverflow(containerRef, options);

    return (
        <div
            ref={containerRef}
            className={[
                styles.wrapper,
                size === "sm" ? styles.wrapperSm : "",
                !atEnd ? styles.overflowEnd : ""
            ]
                .filter(Boolean)
                .join(" ")}
            role="radiogroup"
            aria-label={label}
        >
            <div
                className={`${styles.indicator} ${hasInteracted ? styles.animate : ""}`}
                style={{
                    width: indicatorStyle.width,
                    transform: `translateX(${indicatorStyle.left}px)`
                }}
            />

            {options.map(opt => {
                const isActive = opt.value === value;

                const item = (
                    <button
                        key={opt.value}
                        ref={el => {
                            itemRefs.current[opt.value] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        disabled={opt.disabled}
                        // In iconsOnly mode il testo non è renderizzato → senza
                        // aria-label il pulsante avrebbe nome accessibile vuoto.
                        // L'etichetta a vista la dà il Tooltip, non il `title`.
                        aria-label={iconsOnly ? opt.label : opt.ariaLabel}
                        className={`${styles.item} ${size === "sm" ? styles.itemSm : ""}`}
                        onClick={() => {
                            setHasInteracted(true);
                            onChange(opt.value);
                        }}
                    >
                        {opt.icon}
                        {!iconsOnly && (
                            <Text weight={500} variant="body-sm" className={styles.itemLabel}>
                                {opt.label}
                            </Text>
                        )}
                    </button>
                );

                return iconsOnly ? (
                    <Tooltip key={opt.value} content={opt.label}>
                        {item}
                    </Tooltip>
                ) : (
                    item
                );
            })}
        </div>
    );
}
