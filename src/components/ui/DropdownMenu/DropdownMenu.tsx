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
import type { DropdownItemProps } from "./DropdownItem";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./DropdownMenu.module.scss";

type DropdownPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

interface DropdownMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    placement?: DropdownPlacement;
}

export function DropdownMenu({ trigger, children, placement = "bottom-start" }: DropdownMenuProps) {
    const [open, setOpen] = useState(false);
    const [computedPlacement, setComputedPlacement] = useState<DropdownPlacement>(placement);

    const triggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<HTMLButtonElement[]>([]);

    const toggle = () => setOpen(v => !v);
    const close = () => setOpen(false);

    // Close on outside click
    useEffect(() => {
        if (!open) return;

        requestAnimationFrame(() => {
            // Focus on first actual button/item if possible
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

    // Auto flip
    useEffect(() => {
        if (!open || !menuRef.current || !triggerRef.current) return;

        const menuRect = menuRef.current.getBoundingClientRect();
        const triggerRect = triggerRef.current.getBoundingClientRect();

        const spaceBelow = window.innerHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;

        if (spaceBelow < menuRect.height && spaceAbove > spaceBelow) {
            setComputedPlacement(prev =>
                prev.startsWith("bottom")
                    ? (prev.replace("bottom", "top") as DropdownPlacement)
                    : prev
            );
        } else {
            setComputedPlacement(placement);
        }
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

            <AnimatePresence>
                {open && (
                    <motion.div
                        ref={menuRef}
                        role="menu"
                        tabIndex={-1}
                        onKeyDown={handleKeyDown}
                        className={`${styles.menu} ${styles[computedPlacement]}`}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        variants={dropdownVariants}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                        {Children.map(children, (child, index) => {
                            if (!isValidElement(child)) return child;

                            // Solo se il componente accetta itemRef e onSelect (DropdownItem)
                            // Facciamo un check "alla cieca" o per tipo se possibile
                            if (
                                typeof child.type === "function" &&
                                child.type.name === "DropdownItem"
                            ) {
                                return cloneElement(child as ReactElement<any>, {
                                    itemRef: (el: HTMLButtonElement | null) => {
                                        if (el) itemRefs.current[index] = el;
                                    },
                                    onSelect: close
                                });
                            }

                            // Altrimenti (es: Separator) torniamo il figlio così com'è
                            return child;
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const dropdownVariants = {
    hidden: { opacity: 0, scale: 0.96, y: -4 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: -4 }
};
