import React from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import styles from "./EmptyState.module.scss";

/**
 * EmptyState — «qui non c'è niente, e adesso?» (design system §5, regola 4).
 * Non esiste un vuoto senza risposta: il contenitore che lo ospita resta.
 *
 * - `page` (default): al centro della superficie, icona 32, titolo
 *   `title-sm`, una riga `body-sm` muta, slot `children`, azione obbligatoria
 *   (in dev, senza `action` avvisa).
 * - `inline`: dentro una card o una sezione, compatto (padding 24, icona 20),
 *   azione opzionale. `compact` è un alias deprecato di `inline`.
 * - `filtered`: la lista esiste ma il filtro non trova nulla: niente icona,
 *   una riga + «Azzera filtri» (`onClearFilters`) o un'azione custom.
 */
export type EmptyStateVariant = "page" | "inline" | "filtered";

interface EmptyStateProps {
    /** Icona (lucide/tabler). La misura la impone la variante: 32 in `page`, 20 in `inline`. */
    icon?: React.ReactNode;
    title: string;
    description?: string;
    /** Azione primaria. Obbligatoria in `page` (regola 4), opzionale altrove. */
    action?: React.ReactNode;
    /** Slot fra descrizione e azione (es. le righe dei ruoli nel Team «solo tu»). */
    children?: React.ReactNode;
    /** `default` è un alias storico di `page`. */
    variant?: EmptyStateVariant | "default";
    /** @deprecated Alias di `variant="inline"`. Si rimuove nel lotto 6. */
    compact?: boolean;
    /** Solo `filtered`: rende il bottone secondario «Azzera filtri». */
    onClearFilters?: () => void;
}

const warned = new Set<string>();
function warnOnce(key: string, message: string) {
    if (!import.meta.env.DEV || warned.has(key)) return;
    warned.add(key);
    console.warn(`[EmptyState] ${message}`);
}

export function EmptyState({
    icon,
    title,
    description,
    action,
    children,
    variant: variantProp,
    compact,
    onClearFilters
}: EmptyStateProps) {
    if (compact) warnOnce("compact", "prop `compact` deprecata: usa variant=\"inline\"");

    const variant: EmptyStateVariant =
        variantProp === "inline" || variantProp === "filtered"
            ? variantProp
            : compact
                ? "inline"
                : "page";

    if (variant === "page" && !action) {
        warnOnce(`page:${title}`, `variant="page" senza azione («${title}»): un vuoto senza risposta è un risultato di filtro (regola 4)`);
    }

    if (variant === "filtered") {
        const clear = action ?? (onClearFilters && (
            <Button variant="secondary" size="sm" onClick={onClearFilters}>
                Azzera filtri
            </Button>
        ));
        return (
            <div className={styles.filtered} role="status">
                <Text as="span" variant="body-sm" colorVariant="muted">
                    {title}
                </Text>
                {clear && <div className={styles.filteredAction}>{clear}</div>}
            </div>
        );
    }

    const isInline = variant === "inline";
    return (
        <div className={`${styles.wrapper} ${isInline ? styles.inline : styles.page}`} role="status">
            {icon && <div className={styles.icon}>{icon}</div>}
            <div className={styles.text}>
                <Text as="h3" variant={isInline ? "body-sm" : "title-sm"} weight={isInline ? 500 : 600} className={styles.title}>
                    {title}
                </Text>
                {description && (
                    <Text variant={isInline ? "caption" : "body-sm"} colorVariant="muted" className={styles.description}>
                        {description}
                    </Text>
                )}
            </div>
            {children && <div className={styles.children}>{children}</div>}
            {action && <div className={styles.action}>{action}</div>}
        </div>
    );
}
