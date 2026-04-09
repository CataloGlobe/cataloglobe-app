import { useEffect, useRef } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./CollectionSectionNav.module.scss";

export type CollectionSectionNavProps = {
    sections: { id: string; name: string }[];
    activeSectionId?: string | null;
    onSelect?: (sectionId: string) => void;
    variant?: "preview" | "public";
    style?: {
        shape?: "rounded" | "pill" | "square";
        navStyle?: "pill" | "chip" | "outline" | "tabs" | "dot" | "minimal";
    };
    /** Offset top dinamico (px) per stare sotto il compact header. */
    topOffset?: number;
};

export default function CollectionSectionNav({
    sections,
    activeSectionId,
    onSelect,
    variant = "public",
    style,
    topOffset
}: CollectionSectionNavProps) {
    const listRef = useRef<HTMLUListElement | null>(null);
    const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

    if (sections.length === 0) return null;

    const navStyle = style?.navStyle ?? "pill";
    // radius only meaningful for pill style; tabs/minimal control it via CSS
    const pillRadius =
        navStyle !== "pill"
            ? undefined
            : style?.shape === "square"
              ? 6
              : style?.shape === "rounded"
                ? 12
                : 999;

    return (
        <nav
            className={styles.nav}
            data-variant={variant}
            data-nav-style={navStyle}
            aria-label="Navigazione sezioni del catalogo"
            style={topOffset !== undefined ? { top: topOffset } : undefined}
        >
            <ul className={styles.list} role="tablist" ref={listRef}>
                {sections.map(section => {
                    const isActive = section.id === activeSectionId;

                    return (
                        <li key={section.id} role="presentation">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                className={styles.pill}
                                data-active={isActive}
                                onClick={() => onSelect?.(section.id)}
                                style={{ borderRadius: pillRadius }}
                                ref={element => {
                                    buttonRefs.current[section.id] = element;
                                }}
                            >
                                <Text variant="body" weight={500}>
                                    {section.name}
                                </Text>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
