import type { ReactNode } from "react";
import BarChart from "@pages/CampaignLanding/components/BarChart/BarChart";
import Section from "@pages/CampaignLanding/components/Section/Section";
import SectionHeader, { HighlightedText } from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { ANALYTICS } from "@pages/CampaignLanding/content/landing";
import styles from "./Analytics.module.scss";

function Step({ n, label, children }: { n: number; label: string; children: ReactNode }) {
    return (
        <li className={styles.step}>
            <div className={styles.stepHead}>
                <span className={styles.stepNum} aria-hidden="true">
                    {n}
                </span>
                <span className={styles.stepLabel}>{label}</span>
            </div>
            {children}
        </li>
    );
}

/** 4 · Analitiche: scopri il giorno vuoto, agisci col menù, verifica. Barre ferme. */
export default function Analytics() {
    const { discover, act, verify, more } = ANALYTICS;

    return (
        <Section tone="white">
            <div className={styles.split}>
                <div className={styles.text}>
                    <SectionHeader title={<HighlightedText title={ANALYTICS.title} />} lede={ANALYTICS.lede} />
                    <p className={styles.more}>
                        {more.before}
                        <strong>{more.strong}</strong>
                        {more.after}
                    </p>
                </div>

                <ol className={styles.panel}>
                    <Step n={1} label={discover.label}>
                        <BarChart bars={discover.bars} label={discover.chartLabel} />
                        <p className={styles.caption}>{discover.caption}</p>
                    </Step>

                    <Step n={2} label={act.label}>
                        <div className={styles.featured}>
                            <span className={styles.featuredBadge}>{act.badge}</span>
                            <span className={styles.featuredTitle}>{act.title}</span>
                            <span className={styles.featuredBody}>{act.body}</span>
                        </div>
                    </Step>

                    <Step n={3} label={verify.label}>
                        <BarChart bars={verify.bars} label={verify.chartLabel} />
                        <p className={styles.caption}>{verify.caption}</p>
                        <p className={styles.sample}>{ANALYTICS.sampleNote}</p>
                    </Step>
                </ol>
            </div>
        </Section>
    );
}
