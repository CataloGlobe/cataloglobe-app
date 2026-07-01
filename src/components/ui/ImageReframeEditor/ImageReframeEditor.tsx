import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Scan, Crosshair } from "lucide-react";
import { Button } from "@components/ui/Button/Button";
import { SegmentedControl } from "@components/ui/SegmentedControl/SegmentedControl";
import {
    applyDrag,
    containZoom,
    dims,
    hasBands,
    maxZoom,
    offset
} from "@components/ui/ImageReframeEditor/reframeGeometry";
import type {
    ImageReframeEditorProps,
    MediaFillMode
} from "@components/ui/ImageReframeEditor/types";
import { extractDominantColor } from "@components/ui/ImageReframeEditor/extractDominantColor";
import styles from "./ImageReframeEditor.module.scss";

const DEFAULT_RATIO = 16 / 9;
const ZOOM_STEP = 0.001;
const DOMINANT_FALLBACK = "#9ca3af"; // neutral grey until a real hex is available

const FILL_OPTIONS: { value: MediaFillMode; label: string }[] = [
    { value: "blur", label: "Sfocato" },
    { value: "dominant", label: "Colore foto" },
    { value: "color", label: "Colore" },
    { value: "none", label: "Nessuno" }
];

export function ImageReframeEditor({
    source,
    value,
    onChange,
    aspectRatio = DEFAULT_RATIO,
    className
}: ImageReframeEditorProps) {
    const frameRef = useRef<HTMLDivElement>(null);
    const [frame, setFrame] = useState({ w: 0, h: 0 });
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
    const [dominant, setDominant] = useState<string | null>(null);

    const dragRef = useRef<{ x: number; y: number } | null>(null);

    // Measure the frame box (drives all px geometry).
    useEffect(() => {
        const el = frameRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const rect = entries[0].contentRect;
            setFrame({ w: rect.width, h: rect.height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Kick off dominant-color extraction whenever the source changes.
    useEffect(() => {
        let alive = true;
        setDominant(null);
        void extractDominantColor(source).then(hex => {
            if (alive) setDominant(hex);
        });
        return () => {
            alive = false;
        };
    }, [source]);

    const r = natural ? natural.w / natural.h : aspectRatio;
    const czoom = natural && frame.w > 0 ? containZoom(frame.w, frame.h, r) : 1;
    const mzoom = natural ? maxZoom(natural.w, natural.h, aspectRatio) : 3;

    const { dw, dh } = frame.w > 0 ? dims(frame.w, frame.h, r, value.zoom) : { dw: 0, dh: 0 };
    const { ox, oy } = offset(frame.w, frame.h, dw, dh, value.focalX, value.focalY);
    const bands = frame.w > 0 && hasBands(frame.w, frame.h, dw, dh);

    // On load / resize: clamp the incoming zoom into the valid [contain, max] range.
    useEffect(() => {
        if (!natural || frame.w === 0) return;
        const clamped = Math.min(Math.max(value.zoom, czoom), mzoom);
        if (Math.abs(clamped - value.zoom) > 1e-4) {
            onChange({ ...value, zoom: clamped });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [natural, frame.w, frame.h, czoom, mzoom]);

    const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    }, []);

    // --- Drag to reframe -----------------------------------------------------
    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            const prev = dragRef.current;
            if (!prev) return;
            const dx = e.clientX - prev.x;
            const dy = e.clientY - prev.y;
            dragRef.current = { x: e.clientX, y: e.clientY };
            const next = applyDrag(
                { x: value.focalX, y: value.focalY },
                dx,
                dy,
                dw,
                dh,
                frame.w,
                frame.h
            );
            if (next.x !== value.focalX || next.y !== value.focalY) {
                onChange({ ...value, focalX: next.x, focalY: next.y });
            }
        },
        [value, onChange, dw, dh, frame.w, frame.h]
    );

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        dragRef.current = null;
    }, []);

    // --- Fill controls -------------------------------------------------------
    const onFillModeChange = useCallback(
        (mode: MediaFillMode) => {
            if (mode === "dominant") {
                onChange({ ...value, fillMode: mode, fillColor: dominant ?? DOMINANT_FALLBACK });
            } else if (mode === "color") {
                onChange({ ...value, fillMode: mode, fillColor: value.fillColor ?? DOMINANT_FALLBACK });
            } else {
                onChange({ ...value, fillMode: mode });
            }
        },
        [value, onChange, dominant]
    );

    const onColorPick = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange({ ...value, fillMode: "color", fillColor: e.target.value });
        },
        [value, onChange]
    );

    // Resolve the fill background applied behind the image on the bands.
    const fillColor =
        value.fillMode === "dominant"
            ? value.fillColor ?? dominant ?? DOMINANT_FALLBACK
            : value.fillMode === "color"
              ? value.fillColor ?? DOMINANT_FALLBACK
              : null;

    return (
        <div className={`${styles.editor} ${className ?? ""}`}>
            <div
                ref={frameRef}
                className={styles.frame}
                style={{ aspectRatio: String(aspectRatio) }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                {/* Fill layer behind the image, only when bands are visible. */}
                {bands && value.fillMode === "blur" && (
                    <img src={source} alt="" aria-hidden className={styles.fillBlur} draggable={false} />
                )}
                {bands && fillColor && (
                    <div className={styles.fillColor} style={{ backgroundColor: fillColor }} />
                )}

                <img
                    src={source}
                    alt=""
                    aria-hidden
                    className={styles.image}
                    draggable={false}
                    onLoad={handleImgLoad}
                    style={{
                        width: `${dw}px`,
                        height: `${dh}px`,
                        transform: `translate(${ox}px, ${oy}px)`
                    }}
                />

                <div className={styles.grid} aria-hidden />
            </div>

            {/* Zoom + reset actions */}
            <div className={styles.controls}>
                <input
                    type="range"
                    className={styles.zoom}
                    min={czoom}
                    max={mzoom}
                    step={ZOOM_STEP}
                    value={value.zoom}
                    disabled={!natural}
                    onChange={e => onChange({ ...value, zoom: Number(e.target.value) })}
                    aria-label="Zoom"
                />
                <div className={styles.actions}>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onChange({ ...value, zoom: 1 })}
                        disabled={!natural}
                    >
                        <Maximize2 size={15} /> Riempi 16:9
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onChange({ ...value, zoom: czoom })}
                        disabled={!natural}
                    >
                        <Scan size={15} /> Mostra intera
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onChange({ ...value, focalX: 0.5, focalY: 0.5 })}
                        disabled={!natural}
                    >
                        <Crosshair size={15} /> Centra
                    </Button>
                </div>
            </div>

            {/* Contextual band-fill panel: active only when the image leaves bands. */}
            <div className={`${styles.fillPanel} ${bands ? "" : styles.fillPanelIdle}`}>
                <span className={styles.fillLabel}>
                    {bands ? "Riempimento fasce" : "Nessuna fascia — l'immagine copre il riquadro"}
                </span>
                <div className={styles.fillRow}>
                    <SegmentedControl<MediaFillMode>
                        value={value.fillMode}
                        onChange={onFillModeChange}
                        options={FILL_OPTIONS}
                    />
                    {value.fillMode === "color" && (
                        <input
                            type="color"
                            className={styles.colorInput}
                            value={value.fillColor ?? DOMINANT_FALLBACK}
                            onChange={onColorPick}
                            aria-label="Colore fasce"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
