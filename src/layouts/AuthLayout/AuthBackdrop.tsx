import { useLayoutEffect, useRef } from "react";
import { backdrop as state, isModule, setBackdropKick, shouldWake, tick, wake, waveStrength } from "./backdropWaves";
import styles from "./AuthLayout.module.scss";

/** Distanza tra i punti, in px. */
const STEP = 24;

/** Un fotogramma ogni ~33 ms: a 30 fps l'onda resta fluida e la CPU lavora la metà. */
const FRAME_MS = 33;

type Rgb = [number, number, number];

function parseRgb(value: string, fallback: Rgb): Rgb {
    const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : fallback;
}

/**
 * La tela di punti dietro le pagine di accesso. Colori dai token (color e
 * border-color del canvas nel CSS), così il tema scuro cambia da solo.
 */
export function AuthBackdrop() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Layout effect: la tela si disegna prima che il browser catturi la pagina
    // nuova del passaggio animato, così lo sfondo non lampeggia vuoto.
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        let dot: Rgb = [100, 116, 139];
        let accent: Rgb = [99, 102, 241];
        let strength = 1;
        let W = 0;
        let H = 0;
        let raf = 0;
        let lastDraw = 0;

        const readColors = () => {
            const cs = getComputedStyle(canvas);
            dot = parseRgb(cs.color, dot);
            accent = parseRgb(cs.borderTopColor, accent);
            strength = Number(cs.getPropertyValue("--auth-dot-strength")) || 1;
        };

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = canvas.clientWidth;
            H = canvas.clientHeight;
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const draw = (now: number) => {
            ctx.clearRect(0, 0, W, H);
            const reach = Math.hypot(W, H) * 0.62;
            const waves = reduceQuery.matches ? [] : state.waves;
            const dotRgb = dot.join(",");
            const accentRgb = accent.join(",");
            for (let j = 0, y = STEP / 2; y < H; y += STEP, j++) {
                for (let i = 0, x = STEP / 2; x < W; x += STEP, i++) {
                    let b = 0;
                    let seed = 0;
                    let ox = 0;
                    let oy = 0;
                    for (const w of waves) {
                        const dx = x - w.fx * W;
                        const dy = y - w.fy * H;
                        const d = Math.hypot(dx, dy) || 1;
                        const g = waveStrength(d, now - w.start, reach);
                        if (g > b) {
                            b = g;
                            seed = w.seed;
                        }
                        ox += (dx / d) * g * 5;
                        oy += (dy / d) * g * 5;
                    }
                    const px = x + ox;
                    const py = y + oy;
                    if (b > 0.18 && isModule(i, j, seed)) {
                        // Il punto si allarga in un quadratino dagli angoli tondi.
                        const m = Math.min(1, (b - 0.18) / 0.5);
                        const e = m * m * (3 - 2 * m);
                        const side = 2.2 + e * (STEP * 0.56 - 2.2);
                        const radius = Math.max(1.5, 1.1 + (1 - e) * (side / 2 - 1.1));
                        ctx.fillStyle = `rgba(${accentRgb},${(0.1 + e * 0.24).toFixed(3)})`;
                        ctx.beginPath();
                        ctx.roundRect(px - side / 2, py - side / 2, side, side, radius);
                        ctx.fill();
                    } else {
                        const a = Math.min(1, (0.24 + b * 0.5) * strength);
                        ctx.fillStyle = `rgba(${b > 0.3 ? accentRgb : dotRgb},${a.toFixed(3)})`;
                        ctx.beginPath();
                        ctx.arc(px, py, 1.05 + b * 0.6, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        };

        const frame = (now: number) => {
            raf = 0;
            tick(state, now);
            if (now - lastDraw >= FRAME_MS) {
                lastDraw = now;
                draw(now);
            }
            // Calmo e senza onde in giro: la tela resta ferma e il ciclo si spegne.
            const idle = state.calm && state.waves.length === 0;
            if (!idle && !reduceQuery.matches && !document.hidden) raf = requestAnimationFrame(frame);
        };

        const start = () => {
            if (!raf) raf = requestAnimationFrame(frame);
        };

        const stop = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        };

        const restart = () => {
            readColors();
            if (reduceQuery.matches) {
                stop();
                draw(performance.now());
            } else {
                start();
            }
        };

        setBackdropKick(start);
        readColors();
        resize();
        restart();

        const resizeObserver = new ResizeObserver(() => {
            resize();
            draw(performance.now());
        });
        resizeObserver.observe(canvas);

        // Tema chiaro o scuro: si rileggono i colori.
        const themeObserver = new MutationObserver(() => {
            readColors();
            draw(performance.now());
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

        const onVisibility = () => (document.hidden ? stop() : start());
        document.addEventListener("visibilitychange", onVisibility);
        reduceQuery.addEventListener("change", restart);

        // Dopo la calma riparte da solo, se nessuno sta usando la scheda.
        const wakeTimer = window.setInterval(() => {
            if (reduceQuery.matches || document.hidden) return;
            const focusInCard = !!document.activeElement?.closest("[data-auth-card]");
            if (shouldWake(state, performance.now(), focusInCard)) {
                wake(state, performance.now());
                start();
            }
        }, 1000);

        return () => {
            stop();
            setBackdropKick(null);
            resizeObserver.disconnect();
            themeObserver.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            reduceQuery.removeEventListener("change", restart);
            window.clearInterval(wakeTimer);
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.backdrop} aria-hidden="true" />;
}
