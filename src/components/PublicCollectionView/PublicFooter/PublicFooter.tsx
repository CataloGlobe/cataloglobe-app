import type { ReactNode } from "react";
import type { SocialLinks } from "../CollectionView/CollectionView";
import { trackEvent } from "@/services/analytics/publicAnalytics";
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

function IconPhone() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
    );
}

function IconMail() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
    );
}

/* ── Helper: costruisce href per ogni social ──────────────────────────────── */

function isAbsoluteUrl(value: string): boolean {
    return value.startsWith("http://") || value.startsWith("https://");
}

function ensureHttps(url: string): string {
    if (isAbsoluteUrl(url)) return url;
    return `https://${url}`;
}

function instagramHref(value: string): string {
    if (isAbsoluteUrl(value)) return value;
    const handle = value.replace(/^@/, "");
    return `https://instagram.com/${handle}`;
}

function facebookHref(value: string): string {
    if (isAbsoluteUrl(value)) return value;
    return `https://facebook.com/${value}`;
}

function whatsappHref(value: string): string {
    // Rimuovi tutto tranne le cifre e il + iniziale
    const digits = value.replace(/[^\d+]/g, "");
    return `https://wa.me/${digits}`;
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

type SocialType = "website" | "instagram" | "facebook" | "whatsapp" | "phone" | "email";

type Props = {
    socialLinks?: SocialLinks;
    activityId?: string;
};

export default function PublicFooter({ socialLinks, activityId }: Props) {
    // Costruisce la lista di social visibili
    const visibleSocials: { href: string; label: string; icon: ReactNode; socialType: SocialType }[] = [];

    if (socialLinks?.website && socialLinks.website_public) {
        visibleSocials.push({
            href: ensureHttps(socialLinks.website),
            label: "Sito web",
            icon: <IconGlobe />,
            socialType: "website"
        });
    }
    if (socialLinks?.instagram && socialLinks.instagram_public) {
        visibleSocials.push({
            href: instagramHref(socialLinks.instagram),
            label: "Instagram",
            icon: <IconInstagram />,
            socialType: "instagram"
        });
    }
    if (socialLinks?.facebook && socialLinks.facebook_public) {
        visibleSocials.push({
            href: facebookHref(socialLinks.facebook),
            label: "Facebook",
            icon: <IconFacebook />,
            socialType: "facebook"
        });
    }
    if (socialLinks?.whatsapp && socialLinks.whatsapp_public) {
        visibleSocials.push({
            href: whatsappHref(socialLinks.whatsapp),
            label: "WhatsApp",
            icon: <IconWhatsApp />,
            socialType: "whatsapp"
        });
    }
    if (socialLinks?.phone && socialLinks.phone_public) {
        visibleSocials.push({
            href: `tel:${socialLinks.phone}`,
            label: "Telefono",
            icon: <IconPhone />,
            socialType: "phone"
        });
    }
    if (socialLinks?.email_public && socialLinks.email_public_visible) {
        visibleSocials.push({
            href: `mailto:${socialLinks.email_public}`,
            label: "Email",
            icon: <IconMail />,
            socialType: "email"
        });
    }

    return (
        <footer className={styles.footer}>
            {/* Social icons — visibili solo se configurati e pubblici */}
            {visibleSocials.length > 0 && (
                <div className={styles.socialRow}>
                    {visibleSocials.map(({ href, label, icon, socialType }) => (
                        <a
                            key={label}
                            href={href}
                            className={styles.socialBtn}
                            aria-label={label}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                                if (activityId) {
                                    trackEvent(activityId, "social_click", {
                                        social_type: socialType
                                    });
                                }
                            }}
                        >
                            {icon}
                        </a>
                    ))}
                </div>
            )}

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

            {/* Legal links */}
            <div className={styles.legalRow}>
                <a
                    href="/legal/privacy"
                    className={styles.legalLink}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Privacy Policy
                </a>
                <span className={styles.legalDot} aria-hidden>·</span>
                <a
                    href="/legal/termini"
                    className={styles.legalLink}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Termini e Condizioni
                </a>
            </div>
        </footer>
    );
}
