import { useId, useRef, useState, type TouchEvent } from "react";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, SplitHeading } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { BOARD, PRO_BADGE, WITH_US, type BoardNote } from "@pages/CampaignLanding/content/landing";
import { ENTRY_ROOT_MARGIN, useInView } from "@pages/CampaignLanding/hooks/useInView";
import BoardIcon from "./BoardIcon";
import styles from "./Board.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Inclinazione e margine alto per posizione nella fila (esterni più inclinati e più alti). */
const TILT = ["tiltA", "tiltB", "tiltC", "tiltD"] as const;
/** Dondolio: nome e durata per posizione, diversi fra le due file. */
const SWING = [
    ["swing0s6", "swing1s7", "swing2s8", "swing3s6"],
    ["swing2s6", "swing3s7", "swing0s8", "swing1s6"]
] as const;

/** Molletta vista di fronte: legno + molla d'acciaio. Gradienti definiti una volta in `PegDefs`. */
function Peg({ ids }: { ids: { wood: string; steel: string } }) {
    return (
        <svg className={styles.peg} width="18" height="38" viewBox="0 0 18 38" aria-hidden="true" focusable="false">
            <path d="M2.5 3.5 Q2.5 0.8 5.2 0.8 L12.8 0.8 Q15.5 0.8 15.5 3.5 L15.5 30 Q15.5 33 14 35 Q12.8 37.2 9 37.2 Q5.2 37.2 4 35 Q2.5 33 2.5 30 Z" fill={`url(#${ids.wood})`} />
            <path d="M9 2.5 L9 36" stroke="#7E5429" strokeWidth="0.8" opacity="0.55" />
            <path d="M4.2 5 Q9 3.6 13.8 5" fill="none" stroke="#F0CFA3" strokeWidth="0.8" opacity="0.7" />
            <rect x="1.2" y="12.5" width="15.6" height="6" rx="2" fill={`url(#${ids.steel})`} />
            <path d="M3.2 13 v5 M6.1 13 v5 M9 13 v5 M11.9 13 v5 M14.8 13 v5" stroke="#5E6178" strokeWidth="0.7" opacity="0.6" />
            <rect x="1.2" y="12.5" width="15.6" height="1.3" rx="0.65" fill="#F4F5F9" opacity="0.9" />
        </svg>
    );
}

function PegDefs({ ids }: { ids: { wood: string; steel: string } }) {
    return (
        <svg className={styles.defs} aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={ids.wood} x1="0" x2="1">
                    <stop offset="0" stopColor="#A97643" />
                    <stop offset="0.35" stopColor="#D9AE7C" />
                    <stop offset="0.65" stopColor="#D2A571" />
                    <stop offset="1" stopColor="#9E6D3C" />
                </linearGradient>
                <linearGradient id={ids.steel} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#E4E6EE" />
                    <stop offset="0.5" stopColor="#A3A6B8" />
                    <stop offset="1" stopColor="#6F7288" />
                </linearGradient>
            </defs>
        </svg>
    );
}

/** Filo teso fra i due lati, con la sua ombra. `sag`: quanto scende al centro. */
function Line({ sag }: { sag: "deep" | "shallow" }) {
    const d = sag === "deep" ? 28 : 18;
    return (
        <svg className={styles.line} width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d={`M0 4 Q 50 ${d} 100 4`} fill="none" stroke="#D9C3A0" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <path d={`M0 5.5 Q 50 ${d + 1.5} 100 5.5`} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" transform="translate(0 2)" />
        </svg>
    );
}

function Note({ note, ids }: { note: BoardNote; ids: { wood: string; steel: string } }) {
    return (
        <div className={styles.note}>
            <div className={styles.pegWrap}>
                <Peg ids={ids} />
            </div>
            <div className={styles.paperShadow}>
                <div className={styles.paper} data-tone="light">
                    <div className={styles.paperHead}>
                        <BoardIcon name={note.icon} />
                        {note.pro && <span className={styles.pro}>{PRO_BADGE}</span>}
                    </div>
                    <h3 className={styles.noteTitle}>{note.title}</h3>
                    <p className={styles.problem}>{note.problem}</p>
                    <div className={styles.with}>
                        <span className={styles.withTag}>{WITH_US}</span>
                        <p className={styles.withText}>{note.solution}</p>
                    </div>
                </div>
                <div className={styles.tear} />
            </div>
        </div>
    );
}

/** Desktop: due file da quattro, ognuna sul suo filo, con leggero dondolio. */
function Rows({ ids, live }: { ids: { wood: string; steel: string }; live: boolean }) {
    const rows = [BOARD.notes.slice(0, 4), BOARD.notes.slice(4, 8)];
    return (
        <div className={styles.rows}>
            {rows.map((row, r) => (
                <div key={r} className={cx(styles.row, r === 1 && styles.rowSecond)}>
                    <Line sag="deep" />
                    <div className={styles.rowGrid}>
                        {row.map((note, i) => (
                            <div key={note.title} className={cx(styles.slot, styles[TILT[i]])}>
                                <div className={styles.tilt}>
                                    <div className={cx(styles.swing, live && styles[SWING[r][i]])}>
                                        <Note note={note} ids={ids} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Mobile: carosello con frecce, puntini e scorrimento col dito. */
function Rail({ ids }: { ids: { wood: string; steel: string } }) {
    const [index, setIndex] = useState(0);
    const touch = useRef<{ x: number; y: number } | null>(null);
    const count = BOARD.notes.length;
    const go = (delta: number) => setIndex((i) => (i + delta + count) % count);

    const onTouchStart = (e: TouchEvent) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = (e: TouchEvent) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    };

    return (
        <div className={styles.rail}>
            <Line sag="shallow" />
            <div
                className={styles.viewport}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                onTouchCancel={() => (touch.current = null)}
            >
                <div className={cx(styles.track, styles[`at${index}`])}>
                    {BOARD.notes.map((note, i) => (
                        <div
                            key={note.title}
                            className={cx(styles.card, i === index ? styles.cardOn : i < index ? styles.cardBefore : styles.cardAfter, i === index && index % 2 === 1 && styles.cardOnOdd)}
                            aria-hidden={i !== index}
                        >
                            <Note note={note} ids={ids} />
                        </div>
                    ))}
                </div>
            </div>
            <div className={styles.controls}>
                <button type="button" className={styles.arrow} aria-label={BOARD.prev} onClick={() => go(-1)}>
                    ‹
                </button>
                <div className={styles.dots} aria-hidden="true">
                    {BOARD.notes.map((note, i) => (
                        <span key={note.title} className={cx(styles.dot, i === index && styles.dotOn)} />
                    ))}
                </div>
                <button type="button" className={styles.arrow} aria-label={BOARD.next} onClick={() => go(1)}>
                    ›
                </button>
            </div>
            <p className={styles.hint}>{BOARD.hint}</p>
        </div>
    );
}

/** 5 · «E tutto il resto»: la bacheca delle altre funzioni. */
export default function Board() {
    const uid = useId().replace(/:/g, "");
    const ids = { wood: `ld-peg-wood-${uid}`, steel: `ld-peg-steel-${uid}` };
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, 0.15, ENTRY_ROOT_MARGIN);

    return (
        <Section tone="dark" space="board" flushX className={styles.section} labelledBy="landing-board-title">
            <div ref={ref}>
                <Reveal className={styles.head}>
                    <HandNote size="lg" className={styles.handNote}>{BOARD.note}</HandNote>
                    <SplitHeading id="landing-board-title" title={BOARD.title} size="section" block className={styles.title} />
                </Reveal>
                <PegDefs ids={ids} />
                <div className={styles.desktopOnly}>
                    <Rows ids={ids} live={inView} />
                </div>
                <div className={styles.mobileOnly}>
                    <Rail ids={ids} />
                </div>
            </div>
        </Section>
    );
}
