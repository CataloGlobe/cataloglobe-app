import Text from "@/components/ui/Text/Text";
import { getPillColors } from "@/utils/pillColors";
import styles from "./CollectionSectionNav.module.scss";

export type CollectionSectionNavProps = {
    sections: { id: string; name: string }[];
    activeSectionId?: string | null;
    onSelect?: (sectionId: string) => void;
    variant?: "preview" | "public";
    style?: {
        color?: string;
        shape?: "rounded" | "pill" | "square";
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

    const pillColors = style?.color ? getPillColors(style.color) : null;

    const pillRadius = style?.shape === "square" ? 6 : style?.shape === "rounded" ? 12 : 999;

    return (
        <nav
            className={styles.nav}
            data-variant={variant}
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
                                style={
                                    pillColors
                                        ? {
                                              backgroundColor: isActive
                                                  ? pillColors.activeBg
                                                  : pillColors.normalBg,
                                              color: isActive
                                                  ? pillColors.activeText
                                                  : pillColors.normalText,
                                              borderRadius: pillRadius
                                          }
                                        : {
                                              borderRadius: pillRadius
                                          }
                                }
                                onMouseEnter={e => {
                                    if (!pillColors || isActive) return;
                                    e.currentTarget.style.backgroundColor = pillColors.hoverBg;
                                    e.currentTarget.style.color = pillColors.hoverText;
                                }}
                                onMouseLeave={e => {
                                    if (!pillColors || isActive) return;
                                    e.currentTarget.style.backgroundColor = pillColors.normalBg;
                                    e.currentTarget.style.color = pillColors.normalText;
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
