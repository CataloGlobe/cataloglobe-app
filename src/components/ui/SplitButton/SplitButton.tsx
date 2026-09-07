// ============================================================
// <SplitButton>
//
// Pattern unico per le azioni della banda header: l'ultima azione
// del gruppo è sempre un bottone pieno cliccabile (la primaria
// della pagina); le precedenti, se ci sono, vivono in un menu
// aperto dal caret affiancato.
//
// Con una sola azione il caret non compare affatto — è un normale
// bottone primario, nessuna soglia e nessuna variante per pagina.
// ============================================================

import React, { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@components/ui/Button/Button";
import { Menu } from "@components/ui/Menu";
import styles from "./SplitButton.module.scss";

export interface SplitButtonAction {
    label: string;
    onClick?: () => void;
    icon?: React.ComponentType<{ size?: number }>;
    disabled?: boolean;
    variant?: "default" | "destructive";
    /**
     * Solo sull'azione primaria: il bottone apre questo sottomenu invece di
     * eseguire `onClick`. Serve ai casi in cui la primaria non ha un bersaglio
     * implicito e va scelto (es. "Nuova regola" sulla tab "Tutte", dove il tipo
     * di regola non è deducibile dal filtro attivo).
     */
    items?: SplitButtonAction[];
}

interface SplitButtonProps {
    /** Ultima = azione primaria (bottone pieno). Le precedenti finiscono nel caret. */
    actions: SplitButtonAction[];
    /** Spinner sulla primaria. */
    loading?: boolean;
    /** Disabilita l'intero gruppo, primaria e caret. */
    disabled?: boolean;
    className?: string;
    /** Nome accessibile del caret. Default: "Altre azioni". */
    menuLabel?: string;
}

/** Il caret è un trigger Radix (`asChild`) e deve quindi inoltrare il ref. */
const CaretTrigger = forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(({ label, className, ...rest }, ref) => (
    <button
        ref={ref}
        type="button"
        aria-label={label}
        className={`${styles.caret} ${className ?? ""}`}
        {...rest}
    >
        <ChevronDown size={16} aria-hidden />
    </button>
));
CaretTrigger.displayName = "SplitButtonCaret";

function renderMenuItems(actions: SplitButtonAction[]) {
    return actions.map(action => (
        <Menu.Item
            key={action.label}
            icon={action.icon}
            variant={action.variant}
            disabled={action.disabled}
            onSelect={action.onClick}
        >
            {action.label}
        </Menu.Item>
    ));
}

export function SplitButton({
    actions,
    loading = false,
    disabled = false,
    className,
    menuLabel = "Altre azioni"
}: SplitButtonProps) {
    if (actions.length === 0) return null;

    const primary = actions[actions.length - 1];
    // Ordine di lettura preservato: le secondarie restano nella sequenza in cui
    // la pagina le ha dichiarate, non invertite.
    const secondary = actions.slice(0, -1);
    const hasCaret = secondary.length > 0;

    const primaryButton = (
        <Button
            variant="primary"
            loading={loading}
            disabled={disabled || primary.disabled}
            leftIcon={primary.icon ? <primary.icon size={16} /> : undefined}
            onClick={primary.items ? undefined : primary.onClick}
            className={`${styles.primary} ${hasCaret ? styles.primaryWithCaret : ""}`}
        >
            {primary.label}
        </Button>
    );

    return (
        <div className={`${styles.root} ${className ?? ""}`}>
            {primary.items ? (
                <Menu trigger={primaryButton} align="end">
                    {renderMenuItems(primary.items)}
                </Menu>
            ) : (
                primaryButton
            )}

            {hasCaret && (
                <Menu
                    trigger={<CaretTrigger label={menuLabel} disabled={disabled} />}
                    align="end"
                >
                    {renderMenuItems(secondary)}
                </Menu>
            )}
        </div>
    );
}
