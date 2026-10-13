import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import itCommon from "./locales/it/common.json";
import itPublic from "./locales/it/public.json";
import itErrors from "./locales/it/errors.json";
import { registerLanguageLoaders } from "./loadLanguage";

/**
 * i18n del bundle pubblico (entry-client): solo l'italiano è nel JS iniziale.
 * Il server rende le stringhe in italiano (`@/i18n`, tutte le lingue), quindi
 * l'hydration parte da qui senza differenze; le altre lingue arrivano con
 * `changePublicLanguage` (`./loadLanguage`) quando la pagina le chiede.
 * Niente namespace `admin`: la pagina pubblica non lo usa.
 */
i18n.use(initReactI18next).init({
    resources: {
        it: { common: itCommon, public: itPublic, errors: itErrors }
    },
    lng: "it",
    fallbackLng: "it",
    ns: ["common", "public", "errors"],
    defaultNS: "public",
    interpolation: {
        escapeValue: false
    },
    react: {
        useSuspense: false
    }
});

// Le altre lingue, un chunk lazy per file (l'italiano è già qui sopra).
registerLanguageLoaders(
    import.meta.glob<Record<string, unknown>>(
        ["./locales/*/{common,public,errors}.json", "!./locales/it/*.json"],
        { import: "default" }
    )
);

export default i18n;
