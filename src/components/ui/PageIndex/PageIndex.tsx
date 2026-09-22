import type { ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./PageIndex.module.scss";

export interface PageIndexSection {
    /** L'`id` dell'elemento di sezione nella pagina (l'ancora). */
    id: string;
    label: string;
    /** Dato di riepilogo muto, a destra: «7 campi», «3 su 7», lo slug. */
    summary?: string;
}

export interface PageIndexProps {
    sections: PageIndexSection[];
    activeId: string | null;
    /** Default: scroll all'ancora. */
    onSelect?: (id: string) => void;
    /** Riga muta in coda: «8 sezioni, un solo Salva». */
    footer?: string;
    "aria-label"?: string;
    className?: string;
}

function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
}

/**
 * L'indice laterale di una pagina lunga (scheda `PageIndex`, §21.2 riga 5,
 * §31.3): dice dove sei e porta dove vuoi andare. Solo con cinque o più
 * sezioni; sotto 1024 non c'è. Le sezioni della pagina portano `id` e
 * `scroll-margin-top`; la corrente arriva da `usePageIndexActive`.
 */
export function PageIndex({ sections, activeId, onSelect, footer, "aria-label": ariaLabel = "In questa pagina", className }: PageIndexProps) {
    return (
        <nav className={[styles.index, className ?? ""].join(" ").trim()} aria-label={ariaLabel}>
            <Text as="span" variant="caption-xs" colorVariant="muted" weight={600} className={styles.eyebrow}>
                In questa pagina
            </Text>
            <ul className={styles.list}>
                {sections.map(section => {
                    const isActive = section.id === activeId;
                    return (
                        <li key={section.id}>
                            <a
                                href={`#${section.id}`}
                                className={[styles.item, isActive ? styles.active : ""].join(" ").trim()}
                                aria-current={isActive ? "location" : undefined}
                                onClick={event => {
                                    event.preventDefault();
                                    (onSelect ?? scrollToSection)(section.id);
                                }}
                            >
                                <Text as="span" variant="body-sm" weight={isActive ? 600 : 500} className={styles.label}>
                                    {section.label}
                                </Text>
                                {section.summary && (
                                    <Text as="span" variant="caption" colorVariant="muted" className={styles.summary}>
                                        {section.summary}
                                    </Text>
                                )}
                            </a>
                        </li>
                    );
                })}
            </ul>
            {footer && (
                <Text as="span" variant="caption" colorVariant="muted" className={styles.footer}>
                    {footer}
                </Text>
            )}
        </nav>
    );
}

export interface PageIndexLayoutProps {
    index: ReactNode;
    children: ReactNode;
    className?: string;
}

/** La colonna dell'indice a sinistra, il contenuto a destra; sotto 1024 solo il contenuto. */
export function PageIndexLayout({ index, children, className }: PageIndexLayoutProps) {
    return (
        <div className={[styles.layout, className ?? ""].join(" ").trim()}>
            <aside className={styles.aside}>{index}</aside>
            <div className={styles.content}>{children}</div>
        </div>
    );
}
