import type { ReactNode } from "react";
import type { HighlightedTitle } from "@pages/CampaignLanding/content/landing";
import styles from "./SectionHeader.module.scss";

/** Larghezze del blocco titolo usate nel canvas. Classi, non stile inline. */
export type SectionHeaderWidth = 520 | 740 | 820 | 940;

type SectionHeaderProps = {
    eyebrow?: string;
    /** ReactNode: può contenere <Highlight> sulla parola evidenziata. */
    title: ReactNode;
    lede?: ReactNode;
    align?: "start" | "center";
    maxWidth?: SectionHeaderWidth;
    /** h2 di default; h1 (scala display) solo per il titolo della pagina. */
    level?: 1 | 2;
};

export default function SectionHeader({
    eyebrow,
    title,
    lede,
    align = "start",
    maxWidth,
    level = 2
}: SectionHeaderProps) {
    const Heading = level === 1 ? "h1" : "h2";
    const className = [
        styles.header,
        align === "center" ? styles.center : null,
        maxWidth ? styles[`w${maxWidth}`] : null
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <header className={className}>
            {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
            <Heading className={level === 1 ? `${styles.title} ${styles.display}` : styles.title}>
                {title}
            </Heading>
            {lede && <p className={styles.lede}>{lede}</p>}
        </header>
    );
}

/** Parola evidenziata nel titolo: colore e tratto seguono il tono della sezione. */
export function Highlight({ children }: { children: ReactNode }) {
    return (
        <span className={styles.highlight}>
            {children}
            <svg
                className={styles.stroke}
                viewBox="0 0 200 10"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
            >
                <path d="M2 7 C 42 2, 78 9, 118 5 S 178 2, 198 6" />
            </svg>
        </span>
    );
}

/**
 * Titolo da `content/landing.ts` con la parola evidenziata in mezzo. La parola
 * evidenziata va a capo come un blocco unico, insieme alla punteggiatura che
 * la segue: il tratto sotto non si spezza e il punto non resta da solo.
 */
export function HighlightedText({ title }: { title: HighlightedTitle }) {
    return (
        <>
            {title.before}
            <span className={styles.keep}>
                <Highlight>{title.highlight}</Highlight>
                {title.after}
            </span>
        </>
    );
}
