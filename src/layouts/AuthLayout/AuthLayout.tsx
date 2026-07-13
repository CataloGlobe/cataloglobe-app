import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Logo/Logo";
import styles from "./AuthLayout.module.scss";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <Link to="/" className={styles.logoLink} aria-label="CataloGlobe home">
          <Logo variant="lockup-horizontal" color="auto" size={32} className={styles.logoImg} />
        </Link>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>
        <span>© 2026 CataloGlobe</span>
        <span className={styles.footerSep}>·</span>
        <Link to="/legal/privacy" className={styles.footerLink}>Privacy</Link>
        <span className={styles.footerSep}>·</span>
        <Link to="/legal/termini" className={styles.footerLink}>Termini</Link>
        <span className={styles.footerSep}>·</span>
        <span className={styles.footerLink}>Supporto</span>
      </footer>
    </div>
  );
}
