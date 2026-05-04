import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageContext, type AvailableLanguage } from "./LanguageContext";

type Props = {
    children: ReactNode;
    slug: string;
    currentLang: string;
    availableLanguages: AvailableLanguage[];
    baseLanguage: string;
};

export function LanguageProvider({
    children,
    slug,
    currentLang,
    availableLanguages,
    baseLanguage
}: Props) {
    const navigate = useNavigate();
    const { i18n } = useTranslation();

    useEffect(() => {
        if (i18n.language !== currentLang) {
            i18n.changeLanguage(currentLang);
        }
    }, [currentLang, i18n]);

    const setLang = (code: string) => {
        const url = code === baseLanguage ? `/${slug}` : `/${slug}/${code}`;
        navigate(url);
    };

    return (
        <LanguageContext.Provider
            value={{
                currentLang,
                availableLanguages,
                baseLanguage,
                isCurrentBase: currentLang === baseLanguage,
                setLang
            }}
        >
            {children}
        </LanguageContext.Provider>
    );
}
