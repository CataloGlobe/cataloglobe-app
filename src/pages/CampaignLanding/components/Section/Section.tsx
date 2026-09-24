import type { ReactNode } from "react";
import styles from "./Section.module.scss";

export type SectionTone = "paper" | "white" | "dark";

type SectionProps = {
    /** Ancore: funzioni, prezzi, faq, contatto. */
    id?: string;
    tone?: SectionTone;
    /** Niente padding orizzontale (l'hero gestisce il proprio). */
    flush?: boolean;
    as?: "section" | "footer";
    children: ReactNode;
};

export default function Section({
    id,
    tone = "paper",
    flush = false,
    as: Tag = "section",
    children
}: SectionProps) {
    const className = [styles.section, styles[tone], flush ? styles.flush : null]
        .filter(Boolean)
        .join(" ");

    return (
        <Tag id={id} className={className} data-tone={tone === "dark" ? "dark" : undefined}>
            <div className={styles.inner}>{children}</div>
        </Tag>
    );
}
