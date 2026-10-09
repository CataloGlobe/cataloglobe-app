import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Logo/Logo";
import Text from "@/components/ui/Text/Text";
import { COMPANY } from "@/config/company";
import { AuthBackdrop } from "./AuthBackdrop";
import { calmAuthBackdrop, pulseAuthBackdrop } from "./backdropWaves";
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

/** Chi usa la scheda (scrive, incolla, clicca) calma lo sfondo; le schede Accedi | Registrati no. */
function calmUnlessTabs(e: React.SyntheticEvent) {
  if ((e.target as Element).closest("[data-auth-tabs]")) return;
  calmAuthBackdrop();
}

/** Un clic sullo sfondo vuoto fa partire un'onda da lì. */
function pulseOnBackground(e: React.PointerEvent) {
  const target = e.target as Element;
  if (target.closest("a, button, input, select, textarea, label, [data-auth-card], [data-auth-hero]")) return;
  pulseAuthBackdrop(e.clientX, e.clientY);
}

/**
 * Le pagine di accesso: tela di punti animata sul colore del marchio, titolo
 * sopra e una scheda al centro (mockup approvati da Lorenzo il 2026-10-09).
 */
export function AuthLayout({ children, heading, lead, icon, tone = "brand", aside }: AuthLayoutProps) {
  return (
    <div className={styles.wrapper} onPointerDown={pulseOnBackground}>
      <AuthBackdrop />
      <header className={styles.header}>
        <Link to="/" className={styles.logoLink} aria-label="CataloGlobe home">
          <Logo variant="lockup-horizontal" color="auto" size={32} className={styles.logoImg} />
        </Link>
        {aside && <div className={styles.aside}>{aside}</div>}
      </header>

      <main className={styles.main}>
        <div className={styles.column}>
          {heading && (
            <div
              className={`${styles.hero} ${icon ? styles.heroCentered : ""}`}
              role={children ? undefined : "status"}
              data-auth-hero
            >
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
          {children && (
            <div
              className={styles.card}
              data-auth-card
              onKeyDown={calmUnlessTabs}
              onPaste={calmUnlessTabs}
              onPointerDown={calmUnlessTabs}
            >
              <div className={styles.cardBody}>{children}</div>
            </div>
          )}
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
