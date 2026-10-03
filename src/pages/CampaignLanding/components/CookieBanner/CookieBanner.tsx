import { useCallback, useEffect, useId, useRef, useState, type AnimationEvent, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { CLARITY_PROJECT_ID } from "@/config/clarity";
import { shouldLoadClarity, shouldShowBanner, type ConsentChoice } from "@pages/CampaignLanding/cookieConsent";
import {
    loadClarity,
    onOpenCookiePreferences,
    readConsent,
    revokeClarity,
    writeConsent
} from "@pages/CampaignLanding/cookieConsentBrowser";
import styles from "./CookieBanner.module.scss";

function clarityAllowedNow(): boolean {
    return shouldLoadClarity({
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        consent: readConsent(),
        now: new Date()
    });
}

/** Attesa prima della comparsa automatica: il visitatore vede prima la pagina. */
const AUTO_OPEN_DELAY_MS = 1200;

function prefersReducedMotion(): boolean {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// closed = smontato · open = in pagina (entra con l'animazione) · leaving = esce, si smonta a fine animazione.
type Phase = "closed" | "open" | "leaving";

/**
 * Banner del consenso cookie (solo landing). Barra fissa in basso, non modale:
 * la pagina resta usabile. «Accetta» e «Rifiuta» hanno lo stesso aspetto; la X
 * ed Esc valgono come rifiuto. Il footer lo riapre con «Preferenze cookie».
 */
export default function CookieBanner() {
    const [phase, setPhase] = useState<Phase>("closed");
    const regionRef = useRef<HTMLElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const autoOpenTimerRef = useRef<number | undefined>(undefined);
    const titleId = useId();
    const textId = useId();

    // Scelta già data e ancora valida: Clarity riparte a ogni visita.
    // Altrimenti il banner compare da solo dopo il ritardo, senza prendere il focus.
    useEffect(() => {
        if (clarityAllowedNow()) loadClarity(CLARITY_PROJECT_ID);
        if (shouldShowBanner(readConsent(), new Date())) {
            autoOpenTimerRef.current = window.setTimeout(() => setPhase("open"), AUTO_OPEN_DELAY_MS);
        }
        return () => window.clearTimeout(autoOpenTimerRef.current);
    }, []);

    // Riaperto dal footer: subito, senza ritardo.
    useEffect(
        () =>
            onOpenCookiePreferences(() => {
                window.clearTimeout(autoOpenTimerRef.current);
                returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                setPhase("open");
            }),
        []
    );

    // Solo alla riapertura dal footer il focus va sul banner, così da tastiera si sceglie subito.
    useEffect(() => {
        if (phase === "open" && returnFocusRef.current) regionRef.current?.focus();
    }, [phase]);

    // La scelta si salva al clic; l'uscita animata è solo visiva.
    const decide = useCallback((choice: ConsentChoice) => {
        const wasAccepted = readConsent()?.choice === "accepted";
        writeConsent(choice);
        setPhase(prefersReducedMotion() ? "closed" : "leaving");
        returnFocusRef.current?.focus();
        returnFocusRef.current = null;

        if (choice === "accepted") {
            if (clarityAllowedNow()) loadClarity(CLARITY_PROJECT_ID);
        } else if (wasAccepted) {
            revokeClarity();
        }
    }, []);

    const onAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
        if (event.target === event.currentTarget && phase === "leaving") setPhase("closed");
    };

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            decide("rejected");
        }
    };

    if (phase === "closed") return null;

    return (
        <section
            ref={regionRef}
            className={`${styles.banner} ${phase === "leaving" ? styles.leaving : ""}`}
            data-tone="light"
            role="region"
            aria-labelledby={titleId}
            aria-describedby={textId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            onAnimationEnd={onAnimationEnd}
        >
            <div className={styles.body}>
                <h2 id={titleId} className={styles.title}>
                    Cookie di analisi
                </h2>
                <p id={textId} className={styles.text}>
                    Usiamo solo strumenti tecnici necessari e, se accetti, Microsoft Clarity (cookie di
                    analisi) per migliorare questa pagina. Chiudendo con la X continui senza.{" "}
                    <a className={styles.link} href="/legal/privacy">
                        Informativa privacy
                    </a>
                </p>
            </div>
            <div className={styles.actions}>
                <button type="button" className={styles.choice} onClick={() => decide("rejected")}>
                    Rifiuta
                </button>
                <button type="button" className={styles.choice} onClick={() => decide("accepted")}>
                    Accetta
                </button>
            </div>
            <button
                type="button"
                className={styles.close}
                aria-label="Chiudi e rifiuta i cookie"
                onClick={() => decide("rejected")}
            >
                <X size={18} strokeWidth={2} aria-hidden="true" />
            </button>
        </section>
    );
}
