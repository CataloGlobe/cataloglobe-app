import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { isValidLangFormat } from "@/utils/lang";

/**
 * Fase 1 (URL-driven) del wiring lingua pubblica: applica in modo OTTIMISTA la
 * lingua letta dal segmento URL `:lang`, PRIMA e indipendentemente dal payload.
 * Copre le shell (loading/error/not-found) e la prenotazione.
 *
 * **Writer unico per stato.** Nel ramo "ready" della pagina pubblica comanda
 * `LanguageProvider` (Fase 2): applica `effective_language` dal payload e
 * preserva il caso base≠it. In quello stato questo hook DEVE cedere (`enabled
 * = false`), altrimenti i due writer entrano in conflitto: durante il refetch
 * del cambio lingua la pagina resta "ready" con payload STALE, quindi il
 * provider mira alla vecchia lingua mentre l'URL già punta alla nuova. Con
 * react-i18next ogni `changeLanguage` emette `languageChanged` → riesegue
 * entrambi gli effect → ping-pong infinito (`Maximum update depth`). La
 * guardia `i18n.language !== target` NON basta: protegge solo dal self-loop
 * (target coincidenti), non quando i due writer mirano a target DIVERSI.
 *
 * Perciò: `enabled` = true solo dove NON c'è provider (shell + prenotazione).
 *
 * `:lang` non valido o assente → default app "it" (prodotto IT-first; la Fase 2
 * corregge il raro base≠it). La correzione lingua-non-supportata resta
 * server-side (redirect via `resolveRedirect`), non duplicata qui.
 *
 * @param enabled  false quando un `LanguageProvider` governa la lingua (stato
 *                 "ready"). Default true (retrocompat: prenotazione/shell).
 */
export function usePublicLanguageSync(enabled: boolean = true): void {
    const { lang } = useParams<{ lang?: string }>();
    const { i18n } = useTranslation();

    useEffect(() => {
        if (!enabled) return;
        const target = isValidLangFormat(lang) ? lang!.toLowerCase() : "it";
        if (i18n.language !== target) {
            i18n.changeLanguage(target);
        }
    }, [enabled, lang, i18n]);
}
