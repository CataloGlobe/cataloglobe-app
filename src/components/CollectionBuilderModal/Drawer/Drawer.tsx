import { ReactNode, useEffect, useRef } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./Drawer.module.scss";

interface DrawerProps {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
}

export function Drawer({ title, isOpen, onClose, children, footer }: DrawerProps) {
    const ref = useRef<HTMLDivElement>(null);

    // focus iniziale
    useEffect(() => {
        if (isOpen) {
            ref.current?.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <aside
            className={styles.drawer}
            role="dialog"
            aria-labelledby="drawer-title"
            tabIndex={-1}
            ref={ref}
        >
            <header className={styles.drawerHeader}>
                <Text as="h3" variant="title-sm" weight={600}>
                    {title}
                </Text>

                <button type="button" onClick={onClose} aria-label="Chiudi pannello">
                    ✕
                </button>
            </header>

            <div className={styles.drawerBody}>{children}</div>

            {footer && <footer className={styles.drawerFooter}>{footer}</footer>}
        </aside>
    );
}
