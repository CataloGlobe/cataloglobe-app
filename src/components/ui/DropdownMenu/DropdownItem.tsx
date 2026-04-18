import { ReactNode, MouseEvent } from "react";
import styles from "./DropdownMenu.module.scss";
import { Button } from "../Button/Button";

export interface DropdownItemProps {
    children: ReactNode;
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
    onSelect?: () => void;
    danger?: boolean;
    href?: string;
    target?: string;
    rel?: string;

    // ✅ ref controllato dal Dropdown (serve per focus/keyboard nav)
    itemRef?: (el: HTMLButtonElement | null) => void;
}

export function DropdownItem({
    children,
    onClick,
    onSelect,
    danger,
    itemRef,
    href,
    target,
    rel
}: DropdownItemProps) {
    function handleClick(e: MouseEvent<HTMLButtonElement>) {
        if (href) {
            // Se è un link esterno, lasciamo che il default accada?
            // O usiamo window.open? Se ha target="_blank" lasciamo fare al browser.
            if (target === "_blank") {
                window.open(href, "_blank", rel);
            } else {
                window.location.href = href;
            }
        }

        onClick?.(e);
        onSelect?.();
    }

    return (
        <Button
            ref={itemRef}
            role="menuitem"
            type="button"
            variant="secondary"
            className={`${styles.item} ${danger ? styles.danger : ""}`}
            onClick={handleClick}
        >
            <span className={styles.itemContent}>{children}</span>
        </Button>
    );
}
