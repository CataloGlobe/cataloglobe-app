import { FramedMedia } from "@components/ui/FramedMedia";
import { frameToRatio, FRAMING_DEFAULTS } from "@components/ui/ImageReframeEditor/types";
import type { StoryImageBlock } from "@/services/supabase/stories";
import styles from "./PublicImageBlock.module.scss";

type PublicImageBlockProps = {
    block: StoryImageBlock;
};

export default function PublicImageBlock({ block }: PublicImageBlockProps) {
    // Frame + framing derivano dallo STESSO block.frame (unica sorgente): il
    // container riserva l'altezza via aspect-ratio (data-frame) → niente CLS, e
    // FramedMedia riproduce l'inquadratura con lo stesso rapporto di riquadro.
    const frame = block.frame ?? "3:2";

    return (
        <figure className={styles.figure}>
            <div className={styles.frameBox} data-frame={frame}>
                <FramedMedia
                    source={block.url}
                    framing={block.framing ?? FRAMING_DEFAULTS}
                    aspectRatio={block.mediaAspectRatio ?? null}
                    frameRatio={frameToRatio(frame)}
                    alt={block.caption ?? ""}
                />
            </div>
            {block.caption && <figcaption className={styles.caption}>{block.caption}</figcaption>}
        </figure>
    );
}
