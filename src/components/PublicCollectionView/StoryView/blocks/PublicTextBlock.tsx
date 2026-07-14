import type { StoryTextBlock } from "@/services/supabase/stories";
import styles from "./PublicTextBlock.module.scss";

type PublicTextBlockProps = {
    block: StoryTextBlock;
    /** Primo blocco testo della storia → trattamento "sommario" (corpo maggiore). */
    isLead?: boolean;
};

export default function PublicTextBlock({ block, isLead }: PublicTextBlockProps) {
    return <p className={`${styles.text} ${isLead ? styles.lead : ""}`}>{block.content}</p>;
}
