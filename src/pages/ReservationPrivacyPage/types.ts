/**
 * Le cinque lingue della pagina pubblica, ristrette al sottoinsieme in cui
 * l'informativa esiste. Volutamente separate da `isValidLangFormat` (che
 * ammette qualunque tag lingua plausibile): lì si decide cosa è un tag valido,
 * qui cosa sappiamo tradurre.
 */
export const NOTICE_LANGS = ["it", "en", "fr", "de", "es"] as const;

export type PublicLang = (typeof NOTICE_LANGS)[number];

/** Ripiego: prodotto italiano, sedi italiane. */
export const DEFAULT_NOTICE_LANG: PublicLang = "it";

/**
 * Normalizza un valore grezzo (segmento URL, `i18n.language`, sottotag come
 * `de-DE`) verso una lingua in cui l'informativa esiste. Fuori dalle cinque →
 * italiano: meglio un documento leggibile in una lingua sbagliata che segnaposto
 * vuoti in quella giusta.
 */
export function resolveNoticeLang(raw: string | null | undefined): PublicLang {
    const base = (raw ?? "").toLowerCase().split(/[-_]/)[0];
    return (NOTICE_LANGS as readonly string[]).includes(base)
        ? (base as PublicLang)
        : DEFAULT_NOTICE_LANG;
}
