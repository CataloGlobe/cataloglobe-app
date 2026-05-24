import { useEffect, useState, type RefObject } from "react";
import { useReadPageHeader } from "@/context/useReadPageHeader";
import Text from "@/components/ui/Text/Text";
import styles from "./PageHeaderSlot.module.scss";

interface PageHeaderSlotProps {
    scrollContainerRef: RefObject<HTMLElement | null>;
}

export function PageHeaderSlot({ scrollContainerRef }: PageHeaderSlotProps) {
    const config = useReadPageHeader();
    const sticky = config?.sticky ?? true;
    const [shrunk, setShrunk] = useState(false);

    useEffect(() => {
        if (!config || !sticky) return;
        const el = scrollContainerRef.current;
        if (!el) return;

        const handler = () => setShrunk(el.scrollTop > 24);
        el.addEventListener("scroll", handler, { passive: true });
        handler();
        return () => el.removeEventListener("scroll", handler);
    }, [config, sticky, scrollContainerRef]);

    useEffect(() => {
        setShrunk(false);
    }, [config?.title]);

    if (!config) return null;

    const isShrunk = sticky && shrunk;
    const classes = [styles.slot, sticky && styles.sticky, isShrunk && styles.shrunk]
        .filter(Boolean)
        .join(" ");

    return (
        <header className={classes}>
            <div className={styles.content}>
                <div className={styles.titleRow}>
                    <Text variant={isShrunk ? "title-sm" : "title-lg"} as="h1">
                        {config.title}
                    </Text>
                    {config.titleAddon}
                </div>
                {config.subtitle && (
                    <div className={styles.subtitle}>
                        <Text variant="body" colorVariant="muted">
                            {config.subtitle}
                        </Text>
                    </div>
                )}
            </div>
            {config.actions && <div className={styles.actions}>{config.actions}</div>}
        </header>
    );
}
