import { useTranslation } from "react-i18next";
import { PlayCircle } from "lucide-react";
import type { StoryVideoBlock } from "@/services/supabase/stories";
import { getVideoEmbedUrl } from "@/utils/videoEmbed";
import Text from "@/components/ui/Text/Text";
import styles from "./PublicVideoBlock.module.scss";

type PublicVideoBlockProps = {
    block: StoryVideoBlock;
};

export default function PublicVideoBlock({ block }: PublicVideoBlockProps) {
    const { t } = useTranslation("public");
    const embedUrl = getVideoEmbedUrl(block.provider, block.ref);

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

    return (
        <div className={styles.frame}>
            <iframe
                className={styles.iframe}
                src={embedUrl}
                title={t("story.video_aria")}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
            />
        </div>
    );
}
