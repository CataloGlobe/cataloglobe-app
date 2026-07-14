import type { StoryHeadingBlock } from "@/services/supabase/stories";
import styles from "./PublicHeadingBlock.module.scss";

type PublicHeadingBlockProps = {
    block: StoryHeadingBlock;
};

// <h2>: il title della storia è già un <h1> in StoryReader (mai due <h1>).
export default function PublicHeadingBlock({ block }: PublicHeadingBlockProps) {
    return <h2 className={styles.heading}>{block.content}</h2>;
}
