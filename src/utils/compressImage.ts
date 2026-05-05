const COMPRESS_TIMEOUT_MS = 15_000;
const MAX_INPUT_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type CompressionErrorCode = "TOO_LARGE" | "INVALID_MIME" | "HEIC" | "LOAD_FAILED" | "TIMEOUT";

export class CompressionError extends Error {
    public code: CompressionErrorCode;
    constructor(message: string, code: CompressionErrorCode) {
        super(message);
        this.name = "CompressionError";
        this.code = code;
    }
}

export type CompressFormat = "jpeg" | "png" | "webp" | "auto";

export type CompressOptions = {
    maxWidth: number;
    quality: number;
    maxHeight?: number;
    format?: CompressFormat;
};

export const COMPRESS_PROFILES = {
    cover:    { maxWidth: 1280, maxHeight: 720,  quality: 0.82, format: "webp" },
    product:  { maxWidth: 800,  maxHeight: 800,  quality: 0.82, format: "webp" },
    logo:     { maxWidth: 512, maxHeight: 256,    quality: 0.90, format: "webp" },
    featured: { maxWidth: 1200, maxHeight: 800,  quality: 0.85, format: "webp" },
} satisfies Record<string, CompressOptions>;

export async function compressImage(
    file: File,
    maxWidthOrOptions: number | CompressOptions = 900,
    quality = 0.8
): Promise<File> {
    if (file.size > MAX_INPUT_SIZE) {
        throw new CompressionError("File troppo grande. Massimo 10MB.", "TOO_LARGE");
    }
    if (file.type === "image/heic" || file.type === "image/heif") {
        throw new CompressionError(
            "Formato HEIC non supportato. Converti in JPEG/PNG.",
            "HEIC"
        );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        throw new CompressionError(
            "Formato file non supportato. Usa JPEG, PNG o WEBP.",
            "INVALID_MIME"
        );
    }

    const opts: CompressOptions =
        typeof maxWidthOrOptions === "number"
            ? { maxWidth: maxWidthOrOptions, quality }
            : maxWidthOrOptions;
    return Promise.race([
        doCompress(file, opts),
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new CompressionError("Timeout compressione immagine", "TIMEOUT")),
                COMPRESS_TIMEOUT_MS
            )
        )
    ]);
}

function resolveOutputType(originalType: string, format: CompressFormat): string {
    if (format === "jpeg") return "image/jpeg";
    if (format === "png") return "image/png";
    if (format === "webp") return "image/webp";
    // "auto": preserva PNG/WEBP, default JPEG
    if (originalType === "image/png") return "image/png";
    if (originalType === "image/webp") return "image/webp";
    return "image/jpeg";
}

function extensionForType(outputType: string): string {
    if (outputType === "image/jpeg") return "jpg";
    if (outputType === "image/webp") return "webp";
    return "png";
}

function renameWithExtension(name: string, ext: string): string {
    const base = name.replace(/\.[^.]+$/, "");
    return `${base}.${ext}`;
}

function doCompress(file: File, opts: CompressOptions): Promise<File> {
    const { maxWidth, maxHeight, quality, format = "auto" } = opts;

    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            const canvas = document.createElement("canvas");

            const scaleW = img.width > maxWidth ? maxWidth / img.width : 1;
            const scaleH = maxHeight && img.height > maxHeight ? maxHeight / img.height : 1;
            const scale = Math.min(scaleW, scaleH);

            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Impossibile creare canvas 2D"));
                return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const outputType = resolveOutputType(file.type, format);

            canvas.toBlob(
                blob => {
                    if (!blob) {
                        reject(new Error("Compressione immagine fallita"));
                        return;
                    }
                    // Skip-if-smaller: se la compressione produce un blob >= dell'originale
                    // (tipico su PNG gia' piccoli convertiti a JPEG), restituisci il file
                    // originale invariato. Evita peggioramenti di size e cambi di estensione
                    // inutili.
                    if (blob.size >= file.size) {
                        console.debug(
                            "compressImage: skip (output bigger), keeping original",
                            { original: file.size, compressed: blob.size }
                        );
                        resolve(file);
                        return;
                    }
                    // Sincronizza l'estensione del filename con il MIME del Blob:
                    // necessario quando format forzato cambia il tipo (es. PNG->JPEG),
                    // perche' i service di upload derivano il path da file.name.
                    const ext = extensionForType(outputType);
                    const newName = renameWithExtension(file.name, ext);
                    resolve(
                        new File([blob], newName, {
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
            reject(new CompressionError("Impossibile caricare l'immagine", "LOAD_FAILED"));
        };

        img.src = objectUrl;
    });
}
