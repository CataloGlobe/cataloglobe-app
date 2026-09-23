import { useState } from "react";
import { Logo } from "@components/ui/Logo/Logo";
import LandingCta from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import { HighlightedText } from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { HERO } from "@pages/CampaignLanding/content/landing";
import HeroMenu from "./HeroMenu";
import styles from "./Hero.module.scss";

/**
 * 1 · Hero. Pannello scuro staccato dai bordi, con logo + «Accedi» in alto.
 * La carta menù sta dentro il pannello da desktop e sotto il pannello su
 * mobile: due istanze (una sola visibile per breakpoint) che condividono lo
 * stato della fascia, invece di un layout che sposta lo stesso nodo.
 */
export default function Hero() {
    // Riposo: «Pranzo». In Passata 2 parte dalla fascia dell'orario reale.
    const [fascia, setFascia] = useState(0);

    return (
        <section className={styles.hero} aria-labelledby="landing-hero-title">
            <div className={styles.panel} data-tone="dark">
                <div className={styles.topbar}>
                    <Logo variant="wordmark" color="mono-white" className={styles.brand} alt={HERO.brand} />
                    <a className={styles.login} href={HERO.login.href}>
                        {HERO.login.label}
                    </a>
                </div>

                <div className={styles.copy}>
                    <p className={styles.eyebrow}>{HERO.eyebrow}</p>
                    <h1 id="landing-hero-title" className={styles.title}>
                        <HighlightedText title={HERO.title} />
                    </h1>
                    <p className={styles.lede}>{HERO.lede}</p>
                    <div className={styles.cta}>
                        <LandingCta placement="hero" look="filled" size="lg" block="mobile" showNote />
                    </div>
                </div>

                <div className={styles.menuDesktop}>
                    <HeroMenu fascia={fascia} onSelect={setFascia} />
                </div>
            </div>

            <div className={styles.menuMobile}>
                <HeroMenu fascia={fascia} onSelect={setFascia} />
            </div>
        </section>
    );
}
