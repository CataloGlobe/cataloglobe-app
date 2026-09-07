import { useEffect, useState } from "react";

import type { DeviceFrameFormat } from "@/components/ui/DeviceFrame/DeviceFrame";

import { detectRealDeviceFormat } from "./previewControl";

/** Ritardo del ricalcolo dopo l'ultimo evento di resize. */
const RESIZE_DEBOUNCE_MS = 150;

/**
 * Classificazione del dispositivo REALE, reattiva al resize della finestra.
 *
 * Un solo listener su `resize`: copre sia il drag della finestra desktop sia
 * la rotazione su mobile (i browser moderni emettono comunque `resize` insieme
 * a `orientationchange`, che quindi non serve ascoltare separatamente).
 *
 * Il ricalcolo è debounced e lo state viene scritto solo quando la CLASSE
 * cambia davvero: un drag continuo entro lo stesso breakpoint non produce
 * alcun re-render.
 *
 * SSR-safe: senza `window` il valore iniziale è "desktop" e l'effect non gira.
 */
export function useRealDeviceFormat(): DeviceFrameFormat {
    const [realFormat, setRealFormat] = useState<DeviceFrameFormat>(() =>
        typeof window === "undefined" ? "desktop" : detectRealDeviceFormat(window.innerWidth)
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        let timer: ReturnType<typeof setTimeout> | undefined;

        const recompute = () => {
            const next = detectRealDeviceFormat(window.innerWidth);
            setRealFormat(prev => (prev === next ? prev : next));
        };

        const handleResize = () => {
            if (timer !== undefined) clearTimeout(timer);
            timer = setTimeout(recompute, RESIZE_DEBOUNCE_MS);
        };

        // Riallinea subito dopo l'idratazione: il valore iniziale dello state
        // può venire da un render SSR ("desktop") o da una larghezza cambiata
        // tra il primo render e il mount.
        recompute();

        window.addEventListener("resize", handleResize);
        return () => {
            if (timer !== undefined) clearTimeout(timer);
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    return realFormat;
}
