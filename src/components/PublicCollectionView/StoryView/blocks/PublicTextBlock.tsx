import type { StoryTextBlock } from "@/services/supabase/stories";
import styles from "./PublicTextBlock.module.scss";

type PublicTextBlockProps = {
    block: StoryTextBlock;
};

export default function PublicTextBlock({ block }: PublicTextBlockProps) {
    return <p className={styles.text}>{block.content}</p>;
}
