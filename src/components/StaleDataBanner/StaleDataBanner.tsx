import { useTranslation } from "react-i18next";
import styles from "./StaleDataBanner.module.scss";

type StaleDataBannerProps = {
    /** Senza: niente bottone (l'avviso non ha un gesto che lo risolve). */
    onRetry?: () => void;
    /** Testo dell'avviso. Default: contenuti forse non aggiornati. Lo stesso
     *  tono ambra vale per ogni dato parziale della pagina (es. allergeni
     *  non caricati). */
    message?: string;
};

export default function StaleDataBanner({ onRetry, message }: StaleDataBannerProps) {
    const { t } = useTranslation("public");

    return (
        <div className={styles.banner} role="status" aria-live="polite">
            <span className={styles.message}>{message ?? t("stale_banner.message")}</span>
            {onRetry && (
                <button type="button" className={styles.retry} onClick={onRetry}>
                    {t("stale_banner.retry")}
                </button>
            )}
        </div>
    );
}
