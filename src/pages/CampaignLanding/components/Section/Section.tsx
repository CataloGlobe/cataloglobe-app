import type { ReactNode } from "react";
import styles from "./Section.module.scss";

export type SectionTone = "white" | "lilla" | "dark";

type SectionProps = {
    /** Ancore: come, esempi, prezzi, come-si-parte, faq, contatto. */
    id?: string;
    tone?: SectionTone;
    /**
     * Spaziatura verticale: `default` 48/80 (SPEC §4); `board` e `form` sono le
     * due eccezioni della SPEC; `flushX` toglie il padding orizzontale su mobile
     * (carosello a tutta larghezza).
     */
    space?: "default" | "board" | "form";
    flushX?: boolean;
    /** Classe della sezione (sfondi decorativi, overflow). */
    className?: string;
    as?: "section" | "footer";
    labelledBy?: string;
    children: ReactNode;
};

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

export default function Section({
    id,
    tone = "white",
    space = "default",
    flushX = false,
    className,
    as: Tag = "section",
    labelledBy,
    children
}: SectionProps) {
    return (
        <Tag
            id={id}
            className={cx(styles.section, styles[tone], space !== "default" && styles[space], flushX && styles.flushX, className)}
            data-tone={tone === "dark" ? "dark" : undefined}
            aria-labelledby={labelledBy}
        >
            <div className={styles.inner}>{children}</div>
        </Tag>
    );
}
