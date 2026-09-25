import LandingCta from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, SplitHeading, Underlined } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { START } from "@pages/CampaignLanding/content/landing";
import { useCtaEntry } from "@pages/CampaignLanding/hooks/useCtaEntry";
import styles from "./Start.module.scss";

function StartCta({ className }: { className: string }) {
    const note = useCtaEntry("start").note ?? [];
    return (
        <div className={className}>
            <LandingCta placement="start" shape="start" />
            {note.map((line) => (
                <p key={line} className={styles.ctaNote}>
                    {line}
                </p>
            ))}
        </div>
    );
}

/**
 * 9 · Cosa ti costa provarlo. Desktop: titolo e pulsante a sinistra, i quattro
 * passi a destra con l'etichetta a mano allineata a destra. Mobile: etichetta
 * sopra ogni passo, pulsante in fondo.
 */
export default function Start() {
    return (
        <Section tone="white" labelledBy="landing-start-title">
            <div className={styles.grid}>
                <Reveal>
                    <HandNote size="lg" className={styles.handNote}>{START.note}</HandNote>
                    <SplitHeading id="landing-start-title" title={START.title} size="section" />
                    <StartCta className={styles.ctaDesktop} />
                </Reveal>
                <Reveal className={styles.steps}>
                    {START.steps.map((step) => (
                        <div key={step.when} className={styles.step}>
                            <div className={styles.when}>{step.when}</div>
                            <div>
                                <h3 className={styles.stepTitle}>
                                    {step.title}
                                    {step.underlined && <Underlined className={styles.free}>{step.underlined}</Underlined>}
                                </h3>
                                <p className={styles.stepBody}>{step.body}</p>
                            </div>
                        </div>
                    ))}
                </Reveal>
            </div>
            <StartCta className={styles.ctaMobile} />
        </Section>
    );
}
