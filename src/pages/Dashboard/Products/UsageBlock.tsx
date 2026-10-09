import type { ReactNode } from "react";
import styles from "./UsageTab.module.scss";

/**
 * Un blocco della parte «Dove si vede» (Officina 3, artifact «Scheda del
 * prodotto»): un titolino e le righe in un riquadro leggero, perché la card
 * col titolo della parte c'è già intorno.
 */
export function UsageBlock({ title, badge, actions, boxed = false, children }: {
    title: string;
    badge?: ReactNode;
    actions?: ReactNode;
    /** Le righe stanno in un riquadro col bordo. */
    boxed?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={styles.block} aria-label={title}>
            <div className={styles.blockHead}>
                <h4>{title}</h4>
                {badge}
                {actions && <div className={styles.blockActions}>{actions}</div>}
            </div>
            {boxed ? <div className={styles.box}>{children}</div> : children}
        </section>
    );
}
