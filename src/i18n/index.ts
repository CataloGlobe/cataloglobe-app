import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import itCommon from "./locales/it/common.json";
import itPublic from "./locales/it/public.json";
import itErrors from "./locales/it/errors.json";
import itAdmin from "./locales/it/admin.json";

import enCommon from "./locales/en/common.json";
import enPublic from "./locales/en/public.json";
import enErrors from "./locales/en/errors.json";
import enAdmin from "./locales/en/admin.json";

import frCommon from "./locales/fr/common.json";
import frPublic from "./locales/fr/public.json";
import frErrors from "./locales/fr/errors.json";
import frAdmin from "./locales/fr/admin.json";

import deCommon from "./locales/de/common.json";
import dePublic from "./locales/de/public.json";
import deErrors from "./locales/de/errors.json";
import deAdmin from "./locales/de/admin.json";

import esCommon from "./locales/es/common.json";
import esPublic from "./locales/es/public.json";
import esErrors from "./locales/es/errors.json";
import esAdmin from "./locales/es/admin.json";

const resources = {
    it: { common: itCommon, public: itPublic, errors: itErrors, admin: itAdmin },
    en: { common: enCommon, public: enPublic, errors: enErrors, admin: enAdmin },
    fr: { common: frCommon, public: frPublic, errors: frErrors, admin: frAdmin },
    de: { common: deCommon, public: dePublic, errors: deErrors, admin: deAdmin },
    es: { common: esCommon, public: esPublic, errors: esErrors, admin: esAdmin },
};

i18n.use(initReactI18next).init({
    resources,
    lng: "it",
    fallbackLng: "it",
    ns: ["common", "public", "errors", "admin"],
    defaultNS: "public",
    interpolation: {
        escapeValue: false
    },
    react: {
        useSuspense: false
    }
});

export default i18n;
