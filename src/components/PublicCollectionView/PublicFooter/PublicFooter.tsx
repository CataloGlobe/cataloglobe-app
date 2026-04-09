import styles from "./PublicFooter.module.scss";

/* ── Icone SVG inline ─────────────────────────────────────────
   Nessuna dipendenza esterna. Stroke-only, currentColor.
──────────────────────────────────────────────────────────── */

function IconGlobe() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
    );
}

function IconInstagram() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
    );
}

function IconFacebook() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
    );
}

function IconWhatsApp() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
    );
}

/* ── Logo CataloGlobe SVG ─────────────────────────────────── */
function CataloGlobeLogo() {
    return (
        <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            aria-hidden
        >
            <circle cx="11" cy="11" r="9.5" stroke="#6366f1" strokeWidth="1.5" />
            <ellipse cx="11" cy="11" rx="4.5" ry="9.5" stroke="#6366f1" strokeWidth="1.5" />
            <line x1="1.5" y1="11" x2="20.5" y2="11" stroke="#6366f1" strokeWidth="1.5" />
        </svg>
    );
}

/* ── Componente ───────────────────────────────────────────── */
export default function PublicFooter() {
    return (
        <footer className={styles.footer}>
            {/* Social icons — placeholder href="#" */}
            <div className={styles.socialRow}>
                <a
                    href="#"
                    className={styles.socialBtn}
                    aria-label="Sito web"
                    onClick={e => e.preventDefault()}
                >
                    <IconGlobe />
                </a>
                <a
                    href="#"
                    className={styles.socialBtn}
                    aria-label="Instagram"
                    onClick={e => e.preventDefault()}
                >
                    <IconInstagram />
                </a>
                <a
                    href="#"
                    className={styles.socialBtn}
                    aria-label="Facebook"
                    onClick={e => e.preventDefault()}
                >
                    <IconFacebook />
                </a>
                <a
                    href="#"
                    className={styles.socialBtn}
                    aria-label="WhatsApp"
                    onClick={e => e.preventDefault()}
                >
                    <IconWhatsApp />
                </a>
            </div>

            <hr className={styles.separator} />

            {/* Powered by CataloGlobe */}
            <a
                href="https://cataloglobe.com"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.poweredByLink}
                aria-label="Powered by CataloGlobe"
            >
                <span className={styles.poweredByLabel}>Powered by</span>
                <div className={styles.brandRow}>
                    <CataloGlobeLogo />
                    <span className={styles.brandName}>CataloGlobe</span>
                </div>
            </a>

            <hr className={styles.separator} />

            {/* Legal links */}
            <div className={styles.legalRow}>
                <a
                    href="#"
                    className={styles.legalLink}
                    onClick={e => e.preventDefault()}
                >
                    Privacy Policy
                </a>
                <span className={styles.legalDot} aria-hidden>·</span>
                <a
                    href="#"
                    className={styles.legalLink}
                    onClick={e => e.preventDefault()}
                >
                    Termini e Condizioni
                </a>
            </div>
        </footer>
    );
}
