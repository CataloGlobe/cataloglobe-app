import { useCallback, useEffect, useRef, useState } from "react";
import {
    Move,
    Maximize2,
    Minimize2,
    Crosshair,
    Layers,
    Palette,
    Ban
} from "lucide-react";
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

// Preset band-fill swatches: primario tenant, nero, bianco, accento.
const PRESET_COLORS = ["#928E72", "#000000", "#ffffff", "#c2410c"];

const FILL_OPTIONS: { value: MediaFillMode; label: string; icon: React.ReactNode }[] = [
    { value: "blur", label: "Sfocato", icon: <Layers size={14} /> },
    { value: "dominant", label: "Foto", icon: <Palette size={14} /> },
    { value: "color", label: "Colore", icon: <span className={styles.dot} aria-hidden /> },
    { value: "none", label: "No", icon: <Ban size={14} /> }
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

    const selectColor = useCallback(
        (hex: string) => {
            onChange({ ...value, fillMode: "color", fillColor: hex });
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

    // Cover marker position on the zoom track (runtime presentation only).
    const zoomRange = mzoom - czoom;
    const coverPct =
        zoomRange > 1e-6 ? Math.min(100, Math.max(0, ((1 - czoom) / zoomRange) * 100)) : 100;

    const zoomPct = Math.round(value.zoom * 100);
    const dominantSwatch = dominant ?? DOMINANT_FALLBACK;

    return (
        <div className={`${styles.editor} ${className ?? ""}`}>
            {/* 1. Anteprima 16:9 + hint */}
            <div
                ref={frameRef}
                className={styles.frame}
                style={{ aspectRatio: String(aspectRatio) }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
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

            <div className={styles.hint}>
                <Move size={13} />
                <span>Trascina per spostare l'inquadratura</span>
            </div>

            {/* 2. Zoom */}
            <div className={styles.zoomBlock}>
                <div className={styles.zoomHeader}>
                    <span className={styles.zoomLabel}>Zoom</span>
                    <span className={styles.zoomValue}>{zoomPct}%</span>
                </div>

                <div className={styles.trackWrap}>
                    {natural && (
                        <>
                            <span className={styles.coverTag} style={{ left: `${coverPct}%` }}>
                                riempie
                            </span>
                            <span className={styles.coverTick} style={{ left: `${coverPct}%` }} aria-hidden />
                        </>
                    )}
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
                </div>

                <div className={styles.zoomExtremes}>
                    <span>Mostra intera</span>
                    <span>Ingrandisci</span>
                </div>
            </div>

            {/* 3. Azioni */}
            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => onChange({ ...value, zoom: 1 })}
                    disabled={!natural}
                >
                    <Maximize2 size={15} />
                    Riempi
                </button>
                <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => onChange({ ...value, zoom: czoom })}
                    disabled={!natural}
                >
                    <Minimize2 size={15} />
                    Intera
                </button>
                <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => onChange({ ...value, focalX: 0.5, focalY: 0.5 })}
                    disabled={!natural}
                >
                    <Crosshair size={15} />
                    Centra
                </button>
            </div>

            {/* 4. Pannello fasce contestuale */}
            <div className={`${styles.fillPanel} ${bands ? styles.fillPanelActive : styles.fillPanelIdle}`}>
                <span className={styles.fillLabel}>
                    {bands
                        ? "Fasce vuote — scegli il riempimento"
                        : "L'immagine copre tutto il riquadro"}
                </span>

                <SegmentedControl<MediaFillMode>
                    value={value.fillMode}
                    onChange={onFillModeChange}
                    options={FILL_OPTIONS}
                />

                {value.fillMode === "color" && (
                    <div className={styles.swatchRow}>
                        <button
                            type="button"
                            className={`${styles.swatch} ${styles.swatchExtracted}`}
                            style={{ backgroundColor: dominantSwatch }}
                            onClick={() => selectColor(dominantSwatch)}
                            aria-label="Colore estratto dalla foto"
                        >
                            <span className={styles.swatchTag}>estratto</span>
                        </button>
                        {PRESET_COLORS.map(hex => (
                            <button
                                key={hex}
                                type="button"
                                className={styles.swatch}
                                style={{ backgroundColor: hex }}
                                onClick={() => selectColor(hex)}
                                aria-label={`Colore ${hex}`}
                            />
                        ))}
                        <label className={styles.swatchCustom} aria-label="Colore personalizzato">
                            +
                            <input
                                type="color"
                                className={styles.swatchCustomInput}
                                value={value.fillColor ?? DOMINANT_FALLBACK}
                                onChange={onColorPick}
                            />
                        </label>
                    </div>
                )}
            </div>
        </div>
    );
}
