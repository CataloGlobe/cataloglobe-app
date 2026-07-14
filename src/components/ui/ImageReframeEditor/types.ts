export type MediaFillMode = "blur" | "dominant" | "color" | "none";

/** Supported crop frame ratios (product-level enum). */
export type MediaFrame = "16:9" | "3:2" | "4:5";

/** Convert a frame enum to its numeric width/height ratio. */
export function frameToRatio(frame: MediaFrame): number {
    switch (frame) {
        case "16:9":
            return 16 / 9;
        case "3:2":
            return 3 / 2;
        case "4:5":
            return 4 / 5;
    }
}

export interface MediaFraming {
    focalX: number; // 0..1
    focalY: number; // 0..1
    zoom: number; // constrained to [containZoom, maxZoom] at runtime
    fillMode: MediaFillMode;
    fillColor: string | null; // hex #rrggbb; set for 'color' and 'dominant'
}

/**
 * Default framing (centered cover, blur fill). Mirrors the DB column defaults on
 * featured_contents (media_focal_x/y=0.5, media_zoom=1, media_fill_mode='blur').
 * Canonical home is here alongside MediaFraming; featuredContents.ts re-exports.
 */
export const FRAMING_DEFAULTS: MediaFraming = {
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    fillMode: "blur",
    fillColor: null
};

export interface ImageReframeEditorProps {
    source: string; // object URL (create) or remote URL (edit)
    value: MediaFraming;
    onChange: (next: MediaFraming) => void;
    aspectRatio?: number; // default 16/9
    className?: string;
}
