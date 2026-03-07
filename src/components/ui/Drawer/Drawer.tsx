import { ReactNode, useEffect, useRef } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./Drawer.module.scss";
import { IconButton } from "@/components/ui/Button/IconButton";
import { X } from "lucide-react";

interface DrawerProps {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    mode?: "overlay" | "docked";
    position?: "left" | "right";
    width?: number | string;
}

export function Drawer({
    title,
    isOpen,
    onClose,
    children,
    footer,
    mode = "overlay",
    position = "right",
    width = 420
}: DrawerProps) {
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

    useEffect(() => {
        if (!isOpen || mode === "docked") return;

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen, mode]);

    if (!isOpen) return null;

    const drawerClass = `${styles.drawer} ${mode === "overlay" ? styles["mode-overlay"] : styles["mode-docked"]} ${position === "right" ? styles["pos-right"] : styles["pos-left"]}`;

    return (
        <>
            {mode === "overlay" && (
                <div className={styles.backdrop} onClick={onClose} role="presentation" />
            )}
            <aside
                className={drawerClass}
                style={{ width }}
                role="dialog"
                aria-labelledby="drawer-title"
                tabIndex={-1}
                ref={ref}
            >
                <header className={styles.drawerHeader}>
                    <Text as="h3" variant="title-sm" weight={600} id="drawer-title">
                        {title}
                    </Text>

                    <IconButton
                        className={styles.iconBtn}
                        variant="secondary"
                        icon={<X size={14} />}
                        aria-label="Chiudi pannello"
                        onClick={onClose}
                    />
                </header>

                <div className={styles.drawerBody}>{children}</div>

                {footer && <footer className={styles.drawerFooter}>{footer}</footer>}
            </aside>
        </>
    );
}
