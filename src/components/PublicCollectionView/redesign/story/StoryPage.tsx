import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, ScrollText } from "lucide-react";
import { fetchPublicStory } from "@/services/supabase/stories";
import type { PublicStoryDetail, StoryBlock } from "@/services/supabase/stories";
import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import PublicTextBlock from "@components/PublicCollectionView/StoryView/blocks/PublicTextBlock";
import PublicImageBlock from "@components/PublicCollectionView/StoryView/blocks/PublicImageBlock";
import PublicVideoBlock from "@components/PublicCollectionView/StoryView/blocks/PublicVideoBlock";
import PublicHeadingBlock from "@components/PublicCollectionView/StoryView/blocks/PublicHeadingBlock";
import PublicQuoteBlock from "@components/PublicCollectionView/StoryView/blocks/PublicQuoteBlock";
import PublicListBlock from "@components/PublicCollectionView/StoryView/blocks/PublicListBlock";
import PublicProductBlock from "@components/PublicCollectionView/StoryView/blocks/PublicProductBlock";
import StoryLoadError from "@components/PublicCollectionView/StoryView/StoryLoadError";
import { pushProductSheet } from "../product/productSheet";
import type { StoryRef } from "./storySheet";
import styles from "./StoryPage.module.scss";

type Props = {
    slug: string;
    story: StoryRef;
    findProduct: (productId: string) => CollectionViewSectionItem | null;
    /** Analitiche dell'apertura di un piatto dal racconto, come «Perfetto con». */
    onTrackOpen: (item: CollectionViewSectionItem) => void;
    /** Il piatto da cui si è arrivati, letto una volta all'apertura: «Si abbina a» lui farebbe solo «‹». */
    fromProductId: () => string | null;
};

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; story: PublicStoryDetail };

// Racconti già letti in questa visita: tornare avanti e indietro nel foglio non li rilegge.
const loaded = new Map<string, PublicStoryDetail>();

/**
 * Lettore di una storia come pagina del foglio unico (spec §6): si apre da «La
 * storia» nella scheda, con «‹ Nome del piatto»; tornando, la scheda è dove la
 * si era lasciata. Stessi blocchi del lettore della tab Storia, che non cambia.
 * Copertina e titolo arrivano dalla scheda e si vedono subito; il racconto si
 * legge all'apertura, come nella tab.
 */
export default function StoryPage({ slug, story, findProduct, onTrackOpen, fromProductId }: Props) {
    const { t } = useTranslation("public");
    const cacheKey = `${slug}/${story.id}`;
    const [state, setState] = useState<LoadState>(() => {
        const cached = loaded.get(cacheKey);
        return cached ? { status: "ready", story: cached } : { status: "loading" };
    });
    const [retryToken, setRetryToken] = useState(0);
    const [fromId] = useState(fromProductId);

    useEffect(() => {
        const cached = loaded.get(cacheKey);
        if (cached) {
            setState({ status: "ready", story: cached });
            return;
        }
        let cancelled = false;
        setState({ status: "loading" });
        fetchPublicStory(slug, story.id)
            .then(detail => {
                loaded.set(cacheKey, detail);
                if (!cancelled) setState({ status: "ready", story: detail });
            })
            .catch(() => {
                if (!cancelled) setState({ status: "error" });
            });
        return () => {
            cancelled = true;
        };
    }, [cacheKey, slug, story.id, retryToken]);

    const detail = state.status === "ready" ? state.story : null;
    // Quello della scheda finché c'è: non cambia sotto gli occhi all'arrivo del racconto (e resta uguale al titolo in testata).
    const cover = story.cover ?? detail?.cover_media ?? null;
    const title = story.title;
    // Il primo testo è il sommario, come nel lettore della tab.
    const leadId = detail?.body_blocks.find(block => block.type === "text")?.id;
    const openProduct = (productId: string) => {
        const item = findProduct(productId);
        if (!item) return;
        onTrackOpen(item);
        pushProductSheet(item);
    };
    const linked = detail?.product && detail.product.id !== fromId && findProduct(detail.product.id) ? detail.product : null;

    return (
        <article className={styles.root}>
            {cover ? (
                <div className={styles.cover}>
                    <img src={cover} alt="" width={600} height={400} decoding="async" />
                </div>
            ) : null}
            <header className={styles.head}>
                {detail?.eyebrow ? <span className={styles.eyebrow}>{detail.eyebrow}</span> : null}
                {/* Il titolo accessibile è in testata (h2 invisibile): qui solo a vista. */}
                <p className={styles.title} aria-hidden="true">
                    {title}
                </p>
            </header>

            {state.status === "loading" ? (
                <p className={styles.muted} role="status">
                    {t("story.loading")}
                </p>
            ) : null}
            {state.status === "error" ? <StoryLoadError onRetry={() => setRetryToken(n => n + 1)} /> : null}

            {detail ? (
                <div className={styles.blocks}>
                    {detail.body_blocks.map(block => renderBlock(block, block.id === leadId, findProduct, openProduct))}
                </div>
            ) : null}

            {linked ? (
                <button
                    type="button"
                    className={styles.product}
                    onClick={() => openProduct(linked.id)}
                    aria-label={t("story.pairs_with", { name: linked.name })}
                >
                    <ScrollText size={20} aria-hidden="true" className={styles.muted} />
                    <span className={styles.productBody}>
                        <span className={styles.productLabel}>{t("story.pairs_with_label")}</span>
                        <span className={styles.productName}>{linked.name}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" className={styles.muted} />
                </button>
            ) : null}
        </article>
    );
}

function renderBlock(
    block: StoryBlock,
    isLead: boolean,
    findProduct: (productId: string) => CollectionViewSectionItem | null,
    openProduct: (productId: string) => void
) {
    switch (block.type) {
        case "text":
            return <PublicTextBlock key={block.id} block={block} isLead={isLead} />;
        case "heading":
            return <PublicHeadingBlock key={block.id} block={block} />;
        case "quote":
            return <PublicQuoteBlock key={block.id} block={block} />;
        case "list":
            return <PublicListBlock key={block.id} block={block} />;
        case "image":
            return <PublicImageBlock key={block.id} block={block} />;
        case "video":
            return <PublicVideoBlock key={block.id} block={block} />;
        case "product":
            return <PublicProductBlock key={block.id} block={block} resolveProduct={findProduct} onOpenProduct={openProduct} />;
        default:
            return null;
    }
}
