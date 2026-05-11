import React, { ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./ConfigAccordionSection.module.scss";

interface ConfigAccordionSectionProps {
    title: string;
    previewBadges?: string[];
    defaultOpen?: boolean;
    children: ReactNode;
    isLast?: boolean;
}

export const ConfigAccordionSection: React.FC<ConfigAccordionSectionProps> = ({
    title,
    previewBadges,
    defaultOpen = false,
    children,
    isLast = false
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const previewVisible = !open && previewBadges && previewBadges.length > 0;

    return (
        <div
            className={`${styles.item} ${open ? styles.open : ""} ${
                isLast ? styles.last : ""
            }`}
        >
            <button
                type="button"
                className={styles.header}
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
            >
                <span className={styles.title}>{title}</span>
                {previewVisible && (
                    <span className={styles.previewBadges}>
                        {previewBadges!.slice(0, 4).map((badge, i) => (
                            <span key={i} className={styles.previewBadge}>
                                {badge}
                            </span>
                        ))}
                        {previewBadges!.length > 4 && (
                            <span className={styles.previewBadgeMore}>
                                +{previewBadges!.length - 4}
                            </span>
                        )}
                    </span>
                )}
                <ChevronDown
                    size={16}
                    className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
                />
            </button>
            {open && <div className={styles.body}>{children}</div>}
        </div>
    );
};
