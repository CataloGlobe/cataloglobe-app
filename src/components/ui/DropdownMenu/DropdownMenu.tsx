import {
    useEffect,
    useRef,
    useState,
    ReactNode,
    KeyboardEvent,
    Children,
    cloneElement,
    isValidElement,
    ReactElement
} from "react";
import { createPortal } from "react-dom";
import type { DropdownItemProps } from "./DropdownItem";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./DropdownMenu.module.scss";

type DropdownPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

interface DropdownMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    placement?: DropdownPlacement;
}

interface MenuPosition {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
}

export function DropdownMenu({ trigger, children, placement = "bottom-start" }: DropdownMenuProps) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<MenuPosition>({});

    const triggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<HTMLButtonElement[]>([]);

    const toggle = () => setOpen(v => !v);
    const close = () => setOpen(false);

    // Close on outside click + focus first item
    useEffect(() => {
        if (!open) return;

        requestAnimationFrame(() => {
            const firstButton = itemRefs.current.find(ref => ref);
            firstButton?.focus();
        });

        const handler = (e: MouseEvent) => {
            if (
                !menuRef.current?.contains(e.target as Node) &&
                !triggerRef.current?.contains(e.target as Node)
            ) {
                close();
            }
        };

        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    // Calculate fixed position from trigger rect (escapes overflow:hidden parents)
    useEffect(() => {
        if (!open || !triggerRef.current) return;

        const rect = triggerRef.current.getBoundingClientRect();
        const APPROX_MENU_HEIGHT = 100;
        const GAP = 6;

        const spaceBelow = window.innerHeight - rect.bottom;
        const showAbove = placement.startsWith("top") ||
            (spaceBelow < APPROX_MENU_HEIGHT && rect.top > spaceBelow);

        const isEndAligned = placement.endsWith("end");

        const pos: MenuPosition = showAbove
            ? { bottom: window.innerHeight - rect.top + GAP }
            : { top: rect.bottom + GAP };

        if (isEndAligned) {
            pos.right = window.innerWidth - rect.right;
        } else {
            pos.left = rect.left;
        }

        setPosition(pos);
    }, [open, placement]);

    function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        const items = itemRefs.current.filter(ref => ref);
        if (!items.length) return;

        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

        switch (e.key) {
            case "ArrowDown": {
                e.preventDefault();
                const next = currentIndex + 1 < items.length ? currentIndex + 1 : 0;
                items[next]?.focus();
                break;
            }

            case "ArrowUp": {
                e.preventDefault();
                const prev = currentIndex - 1 >= 0 ? currentIndex - 1 : items.length - 1;
                items[prev]?.focus();
                break;
            }

            case "Escape": {
                e.preventDefault();
                close();
                break;
            }
        }
    }

    return (
        <div className={styles.wrapper}>
            <div ref={triggerRef} onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
                {trigger}
            </div>

            {createPortal(
                <AnimatePresence>
                    {open && (
                        <motion.div
                            ref={menuRef}
                            role="menu"
                            tabIndex={-1}
                            onKeyDown={handleKeyDown}
                            className={styles.menu}
                            style={position}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            variants={dropdownVariants}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                        >
                            {Children.map(children, (child, index) => {
                                if (!isValidElement(child)) return child;

                                if (
                                    typeof child.type === "function" &&
                                    child.type.name === "DropdownItem"
                                ) {
                                    return cloneElement(child as ReactElement<DropdownItemProps>, {
                                        itemRef: (el: HTMLButtonElement | null) => {
                                            if (el) itemRefs.current[index] = el;
                                        },
                                        onSelect: close
                                    });
                                }

                                return child;
                            })}
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}

const dropdownVariants = {
    hidden: { opacity: 0, scale: 0.96, y: -4 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: -4 }
};
