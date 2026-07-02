export type MediaFillMode = "blur" | "dominant" | "color" | "none";

export interface MediaFraming {
    focalX: number; // 0..1
    focalY: number; // 0..1
    zoom: number; // constrained to [containZoom, maxZoom] at runtime
    fillMode: MediaFillMode;
    fillColor: string | null; // hex #rrggbb; set for 'color' and 'dominant'
}

export interface ImageReframeEditorProps {
    source: string; // object URL (create) or remote URL (edit)
    value: MediaFraming;
    onChange: (next: MediaFraming) => void;
    aspectRatio?: number; // default 16/9
    className?: string;
}
