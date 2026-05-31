import React, { type ReactNode } from "react";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import styles from "./Menu.module.scss";

type MenuAlign = "start" | "end";
type MenuSide = "top" | "bottom";

interface MenuProps {
    trigger: ReactNode;
    children: ReactNode;
    align?: MenuAlign;
    side?: MenuSide;
}

export function Menu({ trigger, children, align = "start", side = "bottom" }: MenuProps) {
    return (
        <RadixDropdownMenu.Root>
            <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
            <RadixDropdownMenu.Portal>
                <RadixDropdownMenu.Content
                    className={styles.content}
                    align={align}
                    side={side}
                    sideOffset={6}
                >
                    {children}
                </RadixDropdownMenu.Content>
            </RadixDropdownMenu.Portal>
        </RadixDropdownMenu.Root>
    );
}

interface MenuItemProps {
    children: ReactNode;
    icon?: React.ComponentType<{ size?: number }>;
    variant?: "default" | "destructive";
    onSelect?: () => void;
    disabled?: boolean;
}

function MenuItem({ children, icon: Icon, variant = "default", onSelect, disabled }: MenuItemProps) {
    return (
        <RadixDropdownMenu.Item
            className={`${styles.item}${variant === "destructive" ? ` ${styles.danger}` : ""}`}
            disabled={disabled}
            onSelect={onSelect}
        >
            {Icon && <Icon size={14} />}
            <span className={styles.itemLabel}>{children}</span>
        </RadixDropdownMenu.Item>
    );
}

function MenuSeparator() {
    return <RadixDropdownMenu.Separator className={styles.separator} />;
}

interface MenuLabelProps {
    children: ReactNode;
}

function MenuLabel({ children }: MenuLabelProps) {
    return <RadixDropdownMenu.Label className={styles.label}>{children}</RadixDropdownMenu.Label>;
}

Menu.Item = MenuItem;
Menu.Separator = MenuSeparator;
Menu.Label = MenuLabel;
