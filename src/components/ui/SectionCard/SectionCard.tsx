import { ReactNode } from "react";
import styles from "./SectionCard.module.scss";

/**
 * Box-sezione unificato del gestionale (variante A compatta, spec approvata).
 * Anatomia: titolo (14px semibold, sentence case — mai maiuscoletto) +
 * sottotitolo opzionale (spiega la sezione a un utente non tecnico) +
 * divisore hairline sempre presente + 0–2 azioni sm in header (1 → secondary,
 * 2 → ghost + secondary; mai due bottoni pieni: il primary della pagina è il
 * Salva in HeaderSaveAction). Il layout a colonne appartiene alla pagina,
 * non al componente. I titoletti in maiuscoletto sopravvivono solo come
 * label di gruppo DENTRO il body (markup del contenuto, non prop).
 */
export interface SectionCardProps {
    title: string;
    /** Una riga che previene errori (es. "Visibili nella pagina pubblica"). */
    subtitle?: string;
    /** 0–2 bottoni `sm` allineati al titolo. */
    actions?: ReactNode;
    /** `danger`: cornice rossa per zone distruttive, body neutro. */
    variant?: "default" | "danger";
    /** Body senza padding orizzontale (righe tabellari, collassabili). */
    flush?: boolean;
    /** Escape hatch — usare con parsimonia: se serve spesso, è la spec da rivedere. */
    bodyClassName?: string;
    children: ReactNode;
}

export function SectionCard({
    title,
    subtitle,
    actions,
    variant = "default",
    flush = false,
    bodyClassName,
    children
}: SectionCardProps) {
    return (
        <section className={`${styles.card} ${variant === "danger" ? styles.danger : ""}`}>
            <header className={styles.header}>
                <div className={styles.headerText}>
                    <span className={styles.title}>{title}</span>
                    {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
                </div>
                {actions && <div className={styles.actions}>{actions}</div>}
            </header>
            <div className={`${styles.body} ${flush ? styles.flush : ""} ${bodyClassName ?? ""}`}>
                {children}
            </div>
        </section>
    );
}
