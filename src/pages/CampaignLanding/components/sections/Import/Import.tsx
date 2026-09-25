import { useEffect, useRef, useState } from "react";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, SplitHeading } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { IMPORT } from "@pages/CampaignLanding/content/landing";
import { useInView } from "@pages/CampaignLanding/hooks/useInView";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import { IMPORT_READY_TICK, IMPORT_TICKS, IMPORT_TICK_MS, importFrame } from "./importCycle";
import styles from "./Import.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

function CameraIcon() {
    return (
        <svg className={styles.camera} width="22" height="22" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <rect className={styles.cameraFill} x="6" y="14" width="36" height="25" rx="5" />
            <path d="M17 14 l3 -5 h8 l3 5" />
            <circle className={styles.cameraLens} cx="24" cy="26.5" r="7" />
        </svg>
    );
}

/** Foto del menù di carta → scheda con i piatti letti uno a uno. */
function ImportDemo() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, 0.3);
    const reduced = useReducedMotion();
    const [tick, setTick] = useState(IMPORT_READY_TICK);

    useEffect(() => {
        if (!inView || reduced) return;
        const id = window.setInterval(() => setTick((t) => (t + 1) % IMPORT_TICKS), IMPORT_TICK_MS);
        return () => window.clearInterval(id);
    }, [inView, reduced]);

    const f = importFrame(reduced ? IMPORT_READY_TICK : tick);
    const status = f.ready ? IMPORT.statusReady : tick < 3 ? IMPORT.statusPhoto : `${IMPORT.statusReading} ${f.read}/4`;

    return (
        <div ref={ref} className={styles.stage}>
            <div className={styles.photo} aria-hidden="true">
                <div className={styles.paper}>
                    <div className={styles.paperTitle}>{IMPORT.paper.title}</div>
                    {IMPORT.dishes.map((d, i) => (
                        <div key={d.name}>
                            <div className={styles.paperCat}>{d.category.toUpperCase()}</div>
                            <div className={cx(styles.paperDish, i < f.read && f.highlight && styles.paperDishOn)}>
                                <span>{d.name}</span>
                                <span className={styles.paperDots} />
                                <span>{d.price}</span>
                            </div>
                        </div>
                    ))}
                    <div className={styles.paperFoot}>
                        <div className={styles.paperRule} />
                        <div className={styles.paperFootLine}>{IMPORT.paper.footer}</div>
                        <div className={styles.paperFootNote}>{IMPORT.paper.footerNote}</div>
                    </div>
                    <div className={styles.scanTrack} data-y={f.scanY}>
                        <div className={cx(styles.scan, f.scanOn && styles.scanOn)} />
                    </div>
                    <div className={cx(styles.frame, f.frameOn && styles.frameOn)}>
                        <span className={cx(styles.corner, styles.cTL)} />
                        <span className={cx(styles.corner, styles.cTR)} />
                        <span className={cx(styles.corner, styles.cBL)} />
                        <span className={cx(styles.corner, styles.cBR)} />
                    </div>
                    <div className={cx(styles.flash, f.flash && styles.flashOn)} />
                </div>
            </div>

            <div className={styles.card}>
                <div className={styles.cardHead}>
                    <CameraIcon />
                    <span className={styles.cardTitle}>{IMPORT.cardTitle}</span>
                    <span className={cx(styles.chip, f.ready && styles.chipReady)} aria-live="polite">
                        {status}
                    </span>
                </div>
                <div className={styles.cardBody}>
                    {IMPORT.dishes.map((d, i) => (
                        <div key={d.name} className={cx(styles.row, i < f.read && styles.rowOn)}>
                            <span className={styles.rowName}>{d.name}</span>
                            <span className={styles.rowCat}>{d.category}</span>
                            <span className={styles.rowPrice}>{d.price} €</span>
                        </div>
                    ))}
                    <div className={cx(styles.publish, f.ready && styles.publishOn, f.pop && styles.publishPop)}>{IMPORT.publish}</div>
                </div>
            </div>
        </div>
    );
}

/** 6 · «Non ho tempo»: basta una foto del menù che hai già. */
export default function Import() {
    return (
        <Section tone="lilla" labelledBy="landing-import-title">
            <div className={styles.grid}>
                <Reveal>
                    <HandNote size="sm">{IMPORT.note}</HandNote>
                    <SplitHeading id="landing-import-title" title={IMPORT.title} size="section" className={styles.title} />
                    <p className={styles.lede}>
                        <span className={styles.ledeDesktop}>{IMPORT.lede}</span>
                        <span className={styles.ledeMobile}>{IMPORT.ledeMobile}</span>
                    </p>
                </Reveal>
                <Reveal className={styles.visual}>
                    <ImportDemo />
                </Reveal>
            </div>
        </Section>
    );
}
