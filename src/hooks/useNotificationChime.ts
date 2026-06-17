/**
 * useNotificationChime — chime audio per il campanello notifiche.
 *
 * Riusa il pattern audio di useNewOrderAlert (Web Audio API sintetizzata,
 * autoplay/unlock via gesto utente, debounce) ma indipendente dagli Ordini:
 *
 *   - Stato muto da `notificationSoundStore` (key localStorage
 *     "cataloglobe-notifications-sound", default ON) via `useSyncExternalStore`:
 *     UNICO interruttore condiviso e reattivo same-tab fra tutte le istanze
 *     (dispatcher, campanello, icona muto Ordini).
 *   - Frequenze per `variant` (customer 587→440, order 880→660).
 *   - Espone solo l'audio: niente pulse visivo, niente title pulse
 *     (il badge del campanello fa già la sua parte visiva).
 *
 * Autoplay/unlock:
 *   - AudioContext creato lazy.
 *   - Armato al primo gesto utente (pointerdown/keydown one-shot) o quando
 *     il toggle viene attivato manualmente.
 *   - Se non armato al momento del trigger → SKIP silenzioso (niente coda
 *     ritardata: un chime in ritardo sarebbe inquietante).
 *
 * Debounce ~3s: multi-arrivi ravvicinati = un solo chime.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import {
    subscribe as subscribeSound,
    getSnapshot as getSoundSnapshot,
    getServerSnapshot as getSoundServerSnapshot,
    setSoundEnabled as setStoreSoundEnabled
} from "@/hooks/notificationSoundStore";

const CHIME_DEBOUNCE_MS = 3000;

/**
 * Varianti timbriche. Toni distinti per discriminare acusticamente la
 * sorgente dell'alert senza guardare lo schermo:
 *   - `customer` (default): 587→440Hz, morbido/grave — waiter/bill.
 *   - `order`: 880→660Hz, più acuto — nuovi ordini.
 */
type ChimeVariant = "customer" | "order";

const CHIME_TONES: Record<ChimeVariant, readonly [number, number]> = {
    customer: [587, 440],
    order: [880, 660]
};

interface ChimeHookResult {
    /** Stato persistito del toggle suono. */
    soundEnabled: boolean;
    /** Toggle del suono. Su transizione OFF→ON tenta l'arm immediato. */
    toggleSound: () => void;
    /**
     * Trigger del chime. No-op se: toggle OFF, audio non armato, ctx non
     * running, o entro la finestra di debounce. `variant` sceglie il timbro
     * (default `customer`, così i chiamanti waiter/bill restano invariati).
     */
    triggerChime: (variant?: ChimeVariant) => void;
}

export function useNotificationChime(): ChimeHookResult {
    // Stato muto condiviso e reattivo (same-tab) via store esterno.
    const soundEnabled = useSyncExternalStore(
        subscribeSound,
        getSoundSnapshot,
        getSoundServerSnapshot
    );

    const audioCtxRef = useRef<AudioContext | null>(null);
    const audioArmedRef = useRef(false);
    const lastChimeAtRef = useRef(0);

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
                    /* resume bocciato: resta non armato, no fallback */
                }
            );
        } else {
            audioArmedRef.current = ctx.state === "running";
        }
    }, [ensureAudioContext]);

    // One-shot arm su qualsiasi gesto utente. Coperto anche dal toggle
    // manuale, ma serve quando l'utente non interagisce con il toggle e
    // l'audio resta OFF di default per la prima sessione.
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

    // Suona i due toni discendenti sul context già running. `variant` sceglie
    // la coppia di frequenze (customer 587→440, order 880→660).
    const playTonesNow = useCallback((ctx: AudioContext, variant: ChimeVariant) => {
        const now = Date.now();
        if (now - lastChimeAtRef.current < CHIME_DEBOUNCE_MS) return;
        lastChimeAtRef.current = now;

        const [f1, f2] = CHIME_TONES[variant];
        const audioNow = ctx.currentTime;
        const tones: Array<{ freq: number; start: number; duration: number }> = [
            { freq: f1, start: audioNow, duration: 0.2 },
            { freq: f2, start: audioNow + 0.14, duration: 0.26 }
        ];
        for (const { freq, start, duration } of tones) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + duration + 0.02);
        }
    }, []);

    // Chime: due tone discendenti 587 → 440 (timbro morbido, distinguibile
    // dal chime ordini 880 → 660).
    //
    // Non gatiamo su audioArmedRef: il listener one-shot del useEffect può
    // mancare il primo pointerdown (race con mount+effect). Tentiamo invece
    // ctx.resume() inline — nei browser desktop il resume riesce se c'è
    // stata almeno una gesture sulla pagina anche prima del mount.
    const playChime = useCallback((variant: ChimeVariant = "customer") => {
        // Guard fresco: leggi lo store all'istante del suono (no valore stale
        // dentro l'handler realtime del dispatcher).
        if (!getSoundSnapshot()) return;
        const ctx = ensureAudioContext();
        if (!ctx) return;

        if (ctx.state === "running") {
            audioArmedRef.current = true;
            playTonesNow(ctx, variant);
            return;
        }

        if (ctx.state === "suspended") {
            void ctx.resume().then(
                () => {
                    audioArmedRef.current = ctx.state === "running";
                    if (ctx.state === "running") playTonesNow(ctx, variant);
                },
                () => { /* autoplay bloccato dal browser — skip silenzioso */ }
            );
        }
    }, [ensureAudioContext, playTonesNow]);

    const toggleSound = useCallback(() => {
        const next = !getSoundSnapshot();
        setStoreSoundEnabled(next);
        if (next) armAudio();
    }, [armAudio]);

    return { soundEnabled, toggleSound, triggerChime: playChime };
}
