import React from "react";
import { MoreHorizontal } from "lucide-react";
import { Menu } from "@/components/ui/Menu/Menu";
import { IconButton } from "@/components/ui/Button/IconButton";
import Text from "@/components/ui/Text/Text";
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
    /** Titolo piccolo sopra la voce, dopo un divisore: «Importa» (D173). */
    group?: string;
    /** La spiegazione più lunga: una «i» col tooltip in coda alla voce (D173). */
    info?: string;
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
    // Se una voce ha l'icona, quelle senza tengono il posto: le etichette
    // partono tutte dallo stesso filo.
    const anyIcon = visibleActions.some(a => a.icon);

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
                    {(action.separator || action.group) && index > 0 && <Menu.Separator />}
                    {action.group && (
                        <Menu.Label>
                            <Text as="span" variant="caption-xs" weight={600} colorVariant="muted">
                                {action.group}
                            </Text>
                        </Menu.Label>
                    )}
                    <Menu.Item
                        icon={action.icon}
                        leading={anyIcon && !action.icon ? <span className={styles.iconSlot} aria-hidden /> : undefined}
                        variant={action.variant === "destructive" ? "destructive" : action.variant === "accent" ? "accent" : "default"}
                        onSelect={action.onClick}
                        disabled={action.disabled}
                        description={action.description}
                        info={action.info}
                    >
                        {action.label}
                    </Menu.Item>
                </React.Fragment>
            ))}
        </Menu>
    );
}
