import React, { useEffect, useRef, useState } from "react";
import styles from "./PageHeader.module.scss";
import Text from "@/components/ui/Text/Text";

export type PageHeaderProps = {
    title: string;
    titleAddon?: React.ReactNode;
    subtitle?: string;
    actions?: React.ReactNode;
    sticky?: boolean;
};

function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
    let curr = el?.parentElement ?? null;
    while (curr) {
        const style = window.getComputedStyle(curr);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
            return curr;
        }
        curr = curr.parentElement;
    }
    return null;
}

export default function PageHeader({
    title,
    titleAddon,
    subtitle,
    actions,
    sticky = false
}: PageHeaderProps) {
    const headerRef = useRef<HTMLElement>(null);
    const [shrunk, setShrunk] = useState(false);

    useEffect(() => {
        if (!sticky) return;
        const scrollContainer = findScrollContainer(headerRef.current);
        if (!scrollContainer) return;

        const handler = () => {
            setShrunk(scrollContainer.scrollTop > 24);
        };
        handler();
        scrollContainer.addEventListener("scroll", handler, { passive: true });
        return () => scrollContainer.removeEventListener("scroll", handler);
    }, [sticky]);

    const isShrunk = sticky && shrunk;
    const titleVariant = isShrunk ? "title-sm" : "title-lg";

    const className = [
        styles.header,
        sticky && styles.sticky,
        isShrunk && styles.shrunk
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <header ref={headerRef} className={className}>
            <div className={styles.content}>
                <div className={styles.titleRow}>
                    <Text variant={titleVariant} as="h1">
                        {title}
                    </Text>
                    {titleAddon}
                </div>
                {subtitle && (
                    <div className={styles.subtitle}>
                        <Text variant="body" colorVariant="muted">
                            {subtitle}
                        </Text>
                    </div>
                )}
            </div>

            {actions && <div className={styles.actions}>{actions}</div>}
        </header>
    );
}
