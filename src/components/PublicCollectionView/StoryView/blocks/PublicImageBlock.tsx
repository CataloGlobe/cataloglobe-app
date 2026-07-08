import type { StoryImageBlock } from "@/services/supabase/stories";
import styles from "./PublicImageBlock.module.scss";

type PublicImageBlockProps = {
    block: StoryImageBlock;
};

export default function PublicImageBlock({ block }: PublicImageBlockProps) {
    return (
        <figure className={styles.figure}>
            <img className={styles.image} src={block.url} alt={block.caption ?? ""} loading="lazy" />
            {block.caption && <figcaption className={styles.caption}>{block.caption}</figcaption>}
        </figure>
    );
}
