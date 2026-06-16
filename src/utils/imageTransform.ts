/**
 * ⚠️ SYNC con api/_lib/imageTransform.ts (usato da publicShell.ts SSR).
 * Duplicato lì perché @vercel/node non bundla import che risalgono fuori da api/.
 * Stesso pattern di publicFontUrl.ts. Modulo PURO: niente DOM/Node/process/env.
 *
 * Costruisce un set responsive (src/srcset/sizes) per la cover servita via
 * Supabase image transformations (`/render/image/public/...?width=&quality=`).
 * Il browser negozia webp/avif via header `Accept` → nessun param `format`.
 *
 * Solo URL https di Supabase Storage object-public: ogni altro input (CDN
 * esterni, data:, http) → null = passthrough (il chiamante usa il raw src).
 */

const STORAGE_PUBLIC_SEGMENT = "/storage/v1/object/public/";
const STORAGE_RENDER_SEGMENT = "/storage/v1/render/image/public/";

/** Width del set responsive (px). La cover è full-width → cap a 1280. */
export const COVER_WIDTHS = [480, 760, 1080, 1280] as const;
const COVER_QUALITY = 82;
const COVER_FALLBACK_WIDTH = 760;

export type ResponsiveImageSet = {
    /** Variante fallback (per browser senza supporto srcset). */
    src: string;
    /** Candidate string `url Nw, url Nw, …`. */
    srcset: string;
    /** sizes attribute. */
    sizes: string;
};

/**
 * @param publicUrl URL pubblico Supabase Storage (può avere `?v=`/`?t=`).
 * @returns set responsive, oppure null se l'URL non è una storage-object-public
 *          https del progetto (→ il chiamante serve il raw src senza srcset).
 */
export function buildCoverImageSet(
    publicUrl: string | null | undefined
): ResponsiveImageSet | null {
    if (!publicUrl) return null;
    if (!publicUrl.startsWith("https://")) return null;
    if (!publicUrl.includes(STORAGE_PUBLIC_SEGMENT)) return null;

    // Separa l'eventuale query (cache-buster ?v=) dal path, preservandola.
    const queryIdx = publicUrl.indexOf("?");
    const basePath = queryIdx === -1 ? publicUrl : publicUrl.slice(0, queryIdx);
    const existingQuery = queryIdx === -1 ? "" : publicUrl.slice(queryIdx + 1);

    const renderPath = basePath.replace(STORAGE_PUBLIC_SEGMENT, STORAGE_RENDER_SEGMENT);

    const variant = (width: number): string => {
        const params = `width=${width}&quality=${COVER_QUALITY}${
            existingQuery ? `&${existingQuery}` : ""
        }`;
        return `${renderPath}?${params}`;
    };

    const srcset = COVER_WIDTHS.map(w => `${variant(w)} ${w}w`).join(", ");

    return {
        src: variant(COVER_FALLBACK_WIDTH),
        srcset,
        sizes: "100vw"
    };
}
