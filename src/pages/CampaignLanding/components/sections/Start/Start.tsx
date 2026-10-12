import LandingCta from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, SplitHeading, Underlined } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { START, START_SIGNUP } from "@pages/CampaignLanding/content/landing";
import { useCtaEntry } from "@pages/CampaignLanding/hooks/useCtaEntry";
import { useInView } from "@pages/CampaignLanding/hooks/useInView";
import { useLandingVariant } from "@pages/CampaignLanding/variant";
import { useRef, type CSSProperties } from "react";
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

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

const DAYS = 30;
/** Tempi della linea (in sincrono con Start.module.scss): un passo ogni BEAT;
 *  il passo gratis aspetta che la barretta (DAYS × DAY_MS) sia piena. */
const BEAT = 450;
const DAY_MS = 18;
const HOLD = 150 + DAYS * DAY_MS + 200 - 120;
const TIMES = START.steps.reduce<number[]>((acc, step, i) => {
    const prev = START.steps[i - 1];
    acc.push(i === 0 ? 0 : acc[i - 1] + BEAT + (prev.underlined ? HOLD : 0));
    return acc;
}, []);

/** Pallino del passo: l'ultimo («Decidi tu») con la spunta. */
function Dot({ last }: { last: boolean }) {
    return (
        <span className={cx(styles.dot, last && styles.dotLast)}>
            {last && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                </svg>
            )}
        </span>
    );
}

/**
 * 9 · Cosa ti costa provarlo. I quattro passi su una linea del tempo: quando
 * entrano nello schermo i pallini si accendono uno dopo l'altro e il filo si
 * disegna fra uno e il successivo; nel passo gratis 30 tacche, una per giorno
 * di prova. Il pallino sta sulla riga del titolo, l'etichetta a mano è una
 * didascalia. Desktop: titolo e pulsante a sinistra,
 * etichetta a mano, filo e passo a destra. Mobile: filo a sinistra, pulsante
 * in fondo.
 */
export default function Start() {
    const lineRef = useRef<HTMLDivElement>(null);
    const on = useInView(lineRef, 0.3);
    // In /b si parte registrandosi: stessi passi, altre parole.
    const content = useLandingVariant() === "signup" ? START_SIGNUP : START;

    return (
        <Section id="come-si-parte" tone="white" labelledBy="landing-start-title">
            <div className={styles.grid}>
                <Reveal>
                    <HandNote size="lg" className={styles.handNote}>{content.note}</HandNote>
                    <SplitHeading id="landing-start-title" title={content.title} size="section" />
                    <StartCta className={styles.ctaDesktop} />
                </Reveal>
                <div ref={lineRef} className={cx(styles.timeline, on && styles.on)}>
                    <Reveal className={styles.steps}>
                        {content.steps.map((step, i) => {
                            const last = i === content.steps.length - 1;
                            return (
                                <div key={step.when} className={styles.step} style={{ "--t": `${TIMES[i]}ms`, "--hold": `${step.underlined ? HOLD : 0}ms` } as CSSProperties}>
                                    <div className={styles.when}>{step.when}</div>
                                    <div className={styles.track} aria-hidden="true">
                                        <Dot last={last} />
                                        {!last && <span className={styles.seg} />}
                                    </div>
                                    <div className={styles.content}>
                                        <h3 className={styles.stepTitle}>
                                            {step.title}
                                            {step.underlined && <Underlined className={styles.free}>{step.underlined}</Underlined>}
                                        </h3>
                                        <p className={styles.stepBody}>{step.body}</p>
                                        {step.underlined && (
                                            <span className={styles.daysWrap} aria-hidden="true">
                                                <span className={styles.days}>
                                                    {Array.from({ length: DAYS }, (_, d) => (
                                                        <span key={d} className={styles.day} style={{ "--d": d } as CSSProperties} />
                                                    ))}
                                                </span>
                                                <span className={styles.daysEnds}>
                                                    <span>{content.days.from}</span>
                                                    <span>{content.days.to}</span>
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </Reveal>
                </div>
            </div>
            <StartCta className={styles.ctaMobile} />
        </Section>
    );
}
