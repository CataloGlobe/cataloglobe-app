import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconChevronDown } from "@tabler/icons-react";
import Text from "../Text/Text";
import styles from "./SplitButton.module.scss";

export interface SplitButtonOption {
    label: string;
    onClick: () => void;
}

interface SplitButtonProps {
    primaryLabel: string;
    onPrimaryClick: () => void;
    options: SplitButtonOption[];
    loading?: boolean;
    disabled?: boolean;
    size?: "sm" | "md" | "lg";
}

export function SplitButton({
    primaryLabel,
    onPrimaryClick,
    options,
    loading = false,
    disabled = false,
    size = "md"
}: SplitButtonProps) {
    const [open, setOpen] = useState(false);
    const isDisabled = disabled || loading;

    return (
        <DropdownMenu.Root open={open} onOpenChange={setOpen}>
            <div
                className={`${styles.wrapper} ${styles[`size-${size}`]} ${
                    isDisabled ? styles.disabled : ""
                }`}
                data-open={open}
            >
                {/* Primary */}
                <button
                    type="button"
                    className={styles.primary}
                    onClick={onPrimaryClick}
                    disabled={isDisabled}
                    aria-busy={loading || undefined}
                >
                    {loading && <span className={styles.spinner} aria-hidden />}
                    <Text as="span" variant="button" weight={600} className={styles.label}>
                        {primaryLabel}
                    </Text>
                </button>

                {/* Chevron */}
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
                        disabled={isDisabled}
                        aria-label="Altre azioni"
                        aria-expanded={open}
                    >
                        <IconChevronDown
                            size={13}
                            strokeWidth={2.5}
                            className={styles.chevronIcon}
                        />
                    </button>
                </DropdownMenu.Trigger>
            </div>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className={styles.content}
                    side="top"
                    align="end"
                    sideOffset={4}
                >
                    {options.map(option => (
                        <DropdownMenu.Item
                            key={option.label}
                            className={styles.item}
                            onSelect={e => {
                                e.preventDefault();
                                option.onClick();
                            }}
                        >
                            {option.label}
                        </DropdownMenu.Item>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
