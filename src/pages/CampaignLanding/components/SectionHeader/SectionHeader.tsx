import type { ReactNode } from "react";
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
    return <span className={styles.highlight}>{children}</span>;
}
