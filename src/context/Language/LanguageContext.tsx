import { createContext } from "react";

export type AvailableLanguage = {
    code: string;
    name_native: string;
    name_en?: string;
    flag_emoji: string | null;
};

export type LanguageContextType = {
    currentLang: string;
    availableLanguages: AvailableLanguage[];
    baseLanguage: string;
    isCurrentBase: boolean;
    setLang: (code: string) => void;
};

export const LanguageContext = createContext<LanguageContextType | null>(null);
