import React from "react";
import styles from "./PageHeader.module.scss";
import Text from "@/components/ui/Text/Text";

export type PageHeaderProps = {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
};

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
    return (
        <header className={styles.header}>
            <div className={styles.content}>
                <Text variant="title-lg" as="h1">
                    {title}
                </Text>
                {subtitle && (
                    <Text variant="body" colorVariant="muted">
                        {subtitle}
                    </Text>
                )}
            </div>

            {actions && <div className={styles.actions}>{actions}</div>}
        </header>
    );
}
