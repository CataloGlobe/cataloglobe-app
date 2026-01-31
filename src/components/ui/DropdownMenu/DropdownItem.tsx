import { ReactNode } from "react";
import styles from "./DropdownMenu.module.scss";
import { Button } from "../Button/Button";

export interface DropdownItemProps {
    children: ReactNode;
    onClick?: () => void;
    onSelect?: () => void;
    danger?: boolean;

    // ✅ ref controllato dal Dropdown (serve per focus/keyboard nav)
    itemRef?: (el: HTMLButtonElement | null) => void;
}

export function DropdownItem({ children, onClick, onSelect, danger, itemRef }: DropdownItemProps) {
    function handleClick() {
        onClick?.();
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
            {children}
        </Button>
    );
}
