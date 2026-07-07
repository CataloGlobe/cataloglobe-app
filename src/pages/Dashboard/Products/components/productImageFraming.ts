import type { MediaFraming } from "@components/ui/ImageReframeEditor/types";

/**
 * Products non hanno ancora colonne di framing (focal/zoom/fill) — a differenza
 * di `featured_contents` (2.7). Centered cover fisso finché non arriva un editor
 * di reframe dedicato ai prodotti (gap noto, fuori scope).
 */
export const PRODUCT_IMAGE_DEFAULT_FRAMING: MediaFraming = {
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    fillMode: "blur",
    fillColor: null
};
