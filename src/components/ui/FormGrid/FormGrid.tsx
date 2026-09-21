import { useEffect, useRef, type ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./FormGrid.module.scss";

/**
 * FormGrid — il layout del form, che le pagine non devono più scrivere
 * (design system §5, scheda FormGrid).
 *
 * Risponde a «come si dispongono questi campi?»: 1 o 2 colonne, sezioni con
 * un titolo. Gap 16 fra campi e fra righe, 24 fra sezioni; sotto 768 sempre
 * una colonna. I campi restano `FormField`: qui non c'è stato, i campi hanno
 * il loro. Un campo che occupa tutta la riga porta `FORM_GRID_CLASSES.span`.
 */

/** Classi da applicare ai figli del grid (stesso pattern di DATA_TABLE_CLASSES). */
export const FORM_GRID_CLASSES = {
    /** Il campo occupa tutta la riga, anche a 2 colonne. */
    span: styles.span
} as const;

const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

export interface FormGridProps {
    /** 1 (drawer sm/md) o 2 (drawer lg, pagina). Sotto 768 è sempre 1. */
    cols?: 1 | 2;
    /**
     * Porta il focus sul primo campo al mount: il primo campo di un drawer
     * CRUD riceve il focus. Off di default (le pagine non rubano il focus).
     */
    autoFocus?: boolean;
    className?: string;
    children: ReactNode;
}

export function FormGrid({ cols = 1, autoFocus = false, className, children }: FormGridProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!autoFocus) return;
        const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
        first?.focus({ preventScroll: true });
    }, [autoFocus]);

    return (
        <div ref={ref} className={[styles.grid, cols === 2 ? styles.cols2 : "", className ?? ""].join(" ").trim()}>
            {children}
        </div>
    );
}

export interface FormSectionProps {
    /** Titolo `title-sm` della sezione. */
    title: string;
    /** Una riga `caption` muta sotto il titolo. */
    description?: string;
    className?: string;
    /** Di solito un `FormGrid`. */
    children: ReactNode;
}

/**
 * FormSection — un titolo e una riga muta sopra una griglia di campi.
 * Due sezioni adiacenti distano 24.
 */
export function FormSection({ title, description, className, children }: FormSectionProps) {
    return (
        <section className={`${styles.section} ${className ?? ""}`.trim()}>
            <div className={styles.sectionHeader}>
                <Text as="h3" variant="title-sm" weight={600}>
                    {title}
                </Text>
                {description && (
                    <Text variant="caption" colorVariant="muted">
                        {description}
                    </Text>
                )}
            </div>
            {children}
        </section>
    );
}
