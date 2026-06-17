/**
 * useNewOrderAlert — alert visivo page-scoped per nuove comande sulla
 * dashboard Ordini. Effimero, zero backend, zero asset, zero dipendenze npm.
 *
 * Due canali di segnale (il SUONO è stato spostato nel dispatcher globale
 * `OperationalAlerts`, che suona tono "order" aggregato a prescindere dalla
 * pagina — qui niente audio per evitare doppio suono):
 *
 *   1. Pulse visivo (sempre): incrementa un `pulseToken` numerico che la
 *      pagina passa al kanban per animare brevemente l'header colonna
 *      "Nuove".
 *
 *   2. Title pulse (sempre, quando tab non in focus): cambia
 *      `document.title` con marker "● (N) ..." finche' la tab non torna
 *      visibile. Ripristina il titolo originale al focus o quando il
 *      conteggio submitted torna a 0.
 *
 * `soundEnabled`/`toggleSound` restano esposti (preferenza persistita in
 * `localStorage["cataloglobe-orders-sound"]`, default ON) e consumati dalla
 * UI Ordini; non gatano più alcun suono locale.
 *
 * Lifecycle:
 *   - `triggerAlert()` chiamata dal callback `onNewOrder` di
 *     `useActiveOrdersRealtime`.
 *   - `submittedCount` prop guida il title (mostrato quando > 0).
 *   - Cleanup unmount: ripristina sempre il titolo originale.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "cataloglobe-orders-sound";

interface AlertHookOptions {
    /** Conteggio corrente comande in stato `submitted` per il title. */
    submittedCount: number;
}

interface AlertHookResult {
    /** Stato persistito del toggle suono. */
    soundEnabled: boolean;
    /** Toggle del suono. Se diventa `true` prova ad armare l'audio subito. */
    toggleSound: () => void;
    /**
     * Chiamata dal subscriber realtime su INSERT genuino: emette chime
     * (se armato + abilitato), aggiorna pulse token, lascia che il
     * title-effect sotto reagisca al nuovo `submittedCount`.
     */
    triggerAlert: () => void;
    /**
     * Token numerico monotono che la pagina puo' passare a un componente
     * figlio per rieseguire un'animazione su cambio (key-like).
     */
    pulseToken: number;
}

function readStoredSoundEnabled(): boolean {
    if (typeof window === "undefined") return true;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return true;
        return raw === "true";
    } catch {
        return true;
    }
}

function writeStoredSoundEnabled(value: boolean): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
        /* private mode / quota — ignora */
    }
}

export function useNewOrderAlert({
    submittedCount
}: AlertHookOptions): AlertHookResult {
    const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
        readStoredSoundEnabled()
    );
    const [pulseToken, setPulseToken] = useState(0);

    const originalTitleRef = useRef<string>("");

    // ─── Toggle: persisti la preferenza (suono ora gestito dal dispatcher) ──
    const toggleSound = useCallback(() => {
        setSoundEnabled(prev => {
            const next = !prev;
            writeStoredSoundEnabled(next);
            return next;
        });
    }, []);

    // ─── triggerAlert: solo pulse token (il suono è nel dispatcher) ─────────
    const triggerAlert = useCallback(() => {
        setPulseToken(t => t + 1);
    }, []);

    // ─── Title pulse ────────────────────────────────────────────────────
    // Salva titolo originale al primo mount. Effect su (submittedCount,
    // visibilita') applica o ripristina.
    useEffect(() => {
        if (originalTitleRef.current === "") {
            originalTitleRef.current = document.title;
        }
    }, []);

    useEffect(() => {
        function applyTitle() {
            const original = originalTitleRef.current || "CataloGlobe";
            if (submittedCount > 0 && document.hidden) {
                document.title = `● (${submittedCount}) Nuove · Ordini · CataloGlobe`;
            } else {
                document.title = original;
            }
        }
        applyTitle();
        document.addEventListener("visibilitychange", applyTitle);
        return () => {
            document.removeEventListener("visibilitychange", applyTitle);
        };
    }, [submittedCount]);

    // Cleanup unmount: ripristina sempre.
    useEffect(() => {
        return () => {
            if (originalTitleRef.current) {
                document.title = originalTitleRef.current;
            }
        };
    }, []);

    return { soundEnabled, toggleSound, triggerAlert, pulseToken };
}
