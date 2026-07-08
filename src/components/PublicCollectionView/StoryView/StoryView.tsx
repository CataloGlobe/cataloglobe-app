import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollText } from "lucide-react";
import { fetchPublicStories } from "@/services/supabase/stories";
import type { PublicStoryListResult } from "@/services/supabase/stories";
import Text from "@/components/ui/Text/Text";
import styles from "./StoryView.module.scss";

type StoryViewProps = {
    slug: string;
    /** Predisposizione lettore (sub-fase 5). Ricevuta ma non consumata per il rendering qui. */
    selectedStoryId: string | null;
    onSelectStory: (storyId: string) => void;
};

type LoadState =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; data: PublicStoryListResult };

export default function StoryView({ slug, onSelectStory }: StoryViewProps) {
    const { t } = useTranslation("public");
    const [state, setState] = useState<LoadState>({ status: "loading" });

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

    if (state.status === "loading") {
        return (
            <div className={styles.stateBlock}>
                <Text variant="body" color="var(--pub-bg-text-muted)">
                    {t("story.loading")}
                </Text>
            </div>
        );
    }

    if (state.status === "error") {
        return (
            <div className={styles.stateBlock}>
                <Text variant="body" color="var(--pub-bg-text-muted)">
                    {t("story.error")}
                </Text>
            </div>
        );
    }

    const { cappello, stories } = state.data;
    const hasCappello = !!cappello && !!(cappello.cover || cappello.title || cappello.intro || cappello.website);

    if (stories.length === 0 && !hasCappello) {
        return (
            <div className={styles.stateBlock}>
                <ScrollText size={48} strokeWidth={1.5} className={styles.emptyIcon} />
                <Text variant="body" color="var(--pub-bg-text-muted)">
                    {t("story.empty")}
                </Text>
            </div>
        );
    }

    return (
        <div className={styles.root}>
            {hasCappello && cappello && (
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
                        </a>
                    )}
                </div>
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
                                    {story.eyebrow && <span className={styles.cardEyebrow}>{story.eyebrow}</span>}
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
