import { useTranslation } from "react-i18next";
import { useLanguage } from "@context/Language/useLanguage";
import { openVenueSheet } from "../sheets/venueSheetPages";
import styles from "./LanguageButton.module.scss";

/**
 * Lingua nell'isola: la bandiera apre la pagina «Lingua» del foglio unico (al
 * posto del `PublicSheet` di `LanguageSelector`). Niente con una lingua sola.
 */
export default function LanguageButton({ className, id }: { className: string; id?: string }) {
    const { t } = useTranslation("public");
    const { currentLang, availableLanguages } = useLanguage();
    if (availableLanguages.length <= 1) return null;
    const active = availableLanguages.find(lang => lang.code === currentLang);
    return (
        <button
            id={id}
            type="button"
            className={className}
            onClick={() => openVenueSheet("language")}
            aria-label={t("language_selector.trigger_aria")}
            aria-haspopup="dialog"
        >
            {active?.flag_emoji ? (
                <span className={styles.flag} aria-hidden>
                    {active.flag_emoji}
                </span>
            ) : (
                <span className={styles.code}>{currentLang.toUpperCase()}</span>
            )}
        </button>
    );
}
