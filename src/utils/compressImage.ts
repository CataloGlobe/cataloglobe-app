const COMPRESS_TIMEOUT_MS = 15_000;

export type CompressOptions = { maxWidth: number; quality: number };

export const COMPRESS_PROFILES = {
    cover:    { maxWidth: 1920, quality: 0.82 },
    product:  { maxWidth: 800,  quality: 0.82 },
    logo:     { maxWidth: 400,  quality: 0.90 },
    featured: { maxWidth: 1200, quality: 0.85 },
} satisfies Record<string, CompressOptions>;

export async function compressImage(
    file: File,
    maxWidthOrOptions: number | CompressOptions = 900,
    quality = 0.8
): Promise<File> {
    const opts: CompressOptions =
        typeof maxWidthOrOptions === "number"
            ? { maxWidth: maxWidthOrOptions, quality }
            : maxWidthOrOptions;
    return Promise.race([
        doCompress(file, opts.maxWidth, opts.quality),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout compressione immagine")), COMPRESS_TIMEOUT_MS)
        )
    ]);
}

function doCompress(file: File, maxWidth: number, quality: number): Promise<File> {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            const canvas = document.createElement("canvas");

            const scale = img.width > maxWidth ? maxWidth / img.width : 1;
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Impossibile creare canvas 2D"));
                return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Mantieni il formato originale
            const originalType = file.type; // "image/png", "image/jpeg", "image/webp"

            // PNG → mantieni PNG (per la trasparenza)
            // WEBP → mantieni WEBP
            // JPEG → comprimi JPEG
            const outputType =
                originalType === "image/png"
                    ? "image/png"
                    : originalType === "image/webp"
                    ? "image/webp"
                    : "image/jpeg";

            canvas.toBlob(
                blob => {
                    if (!blob) {
                        reject(new Error("Compressione immagine fallita"));
                        return;
                    }
                    resolve(
                        new File([blob], file.name, {
                            type: outputType
                        })
                    );
                },
                outputType,
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Impossibile caricare l'immagine"));
        };

        img.src = objectUrl;
    });
}
