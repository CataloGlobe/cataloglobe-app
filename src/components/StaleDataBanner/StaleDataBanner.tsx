import { useTranslation } from "react-i18next";
import styles from "./StaleDataBanner.module.scss";

type StaleDataBannerProps = {
    onRetry: () => void;
};

export default function StaleDataBanner({ onRetry }: StaleDataBannerProps) {
    const { t } = useTranslation("public");

    return (
        <div className={styles.banner} role="status" aria-live="polite">
            <span className={styles.message}>{t("stale_banner.message")}</span>
            <button type="button" className={styles.retry} onClick={onRetry}>
                {t("stale_banner.retry")}
            </button>
        </div>
    );
}
