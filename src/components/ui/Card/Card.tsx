import React from "react";
import styles from "./Card.module.scss";

interface CardProps {
    title?: string;
    children: React.ReactNode;
    className?: string;
    /** Disabilita lift hover (transform/box-shadow). Usare per Card che wrappano DataTable. */
    noHoverLift?: boolean;
}

export const Card: React.FC<CardProps> = ({
    title,
    children,
    className = "",
    noHoverLift = false
}) => {
    const classes = [styles.card, noHoverLift ? styles.noHoverLift : "", className]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={classes}>
            {title && <h3 className={styles.title}>{title}</h3>}
            <div className={styles.content}>{children}</div>
        </div>
    );
};
