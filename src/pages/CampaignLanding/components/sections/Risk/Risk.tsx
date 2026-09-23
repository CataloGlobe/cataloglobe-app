import LandingCta from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import Section from "@pages/CampaignLanding/components/Section/Section";
import SectionHeader from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { RISK } from "@pages/CampaignLanding/content/landing";
import styles from "./Risk.module.scss";

/** 8 · Cosa costa provarlo: quattro passi, verticali su mobile e in fila da desktop. */
export default function Risk() {
    return (
        <Section tone="white">
            <SectionHeader title={RISK.title} />
            <ol className={styles.steps}>
                {RISK.steps.map((step, i) => (
                    <li key={step.title} className={styles.step}>
                        <div className={styles.marker}>
                            <span className={styles.num} aria-hidden="true">
                                {i + 1}
                            </span>
                        </div>
                        <div className={styles.text}>
                            <span className={styles.title}>{step.title}</span>
                            <span className={styles.body}>{step.body}</span>
                        </div>
                    </li>
                ))}
            </ol>
            <div className={styles.cta}>
                <LandingCta placement="risk" look="filled" size="lg" block="mobile" />
            </div>
            <p className={styles.support}>{RISK.support}</p>
        </Section>
    );
}
