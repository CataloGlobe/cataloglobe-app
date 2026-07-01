/**
 * Pure geometry helpers for the 16:9 reframe editor. No React, no DOM.
 *
 * Conventions:
 *   fw, fh   = frame (viewport) width/height in px
 *   r        = image ratio (naturalWidth / naturalHeight)
 *   frameRatio = fw / fh
 *   zoom = 1 is the COVER baseline (image fills the box). zoom > 1 crops
 *   tighter (bounded by maxZoom); zoom < 1 down to containZoom shows the whole
 *   image with empty bands.
 */

export const EPS = 0.5;

interface Point {
    x: number;
    y: number;
}

interface Dims {
    dw: number;
    dh: number;
}

interface Offset {
    ox: number;
    oy: number;
}

/** Scale that makes the image cover the frame (fill both axes). */
export function cover(fw: number, fh: number, r: number): number {
    return Math.max(fw / r, fh);
}

/** Rendered image size at a given zoom (zoom = 1 => cover). */
export function dims(fw: number, fh: number, r: number, zoom: number): Dims {
    const c = cover(fw, fh, r);
    return { dw: r * c * zoom, dh: c * zoom };
}

/**
 * Zoom at which the whole image just fits inside the frame (contain).
 * Always <= 1 because contain <= cover.
 */
export function containZoom(fw: number, fh: number, r: number): number {
    const c = cover(fw, fh, r);
    return Math.min(fw / (r * c), fh / c);
}

/**
 * Top-left offset of the rendered image inside the frame.
 * Underflow axis (image smaller than frame) is centered; overflow axis is
 * panned by the focal point (0..1).
 */
export function offset(
    fw: number,
    fh: number,
    dw: number,
    dh: number,
    fx: number,
    fy: number
): Offset {
    const ox = dw <= fw ? (fw - dw) / 2 : (fw - dw) * fx;
    const oy = dh <= fh ? (fh - dh) / 2 : (fh - dh) * fy;
    return { ox, oy };
}

/** True when the image leaves empty bands on either axis. */
export function hasBands(fw: number, fh: number, dw: number, dh: number): boolean {
    return dw < fw - EPS || dh < fh - EPS;
}

export function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

/**
 * Update the focal point from a drag delta. Pans only the axis in overflow;
 * the other axis is centered and cannot be panned. Result clamped to [0,1].
 */
export function applyDrag(
    focal: Point,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    fw: number,
    fh: number
): Point {
    const rx = dw - fw;
    const ry = dh - fh;
    const x = rx > 0 ? clamp01(focal.x - dx / rx) : focal.x;
    const y = ry > 0 ? clamp01(focal.y - dy / ry) : focal.y;
    return { x, y };
}

/**
 * Upper zoom bound: how far you can crop in before the source resolution runs
 * out relative to a reference render width. Never below 1 (cover must always be
 * reachable), never above hardCap.
 */
export function maxZoom(
    naturalW: number,
    naturalH: number,
    frameRatio: number = 16 / 9,
    refW = 960,
    hardCap = 3
): number {
    const r = naturalW / naturalH;
    const f1w = Math.min(1, frameRatio / r); // width fraction of source shown at cover
    const f1h = Math.min(1, r / frameRatio); // height fraction of source shown at cover
    const refH = refW / frameRatio;
    const capW = (naturalW * f1w) / refW;
    const capH = (naturalH * f1h) / refH;
    return Math.max(1, Math.min(Math.min(capW, capH), hardCap));
}
