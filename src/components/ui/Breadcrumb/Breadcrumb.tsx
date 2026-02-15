import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import styles from "./Breadcrumb.module.scss";
import Text from "@/components/ui/Text/Text";

export type BreadcrumbItem = {
    label: string;
    to?: string;
    icon?: React.ReactNode;
};

export type BreadcrumbProps = {
    items: BreadcrumbItem[];
};

export default function Breadcrumb({ items }: BreadcrumbProps) {
    if (!items || items.length === 0) return null;

    return (
        <nav aria-label="Breadcrumb" className={styles.nav}>
            <ol className={styles.list}>
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;

                    return (
                        <li key={index} className={styles.listItem}>
                            {/* Render Item */}
                            {item.to && !isLast ? (
                                <Link to={item.to} className={styles.link}>
                                    {item.icon && (
                                        <span className={styles.iconWrapper}>{item.icon}</span>
                                    )}
                                    <Text variant="body-sm" as="span" className={styles.text}>
                                        {item.label}
                                    </Text>
                                </Link>
                            ) : (
                                <span
                                    className={styles.current}
                                    aria-current={isLast ? "page" : undefined}
                                >
                                    {item.icon && !isLast && (
                                        <span className={styles.iconWrapper}>{item.icon}</span>
                                    )}
                                    <Text
                                        variant="body-sm"
                                        weight={500}
                                        as="span"
                                        className={styles.text}
                                    >
                                        {item.label}
                                    </Text>
                                </span>
                            )}

                            {/* Separator */}
                            {!isLast && (
                                <span className={styles.separator} aria-hidden="true">
                                    <ChevronRight size={14} />
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
