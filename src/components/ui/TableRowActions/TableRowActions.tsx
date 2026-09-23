import React from "react";
import { MoreHorizontal } from "lucide-react";
import { Menu } from "@/components/ui/Menu/Menu";
import { IconButton } from "@/components/ui/Button/IconButton";
import styles from "./TableRowActions.module.scss";

export interface TableRowAction {
    label: string;
    icon?: React.ComponentType<{ size?: number }>;
    onClick?: () => void;
    variant?: "destructive" | "accent";
    separator?: boolean;
    hidden?: boolean;
    /** Voce presente ma spenta: col perché in `description`, invece di sparire. */
    disabled?: boolean;
    description?: string;
}

interface TableRowActionsProps {
    actions: TableRowAction[];
    /** Nome accessibile del «⋯»; default «Azioni». Fuori da una tabella (card) conviene dire di cosa: «Azioni sede». */
    ariaLabel?: string;
}

/**
 * Il «⋯» di una riga di DataTable: un `Menu` (scheda «Menu») ancorato a un
 * `IconButton ghost`. La voce distruttiva va in fondo, dopo un divisore:
 * lo decide chi compone le azioni (`separator: true`). La tabella marca la
 * cella che lo contiene come colonna azioni e la mostra al hover/focus.
 */
export function TableRowActions({ actions, ariaLabel = "Azioni" }: TableRowActionsProps) {
    const visibleActions = actions.filter(a => !a.hidden);

    return (
        <Menu
            align="end"
            trigger={
                <IconButton
                    icon={<MoreHorizontal size={16} />}
                    aria-label={ariaLabel}
                    variant="ghost"
                    size="sm"
                    className={styles.trigger}
                    onClick={e => e.stopPropagation()}
                />
            }
        >
            {visibleActions.map((action, index) => (
                <React.Fragment key={index}>
                    {action.separator && index > 0 && <Menu.Separator />}
                    <Menu.Item
                        icon={action.icon}
                        variant={action.variant === "destructive" ? "destructive" : action.variant === "accent" ? "accent" : "default"}
                        onSelect={action.onClick}
                        disabled={action.disabled}
                        description={action.description}
                    >
                        {action.label}
                    </Menu.Item>
                </React.Fragment>
            ))}
        </Menu>
    );
}
