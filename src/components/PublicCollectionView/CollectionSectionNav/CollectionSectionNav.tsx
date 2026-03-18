import Text from "@/components/ui/Text/Text";
import styles from "./CollectionSectionNav.module.scss";

export type CollectionSectionNavProps = {
    sections: { id: string; name: string }[];
    activeSectionId?: string | null;
    onSelect?: (sectionId: string) => void;
    variant?: "preview" | "public";
    style?: {
        shape?: "rounded" | "pill" | "square";
        navStyle?: "pill" | "tabs" | "minimal";
    };
};

export default function CollectionSectionNav({
    sections,
    activeSectionId,
    onSelect,
    variant = "public",
    style
}: CollectionSectionNavProps) {
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
        >
            <ul className={styles.list} role="tablist">
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
