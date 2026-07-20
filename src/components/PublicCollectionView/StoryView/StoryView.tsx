import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpenText, ArrowRight } from "lucide-react";
import { fetchPublicStories } from "@/services/supabase/stories";
import type { PublicStoryListResult } from "@/services/supabase/stories";
import Text from "@/components/ui/Text/Text";
import StoryReader from "./StoryReader";
import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import styles from "./StoryView.module.scss";

type StoryViewProps = {
    slug: string;
    selectedStoryId: string | null;
    onSelectStory: (storyId: string | null) => void;
    /** Apre la scheda prodotto dal rimando nel lettore (stesso meccanismo di CollectionView). */
    onOpenProduct?: (productId: string) => void;
    /** Pass-through al lettore per il blocco Prodotto — vedi StoryReader. */
    resolveProduct?: (productId: string) => CollectionViewSectionItem | null;
};

const SLIDE_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;

type LoadState =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; data: PublicStoryListResult };

export default function StoryView({ slug, selectedStoryId, onSelectStory, onOpenProduct, resolveProduct }: StoryViewProps) {
    const { t } = useTranslation("public");
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const prefersReducedMotion = useReducedMotion();

    // Fetch lazy: solo all'attivazione del tab (StoryView è montato solo quando
    // activeTab === "storia", vedi CollectionView) — niente fetch al load pagina.
    useEffect(() => {
        let cancelled = false;
        setState({ status: "loading" });
        fetchPublicStories(slug)
            .then(data => {
                if (!cancelled) setState({ status: "ready", data });
            })
            .catch(() => {
                if (!cancelled) setState({ status: "error" });
            });
        return () => {
            cancelled = true;
        };
    }, [slug]);

    let feedContent: ReactNode;

    if (state.status === "loading") {
        feedContent = (
            <div className={styles.stateBlock}>
                <Text variant="body" color="var(--pub-bg-text-muted)">
                    {t("story.loading")}
                </Text>
            </div>
        );
    } else if (state.status === "error") {
        feedContent = (
            <div className={styles.stateBlock}>
                <Text variant="body" color="var(--pub-bg-text-muted)">
                    {t("story.error")}
                </Text>
            </div>
        );
    } else {
        const { cappello, stories } = state.data;
        const hasCappello = !!cappello && !!(cappello.cover || cappello.title || cappello.intro || cappello.website);

        if (stories.length === 0 && !hasCappello) {
            feedContent = (
                <div className={styles.stateBlock}>
                    <BookOpenText size={48} strokeWidth={1.5} className={styles.emptyIcon} />
                    <Text variant="body" color="var(--pub-bg-text-muted)">
                        {t("story.empty")}
                    </Text>
                </div>
            );
        } else {
            feedContent = (
                <div className={styles.root}>
                    {hasCappello && cappello && (
                        <>
                            <div className={styles.cappello}>
                                {cappello.cover && (
                                    <div className={styles.cappelloCover}>
                                        <img src={cappello.cover} alt="" />
                                    </div>
                                )}
                                {cappello.title && <h2 className={styles.cappelloTitle}>{cappello.title}</h2>}
                                {cappello.intro && <p className={styles.cappelloIntro}>{cappello.intro}</p>}
                                {cappello.website && (
                                    <a
                                        href={cappello.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.cappelloWebsite}
                                    >
                                        {t("story.website_cta")}
                                        <ArrowRight size={14} strokeWidth={2.5} className={styles.cappelloWebsiteIcon} />
                                    </a>
                                )}
                            </div>
                            {stories.length > 0 && <hr className={styles.cappelloDivider} />}
                        </>
                    )}

                    {stories.length > 0 && (
                        <>
                            <h3 className={styles.sectionTitle}>{t("story.section_title")}</h3>
                            <div className={styles.grid} role="list" aria-label={t("story.list_aria")}>
                                {stories.map(story => (
                                    <button
                                        key={story.id}
                                        type="button"
                                        role="listitem"
                                        className={styles.card}
                                        onClick={() => onSelectStory(story.id)}
                                    >
                                        <div className={styles.cardCover}>
                                            {story.cover_media ? (
                                                <img src={story.cover_media} alt="" />
                                            ) : (
                                                <div className={styles.cardCoverPlaceholder} />
                                            )}
                                        </div>
                                        <div className={styles.cardBody}>
                                            {/* Occhiello: spazio SEMPRE riservato (chip invisibile se assente)
                                                così i titoli delle card in griglia condividono la baseline. */}
                                            {story.eyebrow ? (
                                                <span className={styles.cardEyebrow}>{story.eyebrow}</span>
                                            ) : (
                                                <span
                                                    className={`${styles.cardEyebrow} ${styles.cardEyebrowEmpty}`}
                                                    aria-hidden="true"
                                                >
                                                    &nbsp;
                                                </span>
                                            )}
                                            <span className={styles.cardTitle}>{story.title}</span>
                                            {story.excerpt && <span className={styles.cardExcerpt}>{story.excerpt}</span>}
                                            {story.product && (
                                                <span className={styles.cardProduct}>{story.product.name}</span>
                                            )}
                                            <span className={styles.cardCta}>{t("story.read_cta")}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            );
        }
    }

    return (
        <div className={styles.viewport}>
            <AnimatePresence mode="wait" initial={false}>
                {selectedStoryId ? (
                    <motion.div
                        key="reader"
                        className={styles.view}
                        initial={prefersReducedMotion ? { opacity: 0 } : { x: "100%" }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { x: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { x: "100%" }}
                        transition={SLIDE_TRANSITION}
                    >
                        <StoryReader
                            slug={slug}
                            storyId={selectedStoryId}
                            onClose={() => onSelectStory(null)}
                            onOpenProduct={onOpenProduct}
                            resolveProduct={resolveProduct}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="feed"
                        className={styles.view}
                        initial={prefersReducedMotion ? { opacity: 0 } : { x: "-100%" }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { x: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { x: "-100%" }}
                        transition={SLIDE_TRANSITION}
                    >
                        {feedContent}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
