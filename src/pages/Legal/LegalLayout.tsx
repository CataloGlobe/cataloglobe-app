import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo/Logo';
import styles from './LegalLayout.module.scss';

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
                    <Logo variant="lockup-horizontal" color="auto" size={28} className={styles.logoImg} />
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
