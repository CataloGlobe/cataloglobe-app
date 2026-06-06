import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { PhoneIcon } from "./icons";
import styles from "./StateCard.module.scss";

type Action =
    | { kind: "primary-link"; to: string; label: string }
    | { kind: "secondary-link"; to: string; label: string }
    | { kind: "primary-tel"; phone: string; label: string };

type Props = {
    icon: ReactNode;
    title: string;
    text: ReactNode;
    actions: Action[];
};

export default function StateCard({ icon, title, text, actions }: Props) {
    return (
        <div className={styles.card} role="status">
            <div className={styles.icon}>{icon}</div>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.text}>{text}</p>
            {actions.length > 0 && (
                <div className={styles.actions}>
                    {actions.map((action, idx) => {
                        if (action.kind === "primary-link") {
                            return (
                                <Link key={idx} to={action.to} className={styles.primaryCta}>
                                    {action.label}
                                </Link>
                            );
                        }
                        if (action.kind === "secondary-link") {
                            return (
                                <Link key={idx} to={action.to} className={styles.secondaryCta}>
                                    {action.label}
                                </Link>
                            );
                        }
                        return (
                            <a key={idx} href={`tel:${action.phone}`} className={styles.primaryCta}>
                                <PhoneIcon />
                                {action.label}
                            </a>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
