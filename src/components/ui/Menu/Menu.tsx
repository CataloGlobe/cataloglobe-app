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
    /**
     * Voce che porta altrove invece di eseguire qualcosa: rende un `<a>` vero,
     * così restano il middle-click, "apri in nuova scheda" e l'anteprima
     * dell'URL — un `window.open()` in `onSelect` li perderebbe tutti.
     */
    href?: string;
    target?: string;
}

function MenuItem({
    children,
    icon: Icon,
    variant = "default",
    onSelect,
    disabled,
    href,
    target
}: MenuItemProps) {
    const className = `${styles.item}${variant === "destructive" ? ` ${styles.danger}` : ""}`;
    const content = (
        <>
            {Icon && <Icon size={14} />}
            <span className={styles.itemLabel}>{children}</span>
        </>
    );

    if (href) {
        return (
            <RadixDropdownMenu.Item asChild disabled={disabled}>
                <a
                    className={className}
                    href={href}
                    target={target}
                    rel={target === "_blank" ? "noopener noreferrer" : undefined}
                >
                    {content}
                </a>
            </RadixDropdownMenu.Item>
        );
    }

    return (
        <RadixDropdownMenu.Item className={className} disabled={disabled} onSelect={onSelect}>
            {content}
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
