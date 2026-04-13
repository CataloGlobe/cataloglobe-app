import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './LegalLayout.module.scss';

function CataloGlobeLogo() {
    return (
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="9.5" stroke="#6366f1" strokeWidth="1.5" />
            <ellipse cx="11" cy="11" rx="4.5" ry="9.5" stroke="#6366f1" strokeWidth="1.5" />
            <line x1="1.5" y1="11" x2="20.5" y2="11" stroke="#6366f1" strokeWidth="1.5" />
        </svg>
    );
}

type LegalLayoutProps = {
    children: ReactNode;
    otherLegalLink: { href: string; label: string };
};

export default function LegalLayout({ children, otherLegalLink }: LegalLayoutProps) {
    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <button
                    type="button"
                    className={styles.backBtn}
                    onClick={() => window.history.back()}
                >
                    ← Indietro
                </button>
                <div className={styles.logoRow}>
                    <CataloGlobeLogo />
                    <span className={styles.logoText}>CataloGlobe</span>
                </div>
            </header>

            <main className={styles.main}>
                {children}
            </main>

            <footer className={styles.footer}>
                <span>© 2026 CataloGlobe</span>
                <span className={styles.footerDot} aria-hidden>·</span>
                <Link to={otherLegalLink.href} className={styles.footerLink}>
                    {otherLegalLink.label}
                </Link>
            </footer>
        </div>
    );
}
