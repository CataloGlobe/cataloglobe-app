import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayCircle, Play } from "lucide-react";
import type { StoryVideoBlock } from "@/services/supabase/stories";
import { getVideoEmbedUrl, getVideoThumbnailUrl } from "@/utils/videoEmbed";
import Text from "@/components/ui/Text/Text";
import styles from "./PublicVideoBlock.module.scss";

type PublicVideoBlockProps = {
    block: StoryVideoBlock;
};

/** Facade: miniatura + play, l'iframe si monta solo al click. Pagina apre al tavolo
 *  da rete mobile — niente script/tracking YouTube caricato finché l'utente non lo chiede. */
export default function PublicVideoBlock({ block }: PublicVideoBlockProps) {
    const { t } = useTranslation("public");
    const [playing, setPlaying] = useState(false);
    const [thumbFailed, setThumbFailed] = useState(false);
    const embedUrl = getVideoEmbedUrl(block.provider, block.ref);
    const thumbnailUrl = getVideoThumbnailUrl(block.provider, block.ref);

    if (!embedUrl) {
        return (
            <div className={styles.placeholder}>
                <PlayCircle size={32} strokeWidth={1.5} />
                <Text variant="body" color="var(--pub-text-secondary)">
                    {t("story.video_unavailable")}
                </Text>
            </div>
        );
    }

    if (playing) {
        return (
            <div className={styles.frame}>
                <iframe
                    className={styles.iframe}
                    src={embedUrl}
                    title={t("story.video_aria")}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </div>
        );
    }

    return (
        <button
            type="button"
            className={styles.facade}
            onClick={() => setPlaying(true)}
            aria-label={t("story.video_play_aria")}
        >
            {thumbnailUrl && !thumbFailed ? (
                <img
                    className={styles.facadeThumb}
                    src={thumbnailUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => setThumbFailed(true)}
                />
            ) : (
                <div className={styles.facadeThumbFallback} />
            )}
            <span className={styles.facadeScrim} />
            <span className={styles.facadePlay}>
                <Play size={22} strokeWidth={0} fill="currentColor" />
            </span>
        </button>
    );
}
