// Pipeline immagini del PDF menu (Stage 3b, riusata da Stage 5 per le foto).
// Principio: il documento react-pdf NON fa fetch a runtime — riceve solo
// data-URL già pronti (o null). Qualsiasi fallimento (CORS, 404, timeout,
// formato non renderizzabile) degrada a null senza mai lanciare: il PDF si
// genera comunque senza quell'immagine.

const FETCH_TIMEOUT_MS = 10_000;

/** Formati che react-pdf <Image> sa renderizzare nativamente. */
const RENDERABLE_MIME = new Set(["image/png", "image/jpeg", "image/jpg"]);

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/**
 * Transcodifica in PNG via canvas (WebP & co.). Solo browser: in ambienti
 * senza createImageBitmap/OffscreenCanvas (Node) ritorna null.
 */
async function transcodeToPngDataUrl(blob: Blob): Promise<string | null> {
    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
        return null;
    }
    try {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pngBlob = await canvas.convertToBlob({ type: "image/png" });
        const bytes = new Uint8Array(await pngBlob.arrayBuffer());
        return `data:image/png;base64,${bytesToBase64(bytes)}`;
    } catch {
        return null;
    }
}

export async function prefetchImageAsDataUrl(url: string | null): Promise<string | null> {
    if (!url) return null;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) return null;

        const blob = await response.blob();
        const mime = (blob.type || response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

        if (mime.includes("svg")) {
            // react-pdf <Image> non rende SVG: caso da gestire in un pass futuro.
            console.warn(`[prefetchPdfImage] SVG non supportato nel PDF, skip: ${url}`);
            return null;
        }

        if (!RENDERABLE_MIME.has(mime)) {
            // WebP & altri formati: transcodifica PNG via canvas (solo browser).
            const transcoded = await transcodeToPngDataUrl(blob);
            if (!transcoded) {
                console.warn(`[prefetchPdfImage] formato ${mime || "sconosciuto"} non transcodificabile, skip: ${url}`);
            }
            return transcoded;
        }

        const bytes = new Uint8Array(await blob.arrayBuffer());
        return `data:${mime};base64,${bytesToBase64(bytes)}`;
    } catch {
        return null;
    }
}
