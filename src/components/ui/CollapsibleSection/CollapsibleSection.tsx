import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import Text from "@/components/ui/Text/Text";

import styles from "./CollapsibleSection.module.scss";

/**
 * Sezione richiudibile generica, per raggruppare campi secondari dentro un
 * form senza appesantire il caso comune (compilazione base). Nessuna
 * dipendenza nuova — solo state locale + icona.
 */
export interface CollapsibleSectionProps {
    label: string;
    defaultOpen?: boolean;
    children: ReactNode;
}

export function CollapsibleSection({
    label,
    defaultOpen = false,
    children
}: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={styles.wrapper}>
            <button
                type="button"
                className={styles.trigger}
                onClick={() => setIsOpen(o => !o)}
                aria-expanded={isOpen}
            >
                <Text variant="body-sm" weight={600}>
                    {label}
                </Text>
                <ChevronDown
                    size={16}
                    className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
                />
            </button>
            {isOpen && <div className={styles.content}>{children}</div>}
        </div>
    );
}
