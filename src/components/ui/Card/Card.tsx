import React from "react";
import styles from "./Card.module.scss";

interface CardProps {
    title?: string;
    children: React.ReactNode;
    className?: string;
}

export const Card: React.FC<CardProps> = ({ title, children, className = "" }) => {
    return (
        <div className={`${styles.card} ${className}`}>
            {title && <h3 className={styles.title}>{title}</h3>}
            <div className={styles.content}>{children}</div>
        </div>
    );
};
