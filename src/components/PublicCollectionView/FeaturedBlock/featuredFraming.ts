import type { V2FeaturedContent } from "@/types/resolvedCollections";
import type { MediaFraming } from "@components/ui/ImageReframeEditor/types";

/** Adatta lo snake_case di V2FeaturedContent alla forma canonica MediaFraming.
 *  Unica fonte per card (FeaturedCard) e dettaglio (FeaturedContentDetail). */
export function toFeaturedFraming(b: V2FeaturedContent): MediaFraming {
    return {
        focalX: b.media_focal_x ?? 0.5,
        focalY: b.media_focal_y ?? 0.5,
        zoom: b.media_zoom ?? 1,
        fillMode: b.media_fill_mode ?? "blur",
        fillColor: b.media_fill_color ?? null
    };
}
