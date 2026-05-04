import { useEffect } from "react";

type UsePageHeadProps = {
    title?: string;
    description?: string;
    lang?: string;
    imageUrl?: string;
    /** BCP47 locale per OpenGraph (es. "it_IT"). Auto-derivato da lang se non passato. */
    ogLocale?: string;
};

const FALLBACK_LANG = "it";

const BCP47_MAP: Record<string, string> = {
    it: "it_IT",
    en: "en_US",
    fr: "fr_FR",
    de: "de_DE",
    es: "es_ES"
};

function deriveOgLocale(lang: string): string {
    if (BCP47_MAP[lang]) return BCP47_MAP[lang];
    return `${lang}_${lang.toUpperCase()}`;
}

/**
 * Helper: trova (o crea) un <meta> via selector CSS, set content, ritorna
 * cleanup che ripristina il valore precedente o rimuove l'elemento se creato.
 */
function setMeta(selector: string, value: string): () => void {
    let el = document.head.querySelector<HTMLMetaElement>(selector);
    let created = false;

    if (!el) {
        el = document.createElement("meta");
        const match = selector.match(/\[(name|property)="([^"]+)"\]/);
        if (match) {
            el.setAttribute(match[1], match[2]);
        }
        document.head.appendChild(el);
        created = true;
    }

    const previousValue = el.content;
    el.content = value;

    return () => {
        if (created) {
            el?.remove();
        } else if (el) {
            el.content = previousValue;
        }
    };
}

/**
 * Hook per impostare dinamicamente <html lang>, <title>, <meta description>
 * e tag OpenGraph (og:title, og:description, og:image, og:locale, og:type)
 * in base alla lingua e ai dati del business correnti.
 *
 * Cleanup: ripristina i valori precedenti al unmount (o al cambio deps)
 * per evitare contaminazione cross-route.
 *
 * Pattern: useEffect + document API. Zero dependencies, zero bundle bloat.
 */
export function usePageHead({
    title,
    description,
    lang,
    imageUrl,
    ogLocale
}: UsePageHeadProps): void {
    useEffect(() => {
        const cleanups: Array<() => void> = [];

        // <html lang="...">
        if (lang) {
            const previousLang = document.documentElement.lang;
            document.documentElement.lang = lang;
            cleanups.push(() => {
                document.documentElement.lang = previousLang || FALLBACK_LANG;
            });
        }

        // <title>
        if (title) {
            const previousTitle = document.title;
            document.title = title;
            cleanups.push(() => {
                document.title = previousTitle;
            });
        }

        // <meta name="description">
        if (description) {
            cleanups.push(setMeta('meta[name="description"]', description));
        }

        // OpenGraph
        if (title) {
            cleanups.push(setMeta('meta[property="og:title"]', title));
        }
        if (description) {
            cleanups.push(setMeta('meta[property="og:description"]', description));
        }
        if (imageUrl) {
            cleanups.push(setMeta('meta[property="og:image"]', imageUrl));
        }
        if (lang) {
            const locale = ogLocale ?? deriveOgLocale(lang);
            cleanups.push(setMeta('meta[property="og:locale"]', locale));
        }

        // og:type fisso a "website"
        cleanups.push(setMeta('meta[property="og:type"]', "website"));

        return () => {
            for (let i = cleanups.length - 1; i >= 0; i--) {
                cleanups[i]();
            }
        };
    }, [title, description, lang, imageUrl, ogLocale]);
}
