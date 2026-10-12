import { useEffect, useRef, useState } from "react";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, SplitHeading } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { IMPORT } from "@pages/CampaignLanding/content/landing";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import { useVisible } from "@pages/CampaignLanding/hooks/useVisible";
import { IMPORT_READY_TICK, IMPORT_TICKS, IMPORT_TICK_MS, importFrame } from "./importCycle";
import styles from "./Import.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Segnaposto delle righe ancora da leggere: larghezze fisse, uguali in prerender e nel browser. */
const SKELETON_W = ["72%", "64%", "78%", "56%"];

function Tick() {
    return (
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M2.5 6.4 L5 8.6 L9.5 3.6" />
        </svg>
    );
}

/** Il nome del piatto vola dal foglio alla sua riga nella scheda. Solo nel browser, a ciclo in corso. */
function flyName(stage: HTMLElement, from: HTMLElement, to: HTMLElement, text: string) {
    const box = stage.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const ghost = document.createElement("span");
    ghost.className = styles.ghost;
    ghost.textContent = text;
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.left = `${a.left - box.left}px`;
    ghost.style.top = `${a.top - box.top}px`;
    stage.append(ghost);
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    const anim = ghost.animate(
        [
            { transform: "translate(0, 0) scale(0.9)", opacity: 0 },
            { transform: "translate(0, 0) scale(1)", opacity: 1, offset: 0.15 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.96)`, opacity: 1, offset: 0.85 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0 }
        ],
        { duration: 620, easing: "cubic-bezier(.5, 0, .2, 1)" }
    );
    anim.onfinish = () => ghost.remove();
    anim.oncancel = () => ghost.remove();
}

/**
 * Foto del menù di carta → scheda con i piatti letti uno a uno. Il foglio è
 * storto sul tavolo, il mirino lo aggancia, lo scatto lo raddrizza; ogni piatto
 * si accende sul foglio e il nome vola nella sua riga. Gira finché è sullo
 * schermo; uscita del tutto, al rientro riparte da capo.
 */
function ImportDemo() {
    const ref = useRef<HTMLDivElement>(null);
    const dishRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const rowRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const [tick, setTick] = useState(0);
    const visible = useVisible(ref, 0.3, () => setTick(0));
    const reduced = useReducedMotion();

    useEffect(() => {
        if (!visible || reduced) return;
        const id = window.setInterval(() => setTick((t) => (t + 1) % IMPORT_TICKS), IMPORT_TICK_MS);
        return () => window.clearInterval(id);
    }, [visible, reduced]);

    const f = importFrame(reduced ? IMPORT_READY_TICK : tick);

    useEffect(() => {
        const stage = ref.current;
        const from = f.fly === null ? null : dishRefs.current[f.fly];
        const to = f.fly === null ? null : rowRefs.current[f.fly];
        if (reduced || f.fly === null || !stage || !from || !to || typeof stage.animate !== "function") return;
        flyName(stage, from, to, IMPORT.dishes[f.fly].name);
    }, [f.fly, reduced]);

    const status =
        f.phase === "ready" ? IMPORT.statusReady : f.phase === "photo" ? IMPORT.statusPhoto : f.lit ? `${IMPORT.statusReading} ${f.lit}/4` : IMPORT.statusReading;

    return (
        <div ref={ref} className={styles.stage}>
            <div className={cx(styles.sheetWrap, f.straight && styles.straight)} aria-hidden="true">
                <div className={styles.sheet}>
                    <div className={styles.sheetTitle}>{IMPORT.paper.title}</div>
                    <svg className={styles.sheetOrn} viewBox="0 0 46 6" aria-hidden="true" focusable="false">
                        <path d="M0 3 H18 M28 3 H46" />
                        <circle cx="23" cy="3" r="2" />
                    </svg>
                    {IMPORT.dishes.map((d, i) => (
                        <div key={d.name}>
                            <div className={styles.sheetCat}>{d.category}</div>
                            <div className={cx(styles.sheetDish, i < f.lit && (f.ready ? styles.sheetDishDone : styles.sheetDishRead))}>
                                <span className={styles.ocr} />
                                <span
                                    ref={(el) => {
                                        dishRefs.current[i] = el;
                                    }}
                                >
                                    {d.name}
                                </span>
                                <span className={styles.sheetDots} />
                                <span className={styles.sheetPrice}>{d.price}</span>
                            </div>
                        </div>
                    ))}
                    <span className={styles.stain} />
                    <div className={styles.sheetFoot}>
                        <span className={styles.sheetRule} />
                        {IMPORT.paper.footer}
                        <br />
                        {IMPORT.paper.footerNote}
                    </div>
                    <div className={cx(styles.flash, f.flash && styles.flashOn)} />
                </div>
                <div className={cx(styles.finder, f.finderOn && styles.finderOn, f.press && styles.finderPress)}>
                    <span className={cx(styles.corner, styles.cTL)} />
                    <span className={cx(styles.corner, styles.cTR)} />
                    <span className={cx(styles.corner, styles.cBL)} />
                    <span className={cx(styles.corner, styles.cBR)} />
                    <span className={styles.shutter} />
                </div>
            </div>

            <div className={styles.right}>
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <span className={cx(styles.thumb, f.thumb && styles.thumbOn)} aria-hidden="true">
                            <i />
                            <i />
                            <i />
                            <i />
                            <i />
                        </span>
                        <span className={styles.cardTitle}>
                            <b>{IMPORT.cardTitle}</b>
                            <small>{IMPORT.sub[f.phase]}</small>
                        </span>
                        <span className={cx(styles.chip, f.ready && styles.chipReady)} aria-live="polite">
                            {status}
                        </span>
                    </div>
                    <div className={styles.rows}>
                        {IMPORT.dishes.map((d, i) => (
                            <div key={d.name} className={cx(styles.row, i < f.rows && styles.rowOn)}>
                                <span className={styles.rowSkel} aria-hidden="true">
                                    <span style={{ width: SKELETON_W[i] }} />
                                    <span />
                                </span>
                                <span className={styles.rowTick} aria-hidden="true">
                                    <Tick />
                                </span>
                                <span
                                    className={styles.rowName}
                                    ref={(el) => {
                                        rowRefs.current[i] = el;
                                    }}
                                >
                                    {d.name}
                                </span>
                                <span className={styles.rowCat}>{d.category}</span>
                                <span className={styles.rowPrice}>{d.price} €</span>
                            </div>
                        ))}
                    </div>
                    <div className={styles.cardFoot}>
                        <div className={cx(styles.publish, f.ready && styles.publishOn, f.pop && styles.publishPop)}>{IMPORT.publish}</div>
                    </div>
                </div>
                <p className={cx(styles.cardNote, f.ready && styles.cardNoteOn)}>{IMPORT.cardNote}</p>
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
