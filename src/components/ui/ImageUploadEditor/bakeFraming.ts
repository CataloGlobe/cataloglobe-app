import {
    cover,
    dims,
    hasBands,
    offset
} from "@components/ui/ImageReframeEditor/reframeGeometry";
import type { MediaFraming } from "@components/ui/ImageReframeEditor/types";

/**
 * Opzioni di export "baked": il framing (pan/zoom/centra + fill) viene applicato
 * ai PIXEL su canvas e riversato in un unico file già ritagliato — non salvato
 * come metadata. Usato dai punti d'uso che preferiscono un'immagine pre-croppata
 * (es. Logo) invece del percorso "framing metadata + FramedMedia" (Featured/Story).
 */
export interface BakeOptions {
    /** Ratio del riquadro di output (w/h). Es. 1 per logo quadrato. */
    aspectRatio: number;
    /** Lato lungo dell'output in px (lato corto derivato dal ratio). */
    size: number;
    format?: "image/webp" | "image/png" | "image/jpeg";
    quality?: number;
    fileName?: string;
}

const BLUR_RADIUS_PX = 24;

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Blob URL (nuovo file) → ininfluente; URL remoto Supabase (public bucket
        // con CORS) → necessario per non "tainttare" il canvas e poter chiamare
        // toBlob. Se il fetch cross-origin fallisce, toBlob lancia e il chiamante
        // mostra errore.
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Impossibile caricare l'immagine per il ritaglio"));
        img.src = src;
    });
}

/**
 * Applica il framing a un'immagine sorgente e restituisce un File già ritagliato
 * al ratio target. La geometria riusa gli stessi helper puri dell'editor
 * (`dims`/`offset`/`cover`/`hasBands`) → il crop "baked" coincide con l'anteprima.
 */
export async function bakeFramedImage(
    source: string,
    framing: MediaFraming,
    opts: BakeOptions
): Promise<File> {
    const {
        aspectRatio,
        size,
        format = "image/webp",
        quality = 0.9,
        fileName = "image.webp"
    } = opts;

    const img = await loadImage(source);
    const r = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : aspectRatio;

    // Canvas di output al ratio target, lato lungo = size.
    const fw = aspectRatio >= 1 ? size : Math.round(size * aspectRatio);
    const fh = aspectRatio >= 1 ? Math.round(size / aspectRatio) : size;

    const canvas = document.createElement("canvas");
    canvas.width = fw;
    canvas.height = fh;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Impossibile creare canvas 2D");

    const { dw, dh } = dims(fw, fh, r, framing.zoom);
    const { ox, oy } = offset(fw, fh, dw, dh, framing.focalX, framing.focalY);
    const bands = hasBands(fw, fh, dw, dh);

    // Riempimento fasce (solo se l'immagine non copre l'intero riquadro).
    if (bands) {
        if (framing.fillMode === "blur") {
            // Copia "cover" sfocata dietro (baseline zoom 1 = riempie il riquadro).
            const c = cover(fw, fh, r);
            const cw = r * c;
            const chh = c;
            ctx.filter = `blur(${BLUR_RADIUS_PX}px)`;
            ctx.drawImage(img, (fw - cw) / 2, (fh - chh) / 2, cw, chh);
            ctx.filter = "none";
        } else if (
            (framing.fillMode === "color" || framing.fillMode === "dominant") &&
            framing.fillColor
        ) {
            ctx.fillStyle = framing.fillColor;
            ctx.fillRect(0, 0, fw, fh);
        }
        // "none" → fasce trasparenti (preservate da WEBP/PNG).
    }

    ctx.drawImage(img, ox, oy, dw, dh);

    const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
            b => (b ? resolve(b) : reject(new Error("Ritaglio immagine fallito"))),
            format,
            quality
        )
    );

    return new File([blob], fileName, { type: format });
}
