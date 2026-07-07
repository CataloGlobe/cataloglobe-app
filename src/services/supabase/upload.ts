import { supabase } from "@/services/supabase/client";

/**
 * Appende un query param di cache-busting a un URL pubblico Supabase Storage.
 * Necessario quando il path di upload e' deterministico (upsert sullo stesso file):
 * il CDN servirebbe la versione cached e l'URL salvato in DB sarebbe identico
 * a prima, quindi React non re-renderizzerebbe nemmeno l'<img>.
 */
export function appendCacheBuster(url: string): string {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${Date.now()}`;
}

export async function uploadProductImage(
    tenantId: string,
    productId: string,
    file: File
): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${tenantId}/products/${productId}.${ext}`;

    const { error } = await supabase.storage
        .from("product-images")
        .upload(filePath, file, { upsert: true, contentType: file.type });

    if (error) throw new Error("Upload fallito");

    const { data } = supabase.storage.from("product-images").getPublicUrl(filePath);

    return appendCacheBuster(data.publicUrl);
}

export async function deleteProductImage(
    tenantId: string,
    productId: string,
    ext: string
): Promise<void> {
    const filePath = `${tenantId}/products/${productId}.${ext}`;
    const { error } = await supabase.storage.from("product-images").remove([filePath]);
    if (error) throw error;
}

const PRODUCT_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"] as const;

/**
 * Extracts the bucket-relative path from a Supabase Storage public/signed URL.
 * Returns null if the URL doesn't match the expected pattern.
 */
export function extractStoragePath(imageUrl: string, bucket: string): string | null {
    const re = new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?]+)`);
    const match = imageUrl.match(re);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Best-effort cleanup of a product image after the product row has been deleted.
 *
 * Strategy:
 *   1. If `imageUrl` is provided, parse the bucket path from the URL — single precise remove.
 *   2. Otherwise, attempt removal on the deterministic path with all known extensions.
 *
 * `storage.remove` is idempotent on missing paths, so the fallback is safe even
 * when only one extension actually exists. Throws on transport errors so the
 * caller can decide whether to swallow (recommended: silent warn).
 */
export async function deleteProductImageBestEffort(
    tenantId: string,
    productId: string,
    imageUrl: string | null
): Promise<void> {
    const parsed = imageUrl ? extractStoragePath(imageUrl, "product-images") : null;
    const paths = parsed
        ? [parsed]
        : PRODUCT_IMAGE_EXTS.map(ext => `${tenantId}/products/${productId}.${ext}`);
    const { error } = await supabase.storage.from("product-images").remove(paths);
    if (error) throw error;
}

export async function uploadFeaturedContentImage(
    tenantId: string,
    contentId: string,
    file: File
): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${tenantId}/${contentId}.${ext}`;

    const { error } = await supabase.storage
        .from("featured-contents")
        .upload(filePath, file, { upsert: true, contentType: file.type });

    if (error) throw new Error("Upload immagine fallito");

    const { data } = supabase.storage.from("featured-contents").getPublicUrl(filePath);
    return data.publicUrl;
}

export async function deleteFeaturedContentImage(
    tenantId: string,
    contentId: string,
    ext: string
): Promise<void> {
    const filePath = `${tenantId}/${contentId}.${ext}`;
    const { error } = await supabase.storage.from("featured-contents").remove([filePath]);
    if (error) throw error;
}

const FEATURED_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"] as const;

/**
 * Best-effort cleanup of a featured-content image after the row has been deleted.
 *
 * Mirrors `deleteProductImageBestEffort`:
 *   1. Parse bucket path from the URL when possible (precise single remove).
 *   2. Otherwise fan out on deterministic path with all known extensions.
 *
 * `media` may be a full URL, a bucket-relative path, or null. `storage.remove`
 * is idempotent on missing paths, so the fallback is safe.
 */
export async function deleteFeaturedContentImageBestEffort(
    tenantId: string,
    contentId: string,
    media: string | null
): Promise<void> {
    let paths: string[];
    if (media) {
        const parsed = extractStoragePath(media, "featured-contents");
        if (parsed) {
            paths = [parsed];
        } else if (media.includes("/")) {
            paths = [media];
        } else {
            paths = FEATURED_IMAGE_EXTS.map(ext => `${tenantId}/${contentId}.${ext}`);
        }
    } else {
        paths = FEATURED_IMAGE_EXTS.map(ext => `${tenantId}/${contentId}.${ext}`);
    }
    const { error } = await supabase.storage.from("featured-contents").remove(paths);
    if (error) throw error;
}

/** Mirrors uploadFeaturedContentImage. Shared by story cover + tenant "cappello" cover. */
export async function uploadStoryImage(
    tenantId: string,
    storyId: string,
    file: File
): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${tenantId}/${storyId}.${ext}`;

    const { error } = await supabase.storage
        .from("stories")
        .upload(filePath, file, { upsert: true, contentType: file.type });

    if (error) throw new Error("Upload immagine fallito");

    const { data } = supabase.storage.from("stories").getPublicUrl(filePath);
    return appendCacheBuster(data.publicUrl);
}

const STORY_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"] as const;

/** Mirrors deleteFeaturedContentImageBestEffort. */
export async function deleteStoryImageBestEffort(
    tenantId: string,
    storyId: string,
    media: string | null
): Promise<void> {
    let paths: string[];
    if (media) {
        const parsed = extractStoragePath(media, "stories");
        if (parsed) {
            paths = [parsed];
        } else if (media.includes("/")) {
            paths = [media];
        } else {
            paths = STORY_IMAGE_EXTS.map(ext => `${tenantId}/${storyId}.${ext}`);
        }
    } else {
        paths = STORY_IMAGE_EXTS.map(ext => `${tenantId}/${storyId}.${ext}`);
    }
    const { error } = await supabase.storage.from("stories").remove(paths);
    if (error) throw error;
}
