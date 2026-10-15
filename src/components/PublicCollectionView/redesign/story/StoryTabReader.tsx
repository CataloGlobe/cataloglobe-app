import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, UtensilsCrossed } from "lucide-react";
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
import { cachedStory, loadStory, readingMinutes, storyCard } from "./storyStore";
import styles from "./StoryTabReader.module.scss";

type Props = {
    slug: string;
    storyId: string;
    activityName: string;
    onClose: () => void;
    onOpenProduct: (productId: string) => void;
    findProduct: (productId: string) => CollectionViewSectionItem | null;
};

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; story: PublicStoryDetail };

const SLIDE_MS = 320;

/**
 * Lettore della pagina Storia (mockup v38): entra da destra sopra la pagina, con
 * «‹» che torna all'elenco. Copertina, occhiello e titolo arrivano dalla scheda
 * dell'elenco e si vedono subito; il racconto si legge all'apertura.
 */
export default function StoryTabReader({ slug, storyId, activityName, onClose, onOpenProduct, findProduct }: Props) {
    const { t } = useTranslation("public");
    const card = storyCard(slug, storyId);
    const [state, setState] = useState<LoadState>(() => {
        const cached = cachedStory(slug, storyId);
        return cached ? { status: "ready", story: cached } : { status: "loading" };
    });
    const [retryToken, setRetryToken] = useState(0);
    const [leaving, setLeaving] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const backRef = useRef<HTMLButtonElement>(null);
    // Chi ha aperto il lettore, letto al primo disegno: lì torna il fuoco alla chiusura.
    const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement));

    useEffect(() => {
        if (state.status === "ready" && retryToken === 0) return;
        let cancelled = false;
        setState({ status: "loading" });
        loadStory(slug, storyId).then(
            story => {
                if (!cancelled) setState({ status: "ready", story });
            },
            () => {
                if (!cancelled) setState({ status: "error" });
            }
        );
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug, storyId, retryToken]);

    // Entra da destra (animazione CSS al montaggio); il fuoco va su «‹».
    useEffect(() => {
        backRef.current?.focus({ preventScroll: true });
    }, []);

    const close = () => {
        if (leaving) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const done = () => {
            onClose();
            if (opener instanceof HTMLElement && document.contains(opener)) {
                opener.focus({ preventScroll: true });
            }
        };
        if (reduce) {
            done();
            return;
        }
        setLeaving(true);
        window.setTimeout(done, SLIDE_MS);
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    });

    const detail = state.status === "ready" ? state.story : null;
    const title = detail?.title ?? card?.title ?? "";
    const eyebrow = detail?.eyebrow ?? card?.eyebrow ?? null;
    const cover = card?.cover_media ?? detail?.cover_media ?? null;
    const leadId = detail?.body_blocks.find(block => block.type === "text")?.id;
    const product = detail?.product && findProduct(detail.product.id) ? detail.product : null;

    return (
        <div
            ref={rootRef}
            className={styles.root}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            data-leaving={leaving || undefined}
        >
            <div className={styles.top}>
                <button ref={backRef} type="button" className={styles.back} onClick={close} aria-label={t("story.back_aria")}>
                    <ChevronLeft size={22} strokeWidth={2} aria-hidden />
                </button>
            </div>
            {cover ? (
                <div className={styles.cover}>
                    <img src={cover} alt="" decoding="async" />
                </div>
            ) : (
                <div className={styles.noCover} />
            )}
            <article className={styles.body}>
                {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
                <h2 className={styles.title}>{title}</h2>
                {detail ? (
                    <div className={styles.meta}>
                        {t("story.reading_time", { count: readingMinutes(detail.body_blocks) })} · {activityName}
                    </div>
                ) : null}

                {state.status === "loading" ? (
                    <p className={styles.muted} role="status">
                        {t("story.loading")}
                    </p>
                ) : null}
                {state.status === "error" ? (
                    <div className={styles.error}>
                        <StoryLoadError onRetry={() => setRetryToken(n => n + 1)} />
                    </div>
                ) : null}

                {detail ? (
                    <div className={styles.blocks}>
                        {detail.body_blocks.map(block => renderBlock(block, block.id === leadId, findProduct, onOpenProduct))}
                    </div>
                ) : null}

                {product ? (
                    <button type="button" className={styles.dish} onClick={() => onOpenProduct(product.id)}>
                        <span className={styles.dishThumb} aria-hidden>
                            {findProduct(product.id)?.image ? (
                                <img src={findProduct(product.id)?.image ?? undefined} alt="" loading="lazy" />
                            ) : (
                                <UtensilsCrossed size={20} strokeWidth={1.75} />
                            )}
                        </span>
                        <span className={styles.dishText}>
                            {t("story.try_with")}
                            <b>{product.name}</b>
                        </span>
                        <ChevronRight size={20} strokeWidth={2} aria-hidden />
                    </button>
                ) : null}
            </article>
        </div>
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
