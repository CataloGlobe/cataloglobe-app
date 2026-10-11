import { Logo } from "@components/ui/Logo/Logo";
import { WORDMARK_INTRINSIC } from "@components/ui/Logo/logoDimensions";
import { COMPANY } from "@/config/company";
import CopyButton from "@pages/CampaignLanding/components/kit/CopyButton";
import { BRAND, FOOTER } from "@pages/CampaignLanding/content/landing";
import { openCookiePreferences } from "@pages/CampaignLanding/cookieConsentBrowser";
import styles from "./Footer.module.scss";

/**
 * 12 · Footer: marchio e frase, tre colonne di link, riga legale da company.ts.
 * Al telefono Prodotto e Legale affiancate, Contatti sotto a tutta riga.
 */
export default function Footer() {
    const { contact, legalName, legalAddress, vatNumber } = COMPANY;
    const { product, legal, contacts } = FOOTER.columns;
    // company.ts è `as const`: oggi il telefono è la stringa vuota letterale.
    const phone: string = contact.phone;

    return (
        <footer className={styles.footer} data-tone="dark">
            <div className={styles.inner}>
                <div className={styles.top}>
                    <div className={styles.brand}>
                        <Logo variant="wordmark" {...WORDMARK_INTRINSIC} color="mono-white" className={styles.logo} alt={BRAND.name} />
                        <p className={styles.tagline}>{FOOTER.tagline}</p>
                    </div>

                    <div className={styles.columns}>
                        {[product, legal].map((col) => (
                            <nav key={col.title} className={styles.column} aria-label={col.title}>
                                <p className={styles.columnTitle}>{col.title}</p>
                                {col.links.map((link) => (
                                    <a key={link.href} className={styles.link} href={link.href}>
                                        {link.label}
                                    </a>
                                ))}
                                {col === legal && (
                                    <button type="button" className={styles.linkButton} onClick={openCookiePreferences}>
                                        {FOOTER.cookiePreferences}
                                    </button>
                                )}
                            </nav>
                        ))}
                        <div className={`${styles.column} ${styles.contacts}`}>
                            <p className={styles.columnTitle}>{contacts.title}</p>
                            {/* L'indirizzo scritto: il mailto da solo, senza app di posta, non fa nulla. */}
                            <div className={styles.mailRow}>
                                <a className={styles.link} href={`mailto:${contact.info}`}>
                                    {contact.info}
                                </a>
                                <CopyButton text={contact.info} label={contacts.copy} copiedLabel={contacts.copied} />
                            </div>
                            {/* Il telefono si mostra solo quando company.ts ne ha uno pubblico. */}
                            {phone && (
                                <a className={styles.link} href={`tel:${phone.replace(/\s+/g, "")}`}>
                                    {contacts.phone}
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                <p className={styles.legal}>
                    {/* L'anno del prerender può non essere quello di chi legge. */}
                    <span suppressHydrationWarning>© {new Date().getFullYear()}</span> {legalName} · {legalAddress.city} ({legalAddress.province}) · {FOOTER.vatLabel} {vatNumber}
                </p>
            </div>
        </footer>
    );
}
