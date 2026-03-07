import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import styles from "./TableRowActions.module.scss";

export interface TableRowAction {
    label: string;
    icon?: React.ComponentType<{ size?: number }>;
    onClick?: () => void;
    variant?: "destructive";
    separator?: boolean;
    hidden?: boolean;
}

interface TableRowActionsProps {
    actions: TableRowAction[];
}

export function TableRowActions({ actions }: TableRowActionsProps) {
    const visibleActions = actions.filter(a => !a.hidden);

    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    className={styles.trigger}
                    aria-label="Azioni"
                    onClick={e => e.stopPropagation()}
                >
                    <MoreHorizontal size={16} />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className={styles.content}
                    align="end"
                    sideOffset={4}
                >
                    {visibleActions.map((action, index) => (
                        <React.Fragment key={index}>
                            {action.separator && index > 0 && (
                                <DropdownMenu.Separator className={styles.separator} />
                            )}
                            <DropdownMenu.Item
                                className={`${styles.item}${action.variant === "destructive" ? ` ${styles.danger}` : ""}`}
                                onClick={action.onClick}
                            >
                                {action.icon && <action.icon size={14} />}
                                {action.label}
                            </DropdownMenu.Item>
                        </React.Fragment>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
