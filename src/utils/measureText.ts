let canvas: HTMLCanvasElement | null = null;

/**
 * Larghezza in px di un testo col font della pagina (canvas, niente reflow).
 * Serve a dare a una colonna di `DataTable` la larghezza del suo contenuto:
 * ogni riga è una griglia a sé, quindi `max-content` non allineerebbe le
 * colonne fra le righe.
 */
export function measureTextWidth(
    text: string,
    { size, weight = 400, letterSpacing = 0 }: { size: number; weight?: number; letterSpacing?: number }
): number {
    if (typeof document === "undefined") return text.length * size * 0.6;
    canvas ??= document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return text.length * size * 0.6;
    ctx.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`;
    return ctx.measureText(text).width + letterSpacing * text.length;
}
