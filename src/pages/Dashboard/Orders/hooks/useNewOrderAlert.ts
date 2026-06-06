/**
 * useNewOrderAlert — alert page-scoped per nuove comande sulla dashboard
 * Ordini. Effimero, zero backend, zero asset, zero dipendenze npm.
 *
 * Tre canali di segnale, ordinati per affidabilita':
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
 *   3. Chime sintetizzato (quando audio armato + toggle ON): due
 *      oscillatori brevi (~250ms) via Web Audio API nativa. Niente
 *      asset. Se l'AudioContext non e' ancora armato al momento
 *      dell'arrivo, SKIP silenzioso — non accodare suoni da riprodurre
 *      dopo (l'autoplay di chime in ritardo e' inquietante).
 *      Debounce ~3s: piu' arrivi in sequenza → un solo chime.
 *
 * Audio unlock: AudioContext creato lazy. Armato al primo gesto utente
 * (listener `pointerdown` one-shot) o quando l'utente attiva il toggle.
 *
 * Persistenza: stato del toggle salvato in
 * `localStorage["cataloglobe-orders-sound"]`. Default ON (true).
 *
 * Lifecycle:
 *   - `triggerAlert()` chiamata dal callback `onNewOrder` di
 *     `useActiveOrdersRealtime`.
 *   - `submittedCount` prop guida il title (mostrato quando > 0).
 *   - Cleanup unmount: ripristina sempre il titolo originale.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "cataloglobe-orders-sound";
const CHIME_DEBOUNCE_MS = 3000;

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

    const soundEnabledRef = useRef(soundEnabled);
    soundEnabledRef.current = soundEnabled;

    const audioCtxRef = useRef<AudioContext | null>(null);
    const audioArmedRef = useRef(false);
    const lastChimeAtRef = useRef(0);
    const originalTitleRef = useRef<string>("");

    // ─── Audio: lazy create + arm su gesto utente ───────────────────────
    const ensureAudioContext = useCallback((): AudioContext | null => {
        if (audioCtxRef.current) return audioCtxRef.current;
        try {
            const Ctor =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext })
                    .webkitAudioContext;
            if (!Ctor) return null;
            const ctx = new Ctor();
            audioCtxRef.current = ctx;
            return ctx;
        } catch {
            return null;
        }
    }, []);

    const armAudio = useCallback(() => {
        const ctx = ensureAudioContext();
        if (!ctx) return;
        if (ctx.state === "suspended") {
            void ctx.resume().then(
                () => {
                    audioArmedRef.current = ctx.state === "running";
                },
                () => {
                    /* resume bocciato (es. politica autoplay senza gesto):
                       audioArmedRef resta false, fallback visivo+title */
                }
            );
        } else {
            audioArmedRef.current = ctx.state === "running";
        }
    }, [ensureAudioContext]);

    // Listener one-shot su qualsiasi gesto utente per provare ad armare
    // l'audio. Coperto anche dal toggle manuale, ma cosi' funziona pure
    // se l'utente clicca prima di toccare il toggle (default ON).
    useEffect(() => {
        if (audioArmedRef.current) return;
        function onFirstGesture() {
            armAudio();
        }
        document.addEventListener("pointerdown", onFirstGesture, { once: true });
        document.addEventListener("keydown", onFirstGesture, { once: true });
        return () => {
            document.removeEventListener("pointerdown", onFirstGesture);
            document.removeEventListener("keydown", onFirstGesture);
        };
    }, [armAudio]);

    // ─── Chime sintetizzato: due tone brevi con envelope ────────────────
    const playChime = useCallback(() => {
        if (!soundEnabledRef.current) return;
        if (!audioArmedRef.current) return;
        const ctx = audioCtxRef.current;
        if (!ctx || ctx.state !== "running") return;

        const now = Date.now();
        if (now - lastChimeAtRef.current < CHIME_DEBOUNCE_MS) return;
        lastChimeAtRef.current = now;

        const audioNow = ctx.currentTime;
        const tones: Array<{ freq: number; start: number; duration: number }> = [
            { freq: 880, start: audioNow, duration: 0.18 },
            { freq: 660, start: audioNow + 0.12, duration: 0.22 }
        ];

        for (const { freq, start, duration } of tones) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            // Envelope: attack 20ms → peak 0.15 → decay esponenziale fino
            // a ~0.001 entro `duration`. Volume basso, non spaventa.
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + duration + 0.02);
        }
    }, []);

    // ─── Toggle: persisti + se diventa ON prova ad armare ───────────────
    const toggleSound = useCallback(() => {
        setSoundEnabled(prev => {
            const next = !prev;
            writeStoredSoundEnabled(next);
            if (next) armAudio();
            return next;
        });
    }, [armAudio]);

    // ─── triggerAlert: chime + pulse token ──────────────────────────────
    const triggerAlert = useCallback(() => {
        playChime();
        setPulseToken(t => t + 1);
    }, [playChime]);

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
