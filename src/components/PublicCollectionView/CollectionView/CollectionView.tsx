import { useEffect, useMemo, useRef, useState } from "react";
import Text from "@/components/ui/Text/Text";
import CollectionHero from "../CollectionHero/CollectionHero";
import CollectionSectionNav from "../CollectionSectionNav/CollectionSectionNav";
import type { CardTemplate, CollectionStyle } from "@/types/collectionStyle";
import styles from "./CollectionView.module.scss";

type SectionNavItem = { id: string; name: string };

export type CollectionViewSectionItem = {
    id: string;
    name: string;
    description?: string | null;
    price?: number | null;
    image?: string | null;
};

export type CollectionViewSection = {
    id: string;
    name: string;
    items: CollectionViewSectionItem[];
};

type Props = {
    businessName: string;
    businessImage: string | null;
    collectionTitle: string;
    sections: CollectionViewSection[];
    style: Required<CollectionStyle>;
    mode: "public" | "preview";
    contentId?: string;
    emptyState?: {
        title?: string;
        description?: string;
    };
};

export default function CollectionView({
    businessName,
    businessImage,
    collectionTitle,
    sections,
    style,
    mode,
    contentId = "collection-content",
    emptyState
}: Props) {
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

    useEffect(() => {
        if (!activeSectionId && sections.length > 0) {
            setActiveSectionId(sections[0].id);
        }
    }, [activeSectionId, sections]);

    useEffect(() => {
        if (mode !== "public") return;

        const els = Object.values(sectionRefs.current).filter(Boolean) as HTMLElement[];
        if (els.length === 0) return;

        const observer = new IntersectionObserver(
            entries => {
                const visible = entries
                    .filter(e => e.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

                if (visible) {
                    const id = visible.target.getAttribute("data-section-id");
                    if (id) setActiveSectionId(id);
                }
            },
            {
                rootMargin: "-40% 0px -50% 0px",
                threshold: [0.1, 0.25, 0.5]
            }
        );

        els.forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, [mode, sections]);

    const navItems: SectionNavItem[] = useMemo(
        () => sections.map(s => ({ id: s.id, name: s.name })),
        [sections]
    );

    const scrollToSection = (sectionId: string) => {
        setActiveSectionId(sectionId); // 👈 subito attivo

        const el = sectionRefs.current[sectionId];
        el?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    };

    return (
        <main className={styles.page} style={{ background: style.backgroundColor }}>
            {/* Skip link (solo public) */}
            {mode === "public" && (
                <a className={styles.skipLink} href={`#${contentId}`}>
                    <Text variant="caption">Salta al contenuto</Text>
                </a>
            )}

            {/* FRAME – struttura centrale come PublicCatalog */}
            <div className={styles.frame}>
                <CollectionHero
                    title={businessName}
                    subtitle={collectionTitle}
                    imageUrl={businessImage}
                    variant={mode === "public" ? "public" : "preview"}
                    style={{
                        backgroundColor: style.headerBackgroundColor,
                        imageRadius: style.heroImageRadius
                    }}
                />

                {emptyState && (
                    <div className={styles.emptyState}>
                        {emptyState.title && (
                            <Text as="h2" variant="title-sm" weight={700}>
                                {emptyState.title}
                            </Text>
                        )}

                        {emptyState.description && (
                            <Text variant="body" colorVariant="muted">
                                {emptyState.description}
                            </Text>
                        )}
                    </div>
                )}

                {emptyState ? null : (
                    <>
                        <CollectionSectionNav
                            sections={navItems}
                            activeSectionId={activeSectionId}
                            onSelect={scrollToSection}
                            variant={mode === "public" ? "public" : "preview"}
                            style={{
                                color: style.sectionNavColor,
                                shape: style.sectionNavShape
                            }}
                        />

                        <div id={contentId} className={styles.container}>
                            {sections.map(section => {
                                if (section.items.length === 0) return null;

                                return (
                                    <section
                                        key={section.id}
                                        data-section-id={section.id}
                                        ref={el => {
                                            sectionRefs.current[section.id] = el;
                                        }}
                                        className={styles.section}
                                        aria-label={section.name}
                                    >
                                        <Text as="h2" variant="title-sm" weight={700}>
                                            {section.name}
                                        </Text>

                                        <div className={styles.grid} role="list">
                                            {section.items.map(item => (
                                                <article
                                                    key={item.id}
                                                    role="listitem"
                                                    className={styles.card}
                                                    data-template={
                                                        style.cardTemplate as CardTemplate
                                                    }
                                                    style={{
                                                        borderRadius: style.cardRadius,
                                                        backgroundColor: style.cardBackgroundColor
                                                    }}
                                                >
                                                    {style.cardTemplate !== "no-image" &&
                                                        (item.image ? (
                                                            <img
                                                                src={item.image}
                                                                alt={item.name}
                                                                className={styles.cardImage}
                                                                loading="lazy"
                                                            />
                                                        ) : (
                                                            <div
                                                                className={styles.imagePlaceholder}
                                                                aria-label="Immagine non disponibile"
                                                            >
                                                                <Text
                                                                    variant="caption"
                                                                    colorVariant="muted"
                                                                >
                                                                    Img
                                                                </Text>
                                                            </div>
                                                        ))}

                                                    <div className={styles.cardBody}>
                                                        <Text
                                                            variant="body"
                                                            weight={700}
                                                            className={styles.title}
                                                        >
                                                            {item.name}
                                                        </Text>

                                                        {item.price != null && (
                                                            <Text
                                                                variant="caption"
                                                                colorVariant="muted"
                                                                className={styles.price}
                                                            >
                                                                € {item.price.toFixed(2)}
                                                            </Text>
                                                        )}

                                                        {item.description && (
                                                            <Text
                                                                variant="caption"
                                                                colorVariant="muted"
                                                                className={styles.description}
                                                            >
                                                                {item.description}
                                                            </Text>
                                                        )}
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
