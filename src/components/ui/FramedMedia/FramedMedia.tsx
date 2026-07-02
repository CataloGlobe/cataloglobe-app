import { type CSSProperties, useEffect, useRef, useState } from "react";
import { framePercent, offset, hasBands } from "@components/ui/ImageReframeEditor/reframeGeometry";
import type { MediaFraming } from "@components/ui/ImageReframeEditor/types";
import styles from "./FramedMedia.module.scss";

const FRAME_RATIO = 16 / 9;
// Neutral band fill when fillColor is null (e.g. dominant not extracted).
const FILL_FALLBACK = "#e5e7eb";

export interface FramedMediaProps {
    /** Image URL (remote or object URL). */
    source: string;
    /** Saved framing (camelCase). */
    framing: MediaFraming;
    /** Natural image ratio (w/h); null → legacy cover path. */
    aspectRatio: number | null;
    alt: string;
    ariaHidden?: boolean;
    /** Above-the-fold: loading="eager". Default lazy. */
    eager?: boolean;
}

/**
 * Renders an image reproducing the saved framing with pure CSS (no box
 * measurement, SSR-safe). Legacy (aspectRatio null OR zoom == 1) → cover +
 * object-position; zoom != 1 → parametric sizing in % of the frame with an
 * optional band-fill layer behind.
 *
 * Renders a fragment (fill layers + image); the CALLER must provide a
 * `position: relative; overflow: hidden` container (e.g. a 16:9 box).
 */
export function FramedMedia({ source, framing, aspectRatio, alt, ariaHidden, eager = false }: FramedMediaProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const [imgLoaded, setImgLoaded] = useState(false);

    useEffect(() => {
        // Cached image: onLoad may fire before React attaches → check complete.
        const img = imgRef.current;
        if (img?.complete && img.naturalWidth > 0) setImgLoaded(true);
        else setImgLoaded(false);
    }, [source]);

    const loading: "eager" | "lazy" = eager ? "eager" : "lazy";
    const onLoad = () => setImgLoaded(true);
    const loadedCls = imgLoaded ? styles.imgLoaded : "";

    const { focalX: fx, focalY: fy, zoom, fillMode, fillColor } = framing;

    // Legacy / cover path.
    if (aspectRatio == null || Math.abs(zoom - 1) < 1e-4) {
        return (
            <img
                ref={imgRef}
                src={source}
                alt={alt}
                aria-hidden={ariaHidden}
                loading={loading}
                onLoad={onLoad}
                className={`${styles.coverImg} ${loadedCls}`}
                style={{ objectPosition: `${fx * 100}% ${fy * 100}%` }}
            />
        );
    }

    // Parametric path.
    const { widthPct, heightPct } = framePercent(FRAME_RATIO, aspectRatio, zoom);
    const { ox, oy } = offset(100, 100, widthPct, heightPct, fx, fy);
    const bands = hasBands(100, 100, widthPct, heightPct);
    const resolvedFill = fillColor ?? FILL_FALLBACK;
    const showBlur = bands && fillMode === "blur";
    const showColor = bands && (fillMode === "dominant" || fillMode === "color");

    const imgStyle: CSSProperties = {
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        left: `${ox}%`,
        top: `${oy}%`
    };

    return (
        <>
            {showBlur && (
                <img src={source} alt="" aria-hidden="true" className={styles.framedFillBlur} draggable={false} />
            )}
            {showColor && (
                <div className={styles.framedFill} style={{ backgroundColor: resolvedFill }} aria-hidden="true" />
            )}
            <img
                ref={imgRef}
                src={source}
                alt={alt}
                aria-hidden={ariaHidden}
                loading={loading}
                onLoad={onLoad}
                className={`${styles.framedImg} ${loadedCls}`}
                style={imgStyle}
            />
        </>
    );
}
