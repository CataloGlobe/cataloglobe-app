import styles from "./LandingFallback.module.scss";

/**
 * Fallback del Suspense della landing: solo la cornice vuota, nessun testo.
 * Il fallback globale dell'app («Stiamo preparando la tua dashboard») non va
 * mostrato a chi arriva da un annuncio. Import statico in App.tsx: un
 * fallback lazy non comparirebbe mai.
 */
export default function LandingFallback() {
    return (
        <div className={styles.fallback} aria-busy="true">
            <div className={styles.page} />
        </div>
    );
}
