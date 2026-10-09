import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Logo/Logo";
import Text from "@/components/ui/Text/Text";
import { COMPANY } from "@/config/company";
import styles from "./AuthLayout.module.scss";

type HeroTone = "brand" | "warning";

interface AuthLayoutProps {
  /** Senza contenuto (attesa) la scheda non si mostra. */
  children?: React.ReactNode;
  /** Titolo grande sopra la scheda. Senza, la pagina mette il suo dentro la scheda. */
  heading?: React.ReactNode;
  lead?: React.ReactNode;
  /** Icona nel riquadro sopra il titolo: con l'icona il titolo va al centro. */
  icon?: React.ReactNode;
  tone?: HeroTone;
  /** Link in alto a destra, per esempio «Usa un altro account». */
  aside?: React.ReactNode;
}

/**
 * Le pagine di accesso: sfondo a griglia sul colore del marchio, titolo sopra
 * e una scheda al centro (mockup approvati da Lorenzo il 2026-10-09).
 */
export function AuthLayout({ children, heading, lead, icon, tone = "brand", aside }: AuthLayoutProps) {
  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <Link to="/" className={styles.logoLink} aria-label="CataloGlobe home">
          <Logo variant="lockup-horizontal" color="auto" size={32} className={styles.logoImg} />
        </Link>
        {aside && <div className={styles.aside}>{aside}</div>}
      </header>

      <main className={styles.main}>
        <div className={styles.column}>
          {heading && (
            <div className={`${styles.hero} ${icon ? styles.heroCentered : ""}`} role={children ? undefined : "status"}>
              {icon && (
                <span className={`${styles.tile} ${tone === "warning" ? styles.tileWarning : ""}`} aria-hidden="true">
                  {icon}
                </span>
              )}
              <h1 className={styles.heading}>{heading}</h1>
              {lead && (
                <Text as="p" variant="body" colorVariant="muted" className={styles.lead}>
                  {lead}
                </Text>
              )}
            </div>
          )}
          {children && <div className={styles.card}>{children}</div>}
        </div>
      </main>

      <footer className={styles.footer}>
        <Link to="/legal/privacy" className={styles.footerLink}>Privacy</Link>
        <Link to="/legal/termini" className={styles.footerLink}>Termini</Link>
        <a href={`mailto:${COMPANY.contact.support}`} className={styles.footerLink}>Supporto</a>
        <span className={styles.footerLink}>© 2026 CataloGlobe</span>
      </footer>
    </div>
  );
}
