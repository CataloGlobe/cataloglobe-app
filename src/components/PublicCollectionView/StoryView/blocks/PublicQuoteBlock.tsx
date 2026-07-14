import type { StoryQuoteBlock } from "@/services/supabase/stories";
import styles from "./PublicQuoteBlock.module.scss";

type PublicQuoteBlockProps = {
    block: StoryQuoteBlock;
};

export default function PublicQuoteBlock({ block }: PublicQuoteBlockProps) {
    return (
        <blockquote className={styles.quote}>
            <p className={styles.text}>{block.content}</p>
            {block.attribution && <cite className={styles.cite}>{block.attribution}</cite>}
        </blockquote>
    );
}
