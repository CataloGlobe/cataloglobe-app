import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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

/**
 * Banner del consenso cookie (solo landing). Barra fissa in basso, non modale:
 * la pagina resta usabile. «Accetta» e «Rifiuta» hanno lo stesso aspetto; la X
 * ed Esc valgono come rifiuto. Il footer lo riapre con «Preferenze cookie».
 */
export default function CookieBanner() {
    const [isOpen, setIsOpen] = useState(() => shouldShowBanner(readConsent(), new Date()));
    const regionRef = useRef<HTMLElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const titleId = useId();
    const textId = useId();

    // Scelta già data e ancora valida: Clarity riparte a ogni visita.
    useEffect(() => {
        if (clarityAllowedNow()) loadClarity(CLARITY_PROJECT_ID);
    }, []);

    useEffect(
        () =>
            onOpenCookiePreferences(() => {
                returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                setIsOpen(true);
            }),
        []
    );

    // Riaperto dal footer: il focus va sul banner, così da tastiera si sceglie subito.
    useEffect(() => {
        if (isOpen && returnFocusRef.current) regionRef.current?.focus();
    }, [isOpen]);

    const decide = useCallback((choice: ConsentChoice) => {
        const wasAccepted = readConsent()?.choice === "accepted";
        writeConsent(choice);
        setIsOpen(false);
        returnFocusRef.current?.focus();
        returnFocusRef.current = null;

        if (choice === "accepted") {
            if (clarityAllowedNow()) loadClarity(CLARITY_PROJECT_ID);
        } else if (wasAccepted) {
            revokeClarity();
        }
    }, []);

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            decide("rejected");
        }
    };

    if (!isOpen) return null;

    return (
        <section
            ref={regionRef}
            className={styles.banner}
            data-tone="light"
            role="region"
            aria-labelledby={titleId}
            aria-describedby={textId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
        >
            <div className={styles.body}>
                <h2 id={titleId} className={styles.title}>
                    Cookie di analisi
                </h2>
                <p id={textId} className={styles.text}>
                    Con il tuo consenso usiamo Microsoft Clarity, che salva dei cookie, per capire come viene
                    usata questa pagina e migliorarla. Puoi cambiare scelta quando vuoi da «Preferenze cookie»
                    in fondo alla pagina.{" "}
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
