import { useLanguage } from "@context/Language/useLanguage";
import LanguageSelectorView from "./LanguageSelectorView";

type LanguageSelectorProps = {
    /** Contenitore scrollabile (preview = device frame). Fallback window a runtime.
     *  Stessa logica dell'header: qualsiasi scroll chiude il dropdown. */
    scrollContainerEl?: HTMLElement | null;
};

/**
 * Container context del selettore lingua per il menu pubblico. Legge lingue +
 * lingua attiva dal `LanguageProvider` e delega il cambio a `setLang` (che
 * naviga cambiando il segmento URL). La UI vive in `LanguageSelectorView`
 * (condivisa con la pagina di prenotazione, provider-free).
 */
export default function LanguageSelector({ scrollContainerEl }: LanguageSelectorProps = {}) {
    const { currentLang, availableLanguages, setLang } = useLanguage();

    return (
        <LanguageSelectorView
            languages={availableLanguages}
            currentLang={currentLang}
            onSelect={setLang}
            scrollContainerEl={scrollContainerEl}
        />
    );
}
