import { type ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import styles from "./StatusStrip.module.scss";

/**
 * StatusStrip — in che stato è *questa pagina*, e qual è l'unica uscita
 * (design system §5, scheda StatusStrip).
 *
 * Anatomia: StatusBadge · titolo body-sm 500 · seconda riga caption muta ·
 * 0–3 cifre (title-md 700 + etichetta caption) · una sola azione (regola 11).
 * Toni = quelli di StatusBadge: success · warning · danger · neutral · info.
 * Non si chiude: resta finché lo stato dura. Sotto l'header di pagina, sopra
 * il contenuto; padding 16 24; bordo 1px del tono (-200); fondo -50.
 *
 * Non per un errore (→ InlineBanner), non dentro un form (→ banner nel
 * drawer), non per una cifra da confrontare (→ StatCard).
 */
export type StatusStripTone = Exclude<StatusBadgeVariant, "pending">;

export interface StatusStripFigure {
    /** Già formattata dal chiamante. */
    value: ReactNode;
    label: string;
}

export interface StatusStripProps {
    tone: StatusStripTone;
    /** La parola del badge: «Attivo», «In prova», «Sospeso». */
    badge: string;
    title: string;
    /** Seconda riga, muta. */
    description?: string;
    /** 0–3 cifre; oltre la terza si tagliano. */
    figures?: StatusStripFigure[];
    /** Una sola azione (Button sm). Il tono `neutral` di norma non ne ha. */
    action?: ReactNode;
    className?: string;
}

export function StatusStrip({ tone, badge, title, description, figures, action, className }: StatusStripProps) {
    const shown = figures?.slice(0, 3) ?? [];
    return (
        <section className={[styles.strip, styles[tone], className ?? ""].join(" ").trim()} role="status" aria-label={title}>
            <div className={styles.main}>
                <StatusBadge variant={tone} label={badge} />
                <div className={styles.text}>
                    <Text as="div" variant="body-sm" weight={500} className={styles.title}>
                        {title}
                    </Text>
                    {description && (
                        <Text as="div" variant="caption" className={styles.description}>
                            {description}
                        </Text>
                    )}
                </div>
            </div>
            {shown.length > 0 && (
                <dl className={styles.figures}>
                    {shown.map(f => (
                        <div key={f.label} className={styles.figure}>
                            <Text as="dd" variant="title-md" weight={700} className={styles.figureValue}>
                                {f.value}
                            </Text>
                            <Text as="dt" variant="caption" className={styles.figureLabel}>
                                {f.label}
                            </Text>
                        </div>
                    ))}
                </dl>
            )}
            {action && <div className={styles.action}>{action}</div>}
        </section>
    );
}
