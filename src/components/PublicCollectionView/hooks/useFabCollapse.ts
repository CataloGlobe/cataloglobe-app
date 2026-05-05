import { useEffect, useRef, useState } from "react";

/**
 * Collassa il FAB dopo un timer o dopo uno scroll di soglia.
 * Vince il primo evento. Una volta collassato, non si riespande automaticamente.
 * Grace period iniziale: lo scroll listener parte dopo scrollGracePeriodMs (default 500ms),
 * con baseline aggiornata al momento dell'attivazione. Evita collapse istantaneo
 * quando il FAB appare durante uno scroll in corso.
 */
export function useFabCollapse(
    isVisible: boolean,
    options?: {
        timeoutMs?: number;
        scrollThresholdPx?: number;
        scrollGracePeriodMs?: number;
    }
): boolean {
    const timeoutMs = options?.timeoutMs ?? 3000;
    const scrollThresholdPx = options?.scrollThresholdPx ?? 100;
    const scrollGracePeriodMs = options?.scrollGracePeriodMs ?? 500;

    const [isCollapsed, setIsCollapsed] = useState(false);
    const startScrollYRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isVisible) {
            // Reset: FAB scomparso, ricomincia da capo alla prossima apparizione
            setIsCollapsed(false);
            startScrollYRef.current = null;
            return;
        }

        // Timer principale: collapse dopo timeoutMs
        const timeoutId = setTimeout(() => {
            setIsCollapsed(true);
        }, timeoutMs);

        let rafId: number | null = null;
        let scrollListenerActive = false;

        const handleScroll = () => {
            if (!scrollListenerActive) return;
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                const start = startScrollYRef.current;
                if (start !== null) {
                    const delta = Math.abs(window.scrollY - start);
                    if (delta >= scrollThresholdPx) {
                        setIsCollapsed(true);
                    }
                }
                rafId = null;
            });
        };

        // Grace period: registra baseline DOPO che lo scroll iniziale si è stabilizzato
        const graceTimeoutId = setTimeout(() => {
            startScrollYRef.current = window.scrollY;
            scrollListenerActive = true;
        }, scrollGracePeriodMs);

        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            clearTimeout(timeoutId);
            clearTimeout(graceTimeoutId);
            window.removeEventListener("scroll", handleScroll);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [isVisible, timeoutMs, scrollThresholdPx, scrollGracePeriodMs]);

    return isCollapsed;
}
