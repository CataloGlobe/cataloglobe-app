import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { isValidLangFormat } from "@/utils/lang";

/**
 * Fase 1 (URL-driven) del wiring lingua pubblica: applica in modo OTTIMISTA la
 * lingua letta dal segmento URL `:lang`, PRIMA e indipendentemente dal payload.
 * Copre le shell (loading/error/not-found) e la prenotazione — qualsiasi route
 * pubblica che monti l'hook — per costruzione.
 *
 * La Fase 2 (`LanguageProvider`, ramo "ready") resta l'autorità: applica
 * `effective_language` dal payload e corregge il raro caso base≠it. Nessun loop:
 * entrambi guardati da `i18n.language !== target` con input stabili.
 *
 * `:lang` non valido o assente → default app "it" (prodotto IT-first; la Fase 2
 * corregge se il tenant ha base non-it). La correzione lingua-non-supportata
 * resta server-side (redirect via `resolveRedirect`), non duplicata qui.
 */
export function usePublicLanguageSync(): void {
    const { lang } = useParams<{ lang?: string }>();
    const { i18n } = useTranslation();

    useEffect(() => {
        const target = isValidLangFormat(lang) ? lang!.toLowerCase() : "it";
        if (i18n.language !== target) {
            i18n.changeLanguage(target);
        }
    }, [lang, i18n]);
}
