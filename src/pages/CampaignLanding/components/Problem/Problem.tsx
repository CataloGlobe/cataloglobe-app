import type { ReactNode } from "react";
import Section, { type SectionTone } from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, SplitHeading, WithUs } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import type { ProblemCopy } from "@pages/CampaignLanding/content/landing";
import styles from "./Problem.module.scss";

type ProblemProps = {
    id?: string;
    tone: SectionTone;
    copy: ProblemCopy;
    /** Lato del visivo su desktop; su mobile sta sempre sotto il testo. */
    visualSide: "left" | "right";
    /** Margine sopra il visivo su mobile: 22 (schede) o 0 (ordini, che ha il suo). */
    visualGap?: "card" | "none";
    visual: ReactNode;
};

/** Sezioni 2-4: problema a mano, titolo a due tempi, soluzione, visivo interattivo. */
export default function Problem({ id, tone, copy, visualSide, visualGap = "card", visual }: ProblemProps) {
    const headingId = id ? `${id}-title` : undefined;
    return (
        <Section id={id} tone={tone} labelledBy={headingId}>
            <div className={[styles.grid, visualSide === "left" ? styles.visualLeft : null].filter(Boolean).join(" ")}>
                <Reveal className={styles.text}>
                    <HandNote size="md">{copy.note}</HandNote>
                    <SplitHeading id={headingId} title={copy.title} size="problem" block className={styles.title} />
                    <p className={styles.lede}>{copy.lede}</p>
                    <WithUs pro={copy.pro}>{copy.solution}</WithUs>
                </Reveal>
                <Reveal className={[styles.visual, visualGap === "card" ? styles.visualGap : null].filter(Boolean).join(" ")}>
                    <div className={styles.visualInner}>{visual}</div>
                </Reveal>
            </div>
        </Section>
    );
}
