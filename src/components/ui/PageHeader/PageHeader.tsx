import React from "react";
import styles from "./PageHeader.module.scss";
import Text from "@/components/ui/Text/Text";

export type PageHeaderProps = {
    title: string;
    titleAddon?: React.ReactNode;
    subtitle?: string;
    businessName?: string;
    actions?: React.ReactNode;
};

export default function PageHeader({ title, titleAddon, subtitle, actions }: PageHeaderProps) {
    return (
        <header className={styles.header}>
            <div className={styles.content}>
                <div className={styles.titleRow}>
                    <Text variant="title-lg" as="h1">
                        {title}
                    </Text>
                    {titleAddon}
                </div>
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
