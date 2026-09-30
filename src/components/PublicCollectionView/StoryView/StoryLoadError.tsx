import { useTranslation } from "react-i18next";
import Text from "@/components/ui/Text/Text";
import styles from "./StoryLoadError.module.scss";

type StoryLoadErrorProps = {
    /** Rilancia la lettura (bump di retryToken nel chiamante). */
    onRetry: () => void;
};

/** Contenuto dello stato di errore di elenco e lettore delle storie:
 *  messaggio + «Riprova». Il contenitore (stateBlock) resta al chiamante. */
export default function StoryLoadError({ onRetry }: StoryLoadErrorProps) {
    const { t } = useTranslation("public");

    return (
        <>
            <Text variant="body" color="var(--pub-bg-text-muted)">
                {t("story.error")}
            </Text>
            <button type="button" className={styles.retry} onClick={onRetry}>
                {t("error.retry")}
            </button>
        </>
    );
}
