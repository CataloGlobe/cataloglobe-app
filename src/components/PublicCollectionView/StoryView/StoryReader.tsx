import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, BookOpenText } from "lucide-react";
import { fetchPublicStory } from "@/services/supabase/stories";
import type { PublicStoryDetail, StoryBlock } from "@/services/supabase/stories";
import Text from "@/components/ui/Text/Text";
import PublicTextBlock from "./blocks/PublicTextBlock";
import PublicImageBlock from "./blocks/PublicImageBlock";
import PublicVideoBlock from "./blocks/PublicVideoBlock";
import PublicHeadingBlock from "./blocks/PublicHeadingBlock";
import PublicQuoteBlock from "./blocks/PublicQuoteBlock";
import styles from "./StoryReader.module.scss";

type StoryReaderProps = {
    slug: string;
    storyId: string;
    onClose: () => void;
    /** Apre la scheda prodotto associata (stesso meccanismo di CollectionView). Assente → nessun rimando cliccabile. */
    onOpenProduct?: (productId: string) => void;
};

type LoadState =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; story: PublicStoryDetail };

function renderBlock(block: StoryBlock, isLead: boolean) {
    switch (block.type) {
        case "text":
            return <PublicTextBlock key={block.id} block={block} isLead={isLead} />;
        case "heading":
            return <PublicHeadingBlock key={block.id} block={block} />;
        case "quote":
            return <PublicQuoteBlock key={block.id} block={block} />;
        case "image":
            return <PublicImageBlock key={block.id} block={block} />;
        case "video":
            return <PublicVideoBlock key={block.id} block={block} />;
        default:
            return null;
    }
}

export default function StoryReader({ slug, storyId, onClose, onOpenProduct }: StoryReaderProps) {
    const { t } = useTranslation("public");
    const [state, setState] = useState<LoadState>({ status: "loading" });

    // Fetch lazy: i body_blocks non sono nel feed (card leggere) — servono
    // solo quando il lettore si apre.
    useEffect(() => {
        let cancelled = false;
        setState({ status: "loading" });
        fetchPublicStory(slug, storyId)
            .then(story => {
                if (!cancelled) setState({ status: "ready", story });
            })
            .catch(() => {
                if (!cancelled) setState({ status: "error" });
            });
        return () => {
            cancelled = true;
        };
    }, [slug, storyId]);

    // Sommario: SOLO il primo blocco testo della storia riceve il trattamento
    // editoriale "lead" (corpo maggiore). Nessun campo/tipo nuovo: regola di stile.
    const firstTextId =
        state.status === "ready"
            ? state.story.body_blocks.find(b => b.type === "text")?.id
            : undefined;

    return (
        <div className={styles.root}>
            {/* A livello .frame (fuori dalla .column) → si allinea al bordo sinistro
                della copertina, non alla colonna di lettura più stretta. */}
            <button type="button" className={styles.backButton} onClick={onClose}>
                <ChevronLeft size={18} strokeWidth={2} />
                {t("story.back_to_list")}
            </button>

            {state.status === "loading" && (
                <div className={styles.stateBlock}>
                    <Text variant="body" color="var(--pub-bg-text-muted)">
                        {t("story.loading")}
                    </Text>
                </div>
            )}

            {state.status === "error" && (
                <div className={styles.stateBlock}>
                    <Text variant="body" color="var(--pub-bg-text-muted)">
                        {t("story.error")}
                    </Text>
                </div>
            )}

            {state.status === "ready" && (
                <article className={styles.article}>
                    {/* Copertina full-bleed: esce dalla colonna di lettura e riempie il
                        .frame (apertura editoriale, non "la prima foto"). */}
                    {state.story.cover_media && (
                        <div className={styles.cover}>
                            <img src={state.story.cover_media} alt="" />
                        </div>
                    )}
                    <div className={styles.column}>
                        {state.story.eyebrow && <span className={styles.eyebrow}>{state.story.eyebrow}</span>}
                        <h1 className={styles.title}>{state.story.title}</h1>

                        <div className={styles.blocks}>
                            {state.story.body_blocks.map(block => renderBlock(block, block.id === firstTextId))}
                        </div>

                        {state.story.product && (
                            <button
                                type="button"
                                className={styles.productLink}
                                onClick={() => onOpenProduct?.(state.story.product!.id)}
                                disabled={!onOpenProduct}
                                aria-label={t("story.product_link", { name: state.story.product.name })}
                            >
                                <span className={styles.productLinkIcon}>
                                    <BookOpenText size={18} strokeWidth={1.5} />
                                </span>
                                <span className={styles.productLinkBody}>
                                    <span className={styles.productLinkLabel}>{t("story.product_link_label")}</span>
                                    <span className={styles.productLinkName}>{state.story.product.name}</span>
                                </span>
                            </button>
                        )}
                    </div>
                </article>
            )}
        </div>
    );
}
