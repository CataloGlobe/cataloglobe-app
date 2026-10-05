import type { ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "../LeadDetail.module.scss";

/**
 * Una sezione della colonna a destra della scheda (V5): titolo piccolo in
 * maiuscoletto, niente cornice, una riga sottile fra una sezione e l'altra.
 * Stesse prop della `Card` che sostituisce (title, badge, actions, flush).
 */
export function FactSection({
    title,
    badge,
    actions,
    flush,
    children
}: {
    title: string;
    badge?: ReactNode;
    actions?: ReactNode;
    flush?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={styles.fact} data-flush={flush || undefined} aria-label={title}>
            <header className={styles.factHead}>
                <Text as="h2" variant="caption-xs" weight={600} className={styles.factTitle}>
                    {title}
                </Text>
                {badge}
                {actions && <span className={styles.factActions}>{actions}</span>}
            </header>
            {children}
        </section>
    );
}
