import { useEffect, useState } from "react";

/**
 * La grana («noise») è un SVG con `feTurbulence`: Safari su iPhone la ricalcola
 * a ogni ridisegno della pagina (barre che si chiudono scorrendo, pagina bloccata
 * all'apertura di un foglio), 25-60 ms per frame. Chrome la tiene in cache. Qui la
 * si disegna una volta in un canvas e si usa il PNG: stesso aspetto, costo zero.
 * Solo i motivi con un filtro SVG: gli altri sono già leggeri.
 */
const done = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

/** Scala massima del tassello: oltre, Safari non ne disegna di più fitti. */
const MAX_SCALE = 3;

function needsRaster(value: string | undefined): value is string {
    return !!value && value.startsWith('url("data:image/svg+xml') && value.includes("feTurbulence");
}

async function rasterize(value: string, tilePx: number): Promise<string | null> {
    const src = value.slice('url("'.length, -'")'.length);
    const scale = Math.min(MAX_SCALE, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
    const side = tilePx * scale;
    const image = new Image(side, side);
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, side, side);
    // Un blob e non un data URL: la variabile resta corta (a 3x il PNG pesa
    // ~200 KB). Lancia se il canvas risulta «sporco» (SVG non ammesso): resta l'SVG.
    const blob = await new Promise<Blob | null>((resolve, reject) => {
        try {
            canvas.toBlob(resolve, "image/png");
        } catch (error) {
            reject(error);
        }
    });
    return blob ? `url("${URL.createObjectURL(blob)}")` : null;
}

function start(value: string, tilePx: number): Promise<string | null> {
    let promise = pending.get(value);
    if (!promise) {
        promise = rasterize(value, tilePx)
            .catch(() => null)
            .then(result => {
                done.set(value, result);
                pending.delete(value);
                return result;
            });
        pending.set(value, promise);
    }
    return promise;
}

/**
 * Il valore da usare per `--pub-bg-pattern`: il PNG appena pronto, nel frattempo
 * (e se il disegno non riesce) quello di partenza.
 */
export function useRasterizedPattern(value: string | undefined, size: string | undefined): string | undefined {
    const [, setVersion] = useState(0);
    const tilePx = Number.parseFloat(size ?? "") || 0;
    const wanted = needsRaster(value) && tilePx > 0 && typeof document !== "undefined";

    useEffect(() => {
        if (!wanted || done.has(value)) return;
        let active = true;
        void start(value, tilePx).then(() => {
            if (active) setVersion(version => version + 1);
        });
        return () => {
            active = false;
        };
    }, [wanted, value, tilePx]);

    if (!wanted) return value;
    return done.get(value) ?? value;
}
