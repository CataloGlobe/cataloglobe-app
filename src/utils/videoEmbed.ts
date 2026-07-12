export type VideoEmbedProvider = "youtube" | "vimeo";

const YOUTUBE_PATTERNS = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([\w-]{6,})/,
];

const VIMEO_PATTERNS = [
    /vimeo\.com\/(?:video\/)?(\d+)/,
];

const BARE_ID_PATTERN = /^[\w-]{6,}$/;

function extractId(ref: string, patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
        const match = ref.match(pattern);
        if (match?.[1]) return match[1];
    }
    if (BARE_ID_PATTERN.test(ref.trim())) return ref.trim();
    return null;
}

/** Normalizza `{ provider, ref }` (URL o ID grezzo) in un URL embed iframe. Ritorna `null` se non parsabile.
 *  YouTube usa il dominio `youtube-nocookie.com` (no tracking cookie finché l'utente non clicca play —
 *  l'iframe è montato solo dopo il click, vedi PublicVideoBlock facade). `autoplay=1` è sicuro qui perché
 *  l'iframe non esiste nel DOM finché non è il click dell'utente a richiederlo. */
export function getVideoEmbedUrl(provider: VideoEmbedProvider, ref: string): string | null {
    const trimmed = ref.trim();
    if (!trimmed) return null;

    if (provider === "youtube") {
        const id = extractId(trimmed, YOUTUBE_PATTERNS);
        return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : null;
    }

    if (provider === "vimeo") {
        const id = extractId(trimmed, VIMEO_PATTERNS);
        return id ? `https://player.vimeo.com/video/${id}?autoplay=1` : null;
    }

    return null;
}

/** URL miniatura statica per la facade (nessuna chiamata API). Solo YouTube offre un pattern
 *  pubblico senza autenticazione (`img.youtube.com/vi/<id>/hqdefault.jpg`); Vimeo richiede
 *  l'oEmbed API, fuori scope — ritorna `null` e la facade degrada a placeholder con icona. */
export function getVideoThumbnailUrl(provider: VideoEmbedProvider, ref: string): string | null {
    const trimmed = ref.trim();
    if (!trimmed) return null;

    if (provider === "youtube") {
        const id = extractId(trimmed, YOUTUBE_PATTERNS);
        return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
    }

    return null;
}
