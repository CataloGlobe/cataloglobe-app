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

/** Normalizza `{ provider, ref }` (URL o ID grezzo) in un URL embed iframe. Ritorna `null` se non parsabile. */
export function getVideoEmbedUrl(provider: VideoEmbedProvider, ref: string): string | null {
    const trimmed = ref.trim();
    if (!trimmed) return null;

    if (provider === "youtube") {
        const id = extractId(trimmed, YOUTUBE_PATTERNS);
        return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (provider === "vimeo") {
        const id = extractId(trimmed, VIMEO_PATTERNS);
        return id ? `https://player.vimeo.com/video/${id}` : null;
    }

    return null;
}
