/**
 * Extract a representative color from an image via a downsampled canvas.
 * Returns a `#rrggbb` hex, or null if the image can't be read (CORS-tainted
 * canvas on a remote URL without CORS headers, or a load failure). Never throws
 * — callers degrade gracefully on null.
 */
export async function extractDominantColor(source: string): Promise<string | null> {
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = () => {
            try {
                const size = 24;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (!ctx) {
                    resolve(null);
                    return;
                }
                ctx.drawImage(img, 0, 0, size, size);
                // getImageData throws a SecurityError on a tainted canvas.
                const { data } = ctx.getImageData(0, 0, size, size);

                let r = 0;
                let g = 0;
                let b = 0;
                let count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = data[i + 3];
                    if (alpha < 8) continue; // skip near-transparent pixels
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count++;
                }
                if (count === 0) {
                    resolve(null);
                    return;
                }
                resolve(rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count)));
            } catch {
                resolve(null); // tainted canvas or read failure
            }
        };

        img.onerror = () => resolve(null);
        img.src = source;
    });
}

function rgbToHex(r: number, g: number, b: number): string {
    const h = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}
