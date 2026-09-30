import type { ReactNode } from "react";
import { CUSTOMER_LABEL, PHONE_LABEL, PRO_BADGE, WITH_US, type SplitTitle, type UnderlinedTitle } from "@pages/CampaignLanding/content/landing";
import styles from "./Kit.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Nota scritta a mano (Caveat, terracotta) sopra un titolo. */
export function HandNote({
    children,
    size = "md",
    className
}: {
    children: ReactNode;
    size?: "md" | "lg" | "sm" | "form";
    className?: string;
}) {
    return (
        <p className={cx(styles.handP, className)}>
            <span className={cx(styles.hand, styles[`hand-${size}`])}>{children}</span>
        </p>
    );
}

/** Parola sottolineata con un tratto a mano (colore del tratto: --ld-hl-line). */
export function Underlined({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span className={cx(styles.underlined, className)}>
            {children}
            <svg className={styles.stroke} viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <path d="M2 7 C 42 2, 78 9, 118 5 S 178 2, 198 6" />
            </svg>
        </span>
    );
}

export function UnderlinedText({ title, className }: { title: UnderlinedTitle; className?: string }) {
    return (
        <>
            {title.before}
            <Underlined className={className}>{title.underlined}</Underlined>
            {title.after}
        </>
    );
}

/** Titolo h2 a due tempi: la seconda parte in blu, a capo (`block`) o in riga. */
export function SplitHeading({
    title,
    size,
    block = false,
    id,
    className
}: {
    title: SplitTitle;
    size: "problem" | "section";
    block?: boolean;
    id?: string;
    className?: string;
}) {
    return (
        <h2 id={id} className={cx(styles.heading, styles[`heading-${size}`], className)}>
            {title.lead}{" "}
            <span className={cx(styles.accent, block && styles.accentBlock)}>{title.accent}</span>
        </h2>
    );
}

/** Riquadro tratteggiato «Con CataloGlobe» (+ «Piano Pro»). */
export function WithUs({ children, pro = false }: { children: ReactNode; pro?: boolean }) {
    return (
        <div className={styles.withUs}>
            <span className={styles.tags}>
                <span className={styles.tag}>{WITH_US}</span>
                {pro && <span className={cx(styles.tag, styles.tagPro)}>{PRO_BADGE}</span>}
            </span>
            <p className={styles.withUsText}>{children}</p>
        </div>
    );
}

/** Riga di menù: nome, eventuale etichetta, puntini, prezzo vecchio barrato, prezzo. */
export function MenuRow({
    name,
    price,
    oldPrice,
    off = false,
    badge,
    className
}: {
    name: string;
    price: string;
    oldPrice?: string;
    /** Esaurito: nome e prezzo grigi. */
    off?: boolean;
    badge?: string;
    className?: string;
}) {
    return (
        <div className={cx(styles.row, off && styles.rowOff, className)}>
            <span className={styles.rowName}>{name}</span>
            {badge && <span className={cx(styles.badge, styles.pop)}>{badge}</span>}
            <span className={styles.rowLeader} aria-hidden="true" />
            {oldPrice && <span className={styles.rowOld}>{oldPrice}</span>}
            <span className={cx(styles.rowPrice, oldPrice && styles.rowPriceUp)}>{price}</span>
        </div>
    );
}

/**
 * Scheda «dal tuo telefono → il menù del cliente»: sopra il piatto con il suo
 * comando (interruttore, campo prezzo), sotto le righe che vede il cliente dal
 * QR. La usano «Un piatto è finito» (fondo carta sopra) e «Il fornitore
 * aumenta» (fondo carta sotto).
 */
export function PhoneQrCard({
    dish,
    control,
    paper,
    children
}: {
    dish: string;
    control: ReactNode;
    /** Metà su fondo carta (--ld-paper). */
    paper: "phone" | "customer";
    /** Righe del menù del cliente (MenuRow). */
    children: ReactNode;
}) {
    return (
        <div className={styles.pqCard}>
            <div className={cx(styles.pqPhone, paper === "phone" && styles.pqPaper)}>
                <Kicker>{PHONE_LABEL}</Kicker>
                <div className={styles.pqControl}>
                    <span className={styles.pqDish}>{dish}</span>
                    {control}
                </div>
            </div>
            <div className={cx(styles.pqCustomer, paper === "customer" && styles.pqPaper)} aria-live="polite">
                <Kicker className={styles.pqCustomerLabel}>{CUSTOMER_LABEL}</Kicker>
                {children}
            </div>
        </div>
    );
}

/** Etichetta piccola maiuscola dei pannelli. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
    return <p className={cx(styles.kicker, className)}>{children}</p>;
}
