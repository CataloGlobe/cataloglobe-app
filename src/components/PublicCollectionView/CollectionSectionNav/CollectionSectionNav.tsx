import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Text from "@/components/ui/Text/Text";
import styles from "./CollectionSectionNav.module.scss";

type NavSectionChild = { id: string; name: string; level: number };

type NavSection = {
    id: string;
    name: string;
    children?: NavSectionChild[];
};

export type CollectionSectionNavProps = {
    sections: NavSection[];
    activeSectionId?: string | null;
    onSelect?: (sectionId: string) => void;
    onChildSelect?: (childId: string) => void;
    activeChildId?: string | null;
    variant?: "preview" | "public";
    style?: {
        navStyle?: "filled" | "outline" | "tabs" | "dot" | "minimal";
    };
};

const DROPDOWN_WIDTH_ESTIMATE = 220;

export default function CollectionSectionNav({
    sections,
    activeSectionId,
    onSelect,
    onChildSelect,
    activeChildId,
    variant = "public",
    style,
}: CollectionSectionNavProps) {
    const listRef = useRef<HTMLUListElement | null>(null);
    const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const chevronRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const pillContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // ── Overflow fade state ───────────────────────────────────────────────────
    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const update = () => {
            setCanScrollLeft(el.scrollLeft > 4);
            setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
        };
        update();
        el.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", update);
            ro.disconnect();
        };
    }, [sections]);

    // ── Auto-scroll active pill into view ────────────────────────────────────
    useEffect(() => {
        if (!activeSectionId) return;

        const listEl = listRef.current;
        const activeButton = buttonRefs.current[activeSectionId];
        if (!listEl || !activeButton) return;

        const listRect = listEl.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();
        const horizontalMargin = 24;
        const isFullyVisible =
            buttonRect.left >= listRect.left + horizontalMargin &&
            buttonRect.right <= listRect.right - horizontalMargin;

        if (isFullyVisible) return;

        const buttonCenter = activeButton.offsetLeft + activeButton.offsetWidth / 2;
        const targetScrollLeft = Math.max(0, buttonCenter - listEl.clientWidth / 2);

        listEl.scrollTo({
            left: targetScrollLeft,
            behavior: "smooth"
        });
    }, [activeSectionId]);

    // ── Click-outside closes the portal dropdown ──────────────────────────────
    useEffect(() => {
        if (!openDropdownId) return;

        const handler = (e: MouseEvent) => {
            const chevronBtn = chevronRefs.current[openDropdownId];
            if (
                !dropdownRef.current?.contains(e.target as Node) &&
                !chevronBtn?.contains(e.target as Node)
            ) {
                setOpenDropdownId(null);
            }
        };

        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [openDropdownId]);

    // ── Scroll closes the portal dropdown ────────────────────────────────────
    useEffect(() => {
        if (!openDropdownId) return;

        const handler = () => setOpenDropdownId(null);
        window.addEventListener("scroll", handler, { passive: true, capture: true });
        return () => window.removeEventListener("scroll", handler, { capture: true });
    }, [openDropdownId]);

    // ── Chevron toggle — calcola posizione viewport-relative ─────────────────
    const handleChevronClick = useCallback(
        (sectionId: string) => {
            if (openDropdownId === sectionId) {
                setOpenDropdownId(null);
                return;
            }
            // Usa il container .pillWithChildren per allineare il dropdown al bordo sinistro della pill
            const container = pillContainerRefs.current[sectionId];
            const chevronBtn = chevronRefs.current[sectionId];
            const anchor = container ?? chevronBtn;
            if (anchor) {
                const containerRect = anchor.getBoundingClientRect();
                const chevronRect = chevronBtn?.getBoundingClientRect() ?? containerRect;
                // Allinea al bordo sinistro del container, top sotto il chevron
                let left = containerRect.left;
                if (left + DROPDOWN_WIDTH_ESTIMATE > window.innerWidth - 8) {
                    left = Math.max(8, containerRect.right - DROPDOWN_WIDTH_ESTIMATE);
                }
                setDropdownPos({ top: chevronRect.bottom + 6, left });
            }
            setOpenDropdownId(sectionId);
        },
        [openDropdownId]
    );

    const handleChildClick = useCallback(
        (childId: string) => {
            onChildSelect?.(childId);
            setOpenDropdownId(null);
        },
        [onChildSelect]
    );

    if (sections.length === 0) return null;

    // Read theme CSS vars from in-tree element so the portal inherits them.
    // The portal (document.body) is outside PublicThemeScope's subtree and cannot
    // inherit CSS custom properties via cascade — we must forward them explicitly.
    const portalStyle: Record<string, string> = listRef.current
        ? (() => {
            const cs = getComputedStyle(listRef.current!);
            const get = (v: string) => cs.getPropertyValue(v).trim();
            return {
                "--pub-radius": get("--pub-radius"),
                "--pub-btn-radius": get("--pub-btn-radius"),
                "--pub-surface": get("--pub-surface"),
                "--pub-surface-border": get("--pub-surface-border"),
                "--pub-surface-text": get("--pub-surface-text"),
                "--pub-text": get("--pub-text"),
                "--pub-primary": get("--pub-primary"),
                "--pub-font-family": get("--pub-font-family"),
            };
        })()
        : {};

    const navStyle = style?.navStyle ?? "filled";
    // Il radius è interamente governato da CSS via var(--pub-radius) per tutte le varianti.

    const openSection = openDropdownId ? sections.find(s => s.id === openDropdownId) : null;

    return (
        <nav
            className={styles.nav}
            data-variant={variant}
            data-nav-style={navStyle}
            data-overflow-left={canScrollLeft || undefined}
            data-overflow-right={canScrollRight || undefined}
            aria-label="Navigazione sezioni del catalogo"
        >
            <div className={styles.listWrapper}>
            <ul className={styles.list} role="tablist" ref={listRef}>
                {sections.map(section => {
                    const isActive = section.id === activeSectionId;
                    const hasChildren = (section.children?.length ?? 0) > 0;

                    if (!hasChildren) {
                        return (
                            <li key={section.id} role="presentation">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    className={styles.pill}
                                    data-active={isActive}
                                    onClick={() => onSelect?.(section.id)}
                                    ref={el => {
                                        buttonRefs.current[section.id] = el;
                                    }}
                                >
                                    <Text variant="body" weight={500} color="inherit">
                                        {section.name}
                                    </Text>
                                </button>
                            </li>
                        );
                    }

                    return (
                        <li key={section.id} role="presentation">
                            <div
                                className={styles.pillWithChildren}
                                data-active={isActive}
                                ref={el => {
                                    pillContainerRefs.current[section.id] = el;
                                }}
                            >
                                {/* Label — scrolla alla sezione L1 */}
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    className={styles.pillLabel}
                                    data-active={isActive}
                                    onClick={() => onSelect?.(section.id)}
                                    ref={el => {
                                        buttonRefs.current[section.id] = el;
                                    }}
                                >
                                    <Text variant="body" weight={500} color="inherit">
                                        {section.name}
                                    </Text>
                                </button>

                                {/* Chevron — apre dropdown */}
                                <button
                                    type="button"
                                    className={styles.pillChevron}
                                    data-open={openDropdownId === section.id}
                                    aria-label={`Sottocategorie di ${section.name}`}
                                    aria-expanded={openDropdownId === section.id}
                                    aria-haspopup="menu"
                                    onClick={() => handleChevronClick(section.id)}
                                    ref={el => {
                                        chevronRefs.current[section.id] = el;
                                    }}
                                >
                                    <ChevronDown size={12} />
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
            </div>

            {/* Dropdown — portal su document.body per uscire da overflow:hidden del .list */}
            {createPortal(
                <AnimatePresence>
                    {openDropdownId && openSection?.children && (
                        <motion.div
                            ref={dropdownRef}
                            className={styles.dropdown}
                            style={{ top: dropdownPos.top, left: dropdownPos.left, ...portalStyle } as React.CSSProperties}
                            initial={{ opacity: 0, scale: 0.96, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: -4 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            role="menu"
                            onKeyDown={e => {
                                if (e.key === "Escape") setOpenDropdownId(null);
                            }}
                        >
                            {openSection.children.map(child => (
                                <button
                                    key={child.id}
                                    type="button"
                                    role="menuitem"
                                    className={[
                                        styles.dropdownItem,
                                        child.level === 3 ? styles.dropdownItemL3 : "",
                                        child.id === activeChildId ? styles.dropdownItemActive : ""
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    onClick={() => handleChildClick(child.id)}
                                >
                                    {child.name}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </nav>
    );
}
