import { ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./Card.module.scss";

/**
 * Card — un gruppo di contenuti con un nome e un confine (design system §5).
 * Era `SectionCard`: stessa anatomia, nome nuovo. Header opzionale (titolo
 * `title-sm` · badge · sottotitolo `caption` muto · 0–2 azioni `sm` a destra)
 * + divisore + body. Senza header il body parte in alto e non c'è divisore.
 * Una card non ha hover, focus né lift: se qualcosa è interattivo, lo è il
 * contenuto. Il layout a colonne appartiene alla pagina, non al componente.
 *
 * `tabs`: una `Tabs variant="line"` in una banda a tutta larghezza, a filo
 * sotto la testata, con la baseline di 1 px da bordo a bordo; il body sotto
 * è il pannello della tab attiva.
 *
 * Compatibilità con la vecchia `Card` (title, noHoverLift, className):
 * `title` diventa l'header con titolo; `noHoverLift` è accettato e ignorato
 * (il lift non esiste più per nessuno); `className` va sul contenitore.
 */
export interface CardProps {
    /**
     * Titolo dell'header. Opzionale: ometterlo quando il contenuto porta già la
     * propria intestazione. Se assente — e senza badge/subtitle/actions —
     * l'header (e il suo divisore) non viene renderizzato.
     */
    title?: string;
    /**
     * `id` sul titolo, per chi dà un nome al contenitore della card
     * (`aria-labelledby`): la card resta una `section` senza nome.
     */
    titleId?: string;
    /** Badge/conteggio inline subito dopo il titolo (es. numero varianti). */
    badge?: ReactNode;
    /** Una riga muta che previene errori (es. "Visibili nella pagina pubblica"). */
    subtitle?: string;
    /**
     * 0–2 bottoni `sm` allineati al titolo, a destra. Mai due primary. Un solo
     * `IconButton` resta accanto al titolo anche nelle card strette.
     */
    actions?: ReactNode;
    /** Una `Tabs variant="line"` con la sua `Tabs.List`, sotto la testata. */
    tabs?: ReactNode;
    /** `danger`: cornice rossa e titolo danger per le zone distruttive, body neutro. */
    variant?: "default" | "danger";
    /** Body senza padding orizzontale (righe tabellari, DataTable, collassabili). */
    flush?: boolean;
    /** Classe sul contenitore (larghezza, posizione nella griglia della pagina). */
    className?: string;
    /** Escape hatch sul body — usare con parsimonia. */
    bodyClassName?: string;
    /** @deprecated Il lift al hover non esiste più: la prop è ignorata. Si rimuove nel lotto 6. */
    noHoverLift?: boolean;
    children: ReactNode;
}

const warned = new Set<string>();
function warnDeprecated(key: string, detail: string) {
    if (!import.meta.env.DEV || warned.has(key)) return;
    warned.add(key);
    console.warn(`[Card] ${detail}`);
}

export function Card({
    title,
    titleId,
    badge,
    subtitle,
    actions,
    tabs,
    variant = "default",
    flush = false,
    className,
    bodyClassName,
    noHoverLift,
    children
}: CardProps) {
    if (noHoverLift !== undefined) {
        warnDeprecated("noHoverLift", "prop `noHoverLift` deprecata: la card non ha più lift al hover, la prop è ignorata");
    }
    const hasHeader = Boolean(title || badge || subtitle || actions);
    const rootClasses = [styles.card, variant === "danger" ? styles.danger : "", className]
        .filter(Boolean)
        .join(" ");
    const bodyClasses = [styles.body, flush ? styles.flush : "", bodyClassName].filter(Boolean).join(" ");

    return (
        <section className={rootClasses}>
            {hasHeader && (
                <header className={styles.header}>
                    <div className={styles.headerText}>
                        {(title || badge) && (
                            <span className={styles.titleRow}>
                                {title && (
                                    <Text as="span" id={titleId} variant="title-sm" weight={600} className={styles.title}>
                                        {title}
                                    </Text>
                                )}
                                {badge && <span className={styles.badge}>{badge}</span>}
                            </span>
                        )}
                        {subtitle && (
                            <Text as="span" variant="caption" colorVariant="muted">
                                {subtitle}
                            </Text>
                        )}
                    </div>
                    {actions && <div className={styles.actions}>{actions}</div>}
                </header>
            )}
            {tabs && <div className={styles.tabs}>{tabs}</div>}
            <div className={bodyClasses}>{children}</div>
        </section>
    );
}
