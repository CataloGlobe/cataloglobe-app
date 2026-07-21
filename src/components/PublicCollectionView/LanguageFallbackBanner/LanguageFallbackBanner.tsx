import { useTranslation } from "react-i18next";
import styles from "./LanguageFallbackBanner.module.scss";

type LanguageFallbackBannerProps = {
    /** Nome nativo della lingua effettivamente mostrata (contenuto visibile),
     *  es. "Italiano". NON la lingua richiesta e fallita. */
    displayedLanguageName: string;
    /** Ri-tenta il fetch della lingua richiesta (bump retryToken a monte). */
    onRetry: () => void;
};

/**
 * Banner informativo persistente: il cambio-lingua è fallito (Supabase down +
 * nessuna cache locale per quella lingua), quindi la pagina resta sul menù già
 * visibile invece di andare in error card full-page. Spiega quale lingua è
 * effettivamente mostrata e offre "Riprova".
 *
 * Distinto da `StaleDataBanner` (contenuto potenzialmente vecchio, tono ambra):
 * qui il contenuto è fresco, è solo il *cambio* verso un'altra lingua a non
 * essere riuscito → tono informativo `--pub-primary-soft`.
 */
export default function LanguageFallbackBanner({
    displayedLanguageName,
    onRetry
}: LanguageFallbackBannerProps) {
    const { t } = useTranslation("public");

    return (
        <div className={styles.banner} role="status" aria-live="polite">
            <span className={styles.message}>
                {t("lang_fallback.message", { lang: displayedLanguageName })}
            </span>
            <button type="button" className={styles.retry} onClick={onRetry}>
                {t("lang_fallback.retry")}
            </button>
        </div>
    );
}
