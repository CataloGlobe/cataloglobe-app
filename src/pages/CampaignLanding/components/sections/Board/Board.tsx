import { useId, useRef, useState, type CSSProperties, type TouchEvent } from "react";
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

type PegIds = { wood: string; side: string; steel: string; blur: string };

/**
 * Molletta di tre quarti: faccia di legno con venature e tacche della presa,
 * fianco più scuro (lo spessore), molla a spirale col filo che sale sulla
 * faccia. Il filo della bacheca passa all'altezza della molla. Gradienti in `PegDefs`.
 */
function Peg({ ids }: { ids: PegIds }) {
    return (
        <svg className={styles.peg} width="22" height="44" viewBox="0 0 24 48" aria-hidden="true" focusable="false">
            <path d="M17 3 L20 4.5 L20 31 Q19 33 19.5 35 L18.5 45 Q18 46.6 16.5 46.6 L14 46 Z" fill={`url(#${ids.side})`} />
            <path d="M3 4 Q3 1.2 5.8 1.2 L14.4 1.2 Q17.2 1.2 17.2 4 L17.2 29.5 Q15.6 31.6 16.2 34 L15.4 44 Q15 46.4 12.6 46.4 L7.6 46.4 Q5.2 46.4 4.8 44 L4 34 Q4.6 31.6 3 29.5 Z" fill={`url(#${ids.wood})`} />
            <path d="M7 3 Q6.2 12 7.4 20 T7 44" fill="none" stroke="#8B5A2E" strokeWidth="0.55" opacity="0.35" />
            <path d="M10.6 2.5 Q11.6 10 10.4 18 T11 45" fill="none" stroke="#8B5A2E" strokeWidth="0.5" opacity="0.28" />
            <path d="M13.8 3 Q13.2 14 14.2 24 T13.4 44" fill="none" stroke="#8B5A2E" strokeWidth="0.45" opacity="0.25" />
            <path d="M3.9 4 L3.9 29" stroke="#F6DDB6" strokeWidth="0.9" opacity="0.8" />
            <path d="M16.4 4 L16.4 29" stroke="#8E5E32" strokeWidth="0.7" opacity="0.5" />
            <path d="M8.2 15 L8.2 6.6 Q8.2 5.6 9.2 5.6 L11 5.6" fill="none" stroke={`url(#${ids.steel})`} strokeWidth="1.3" strokeLinecap="round" />
            <path d="M8.2 15 L8.2 6.6" fill="none" stroke="#FFFFFF" strokeWidth="0.35" opacity="0.7" />
            <rect x="1" y="14.6" width="21" height="6.4" rx="3.2" fill={`url(#${ids.steel})`} />
            <path d="M4.2 15 v5.6 M7.2 15 v5.6 M10.2 15 v5.6 M13.2 15 v5.6 M16.2 15 v5.6 M19.2 15 v5.6" stroke="#4E5166" strokeWidth="0.7" opacity="0.55" />
            <path d="M2.4 15.5 H20.6" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.75" strokeLinecap="round" />
            <path d="M6 42.6 H14.2" stroke="#7A4D27" strokeWidth="0.6" opacity="0.45" />
        </svg>
    );
}

function PegDefs({ ids }: { ids: PegIds }) {
    return (
        <svg className={styles.defs} aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={ids.wood} x1="0" x2="1">
                    <stop offset="0" stopColor="#B98650" />
                    <stop offset="0.18" stopColor="#E2BC8C" />
                    <stop offset="0.55" stopColor="#D6AA74" />
                    <stop offset="1" stopColor="#B07C47" />
                </linearGradient>
                <linearGradient id={ids.side} x1="0" x2="1">
                    <stop offset="0" stopColor="#8E5E32" />
                    <stop offset="1" stopColor="#6E4523" />
                </linearGradient>
                <linearGradient id={ids.steel} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#F2F3F8" />
                    <stop offset="0.45" stopColor="#B4B7C6" />
                    <stop offset="0.7" stopColor="#7D8094" />
                    <stop offset="1" stopColor="#5A5D70" />
                </linearGradient>
                <filter id={ids.blur} x="-5%" y="-50%" width="110%" height="200%">
                    <feGaussianBlur stdDeviation="1.6" />
                </filter>
            </defs>
        </svg>
    );
}

/**
 * Corda intrecciata fra i due lati: base, trama scura a tratti, riflesso
 * chiaro e ombra sfocata sul muro. `sag`: quanto scende al centro.
 */
function Line({ sag, blur }: { sag: "deep" | "shallow"; blur: string }) {
    const d = sag === "deep" ? 28 : 18;
    const cord = `M0 4 Q 50 ${d} 100 4`;
    return (
        <svg className={styles.line} width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d={`M0 10 Q 50 ${d + 8} 100 10`} className={styles.lineShadow} filter={`url(#${blur})`} vectorEffect="non-scaling-stroke" />
            <path d={cord} className={styles.lineBase} vectorEffect="non-scaling-stroke" />
            <path d={cord} className={styles.lineTwist} vectorEffect="non-scaling-stroke" />
            <path d={`M0 3.4 Q 50 ${d - 0.6} 100 3.4`} className={styles.lineHi} vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

/** La comanda: intestazione stampata, problema a penna, perforazione e soluzione timbrata. */
function Note({ note, n, ids }: { note: BoardNote; n: number; ids: PegIds }) {
    return (
        <div className={styles.note}>
            <div className={styles.pegWrap}>
                <Peg ids={ids} />
            </div>
            <div className={styles.paperShadow}>
                <div className={styles.paper} data-tone="light">
                    <div className={styles.meta}>
                        <span>
                            <span className={styles.metaWord}>{BOARD.ticket.word} </span>
                            {BOARD.ticket.number} {String(n).padStart(2, "0")}
                        </span>
                        <span>{note.table}</span>
                    </div>
                    <div className={styles.paperHead}>
                        <BoardIcon name={note.icon} />
                        {note.pro && <span className={cx(styles.stamp, styles.stampPro)}>{PRO_BADGE}</span>}
                    </div>
                    <h3 className={styles.noteTitle}>{note.title}</h3>
                    <p className={styles.problem}>{note.problem}</p>
                    <div className={styles.perf} />
                    <span className={styles.stamp}>{WITH_US}</span>
                    <p className={styles.withText}>{note.solution}</p>
                </div>
                <div className={styles.tear} />
            </div>
        </div>
    );
}

/**
 * Desktop: due file da quattro, ognuna sul suo filo, con leggero dondolio.
 * All'ingresso le comande si appendono una dopo l'altra (`--i`, una volta sola).
 */
function Rows({ ids, live }: { ids: PegIds; live: boolean }) {
    const rows = [BOARD.notes.slice(0, 4), BOARD.notes.slice(4, 8)];
    const ref = useRef<HTMLDivElement>(null);
    const hung = useInView(ref, 0.2, ENTRY_ROOT_MARGIN);
    return (
        <div ref={ref} className={cx(styles.rows, hung && styles.hung)}>
            {rows.map((row, r) => (
                <div key={r} className={cx(styles.row, r === 1 && styles.rowSecond)}>
                    <Line sag="deep" blur={ids.blur} />
                    <div className={styles.rowGrid}>
                        {row.map((note, i) => (
                            <div key={note.title} className={cx(styles.slot, styles[TILT[i]])} style={{ "--i": r * 4 + i } as CSSProperties}>
                                <div className={styles.tilt}>
                                    <div className={cx(styles.swing, live && styles[SWING[r][i]])}>
                                        <Note note={note} n={r * 4 + i + 1} ids={ids} />
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

/** Passo del carosello: card da 280 + 16 di spazio (Board.module.scss, .track). */
const STEP = 296;
/** Oltre la prima e l'ultima il trascinamento frena (un terzo del dito). */
const EDGE_DRAG = 0.35;

type Drag = { x: number; y: number; t: number; axis: "x" | "y" | null; dx: number };

/**
 * Mobile: carosello con frecce, puntini e scorrimento col dito. Durante il
 * trascinamento la fila segue il dito (transform scritto dal ref, senza
 * render); al rilascio va alla comanda più vicina, o alla successiva con un
 * colpo veloce. Le frecce girano in tondo, il dito si ferma ai bordi.
 */
function Rail({ ids }: { ids: PegIds }) {
    const [index, setIndex] = useState(0);
    const trackRef = useRef<HTMLDivElement>(null);
    const drag = useRef<Drag | null>(null);
    const count = BOARD.notes.length;
    const go = (delta: number) => setIndex((i) => (i + delta + count) % count);

    const release = () => {
        const el = trackRef.current;
        if (el) {
            el.style.transition = "";
            el.style.transform = "";
        }
    };
    const onTouchStart = (e: TouchEvent) => {
        const t = e.touches[0];
        drag.current = { x: t.clientX, y: t.clientY, t: performance.now(), axis: null, dx: 0 };
    };
    const onTouchMove = (e: TouchEvent) => {
        const d = drag.current;
        const el = trackRef.current;
        if (!d || !el) return;
        const t = e.touches[0];
        const dx = t.clientX - d.x;
        const dy = t.clientY - d.y;
        if (!d.axis) {
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
            d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }
        if (d.axis !== "x") return;
        const atEdge = (index === 0 && dx > 0) || (index === count - 1 && dx < 0);
        d.dx = atEdge ? dx * EDGE_DRAG : dx;
        el.style.transition = "none";
        el.style.transform = `translateX(${-index * STEP + d.dx}px)`;
    };
    const onTouchEnd = () => {
        const d = drag.current;
        drag.current = null;
        release();
        if (!d || d.axis !== "x") return;
        const fast = Math.abs(d.dx) / Math.max(performance.now() - d.t, 1) > 0.4;
        const moved = Math.abs(d.dx) > STEP / 3 || (fast && Math.abs(d.dx) > 24) ? Math.sign(-d.dx) : 0;
        const next = Math.min(count - 1, Math.max(0, index + moved));
        if (next !== index) setIndex(next);
    };

    return (
        <div className={styles.rail}>
            <Line sag="shallow" blur={ids.blur} />
            <div
                className={styles.viewport}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={() => {
                    drag.current = null;
                    release();
                }}
            >
                <div ref={trackRef} className={cx(styles.track, styles[`at${index}`])}>
                    {BOARD.notes.map((note, i) => (
                        <div
                            key={note.title}
                            className={cx(styles.card, i === index ? styles.cardOn : i < index ? styles.cardBefore : styles.cardAfter, i === index && index % 2 === 1 && styles.cardOnOdd)}
                            aria-hidden={i !== index}
                        >
                            <Note note={note} n={i + 1} ids={ids} />
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
        </div>
    );
}

/** 5 · «E tutto il resto»: la bacheca delle altre funzioni. */
export default function Board() {
    const uid = useId().replace(/:/g, "");
    const ids = { wood: `ld-peg-wood-${uid}`, side: `ld-peg-side-${uid}`, steel: `ld-peg-steel-${uid}`, blur: `ld-cord-blur-${uid}` };
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
