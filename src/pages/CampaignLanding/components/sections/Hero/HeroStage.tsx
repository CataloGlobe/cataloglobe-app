import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type Ref } from "react";
import { UtensilsCrossed } from "lucide-react";
import { HERO } from "@pages/CampaignLanding/content/landing";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import { useVisible } from "@pages/CampaignLanding/hooks/useVisible";
import {
    HERO_LOOP_MS,
    heroEvents,
    heroInitialState,
    heroReducedState,
    heroReducer,
    timelineFill,
    timelineRows,
    trackPosition,
    type Fascia,
    type HeroEvent,
    type HeroState
} from "./heroSequence";
import styles from "./HeroStage.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

const { phone: PHONE, schedule: SCHEDULE } = HERO;
const EVENTS = heroEvents();
const REDUCED = heroReducedState(PHONE.startClock);
/** Le tre fasce sulla linea orizzontale: 0 / 60 / 100 %. */
const SLOT_POS = SCHEDULE.slots.map((s) => trackPosition(s.time));

/**
 * La sequenza coi timer: gira finché `active`, in pausa riprende dal punto in
 * cui era (scheda del browser nascosta, palco quasi fuori schermo). A ogni
 * nuovo `round` torna alle 12:00 e la prossima ripresa parte da capo.
 */
function useHeroSequence(active: boolean, round: number): HeroState {
    const [state, dispatch] = useReducer(
        (s: HeroState, e: HeroEvent) => heroReducer(s, e, PHONE.startClock),
        PHONE.startClock,
        heroInitialState
    );
    // Punto del giro (ms) conservato fra una pausa e l'altra.
    const elapsed = useRef(0);
    // Da capo alla prossima ripresa (la pausa, che salva `elapsed`, può arrivare dopo).
    const fromStart = useRef(false);

    useEffect(() => {
        if (!active) return;
        if (fromStart.current) {
            fromStart.current = false;
            elapsed.current = 0;
        }
        const timers: number[] = [];
        let loopStart = performance.now() - elapsed.current;

        const plan = () => {
            timers.length = 0;
            const now = performance.now() - loopStart;
            for (const { at, event } of EVENTS) {
                if (at >= now) timers.push(window.setTimeout(() => dispatch(event), at - now));
            }
            timers.push(
                window.setTimeout(
                    () => {
                        dispatch({ type: "reset" });
                        loopStart = performance.now();
                        plan();
                    },
                    Math.max(0, HERO_LOOP_MS - now)
                )
            );
        };
        plan();

        return () => {
            timers.forEach((t) => window.clearTimeout(t));
            elapsed.current = Math.min(HERO_LOOP_MS, performance.now() - loopStart);
        };
    }, [active]);

    useEffect(() => {
        if (round === 0) return;
        fromStart.current = true;
        dispatch({ type: "reset" });
    }, [round]);

    return state;
}

function CalendarIcon() {
    return (
        <svg className={styles.tlIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
    );
}

/** Desktop largo: card verticale fra testo e telefono. */
function Timeline({ state }: { state: HeroState }) {
    const fill = useRef<HTMLElement>(null);
    const height = timelineFill(state);
    // Altezza della linea viola: valore calcolato, scritto dal ref come la parallasse.
    useLayoutEffect(() => {
        if (fill.current) fill.current.style.height = `${height}px`;
    }, [height]);

    return (
        <div className={styles.timeline}>
            <p className={styles.tlTitle}>
                <CalendarIcon />
                {SCHEDULE.title}
            </p>
            <div className={styles.tlList}>
                <i ref={fill} className={styles.tlFill} />
                {timelineRows(state.lives).map((row) => {
                    if (row.kind === "slot") {
                        const slot = SCHEDULE.slots[row.slot];
                        return (
                            <div
                                key={`s${row.slot}`}
                                className={cx(styles.ev, row.slot < state.slot && styles.evDone, row.slot === state.slot && styles.evAct)}
                            >
                                <span className={styles.evTime}>{slot.time}</span>
                                <span className={styles.evDot} />
                                <span className={styles.evText}>
                                    {PHONE.menus[row.slot].name}
                                    <span className={styles.evNow}>{SCHEDULE.now}</span>
                                </span>
                            </div>
                        );
                    }
                    const live = SCHEDULE.live[row.live];
                    return (
                        <div key={`l${row.live}`} className={cx(styles.ev, styles.evLive)}>
                            <span className={styles.evTime}>{live.time}</span>
                            <span className={styles.evDot} />
                            <span className={styles.evText}>
                                <small className={styles.evLiveLabel}>{SCHEDULE.liveLabel}</small>
                                {live.text}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const LIVE_POS_CLASS = [styles.mark0, styles.mark1];
const SLOT_POS_CLASS = [styles.pos0, styles.pos1, styles.pos2];

/** Mobile e desktop stretto: linea orizzontale sopra il telefono. */
function Track({ state }: { state: HeroState }) {
    const fill = useRef<HTMLElement>(null);
    const last = state.last;
    const width = last === null ? 0 : last.kind === "slot" ? SLOT_POS[last.slot] : trackPosition(SCHEDULE.live[last.live].time);
    useLayoutEffect(() => {
        if (fill.current) fill.current.style.width = `${width}%`;
    }, [width]);

    const stateOf = (slot: number) => cx(slot < state.slot && styles.done, slot === state.slot && styles.act);
    const slotCaption = last?.kind === "slot" ? last.slot : state.slot >= 0 ? state.slot : null;
    const liveCaption = last?.kind === "live" ? SCHEDULE.live[last.live] : null;

    return (
        <div className={styles.track}>
            <div className={styles.trkLine}>
                <i ref={fill} className={styles.trkFill} />
                {SCHEDULE.slots.map((s, j) => (
                    <i key={s.time} className={cx(styles.trkDot, SLOT_POS_CLASS[j], stateOf(j))} />
                ))}
                {SCHEDULE.live.slice(0, state.lives).map((l, j) => (
                    <i key={l.time} className={cx(styles.trkMark, LIVE_POS_CLASS[j])} />
                ))}
            </div>
            <div className={styles.trkLabels}>
                {SCHEDULE.slots.map((s, j) => (
                    <span key={s.time} className={cx(styles.trkLabel, styles[`label${j}`], stateOf(j))}>
                        {s.name}
                        <span className={styles.trkTime}>{s.time}</span>
                    </span>
                ))}
            </div>
            <div className={styles.trkCaption}>
                <span className={cx(styles.cap, (liveCaption || slotCaption === null) && styles.capOff)}>
                    <span className={styles.capDot}>●</span> {slotCaption !== null && PHONE.menus[slotCaption].name} · {SCHEDULE.running}
                </span>
                <span className={cx(styles.cap, styles.capLive, !liveCaption && styles.capOff)}>
                    {liveCaption && (
                        <>
                            <span className={styles.capDot}>●</span> {liveCaption.time} · {liveCaption.text}
                        </>
                    )}
                </span>
            </div>
        </div>
    );
}

function StatusIcons() {
    return (
        <span className={styles.sbIcons}>
            <svg viewBox="0 0 18 11" fill="currentColor">
                <rect x="0" y="7" width="3" height="4" rx="1" />
                <rect x="5" y="5" width="3" height="6" rx="1" />
                <rect x="10" y="2.5" width="3" height="8.5" rx="1" />
                <rect x="15" y="0" width="3" height="11" rx="1" />
            </svg>
            <svg viewBox="0 0 26 12">
                <rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" strokeOpacity=".5" />
                <rect x="2" y="2" width="16" height="8" rx="1.8" fill="currentColor" />
                <rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" fillOpacity=".5" />
            </svg>
        </span>
    );
}

/** Il telefono: il menù del locale d'esempio, quello della fascia in corso. */
function Phone({ state }: { state: HeroState }) {
    const menu = PHONE.menus[state.menu];
    // Modifiche al volo già arrivate al telefono, per riga del menù in vista.
    const mods = new Map<number, (typeof SCHEDULE.live)[number]>();
    SCHEDULE.live.forEach((l, j) => {
        if (j < state.applied && l.menu === state.menu) mods.set(l.row, l);
    });
    let row = 0;

    return (
        <div className={styles.phone}>
            <span className={styles.island} />
            <div className={styles.screen}>
                <div className={styles.content}>
                    <div className={styles.statusBar}>
                        <span className={cx(styles.sbTime, state.clockOut && styles.sbTimeOut)}>{state.clock}</span>
                        <StatusIcons />
                    </div>
                    <div className={styles.cover}>
                        <div className={styles.coverId}>
                            <span className={styles.logo}>
                                <UtensilsCrossed size={18} strokeWidth={2.2} />
                            </span>
                            <span>
                                <span className={styles.venue}>{PHONE.venue}</span>
                                <span key={state.menu} className={cx(styles.menuName, styles.enter, state.menuOut && styles.leaving)}>
                                    {menu.name}
                                </span>
                            </span>
                        </div>
                    </div>
                    <div key={state.menu} className={cx(styles.menuBody, styles.enter, state.menuOut && styles.leaving)}>
                        <div className={styles.chips}>
                            {menu.chips.map((c, j) => (
                                <span key={c} className={cx(styles.chip, j === 0 && styles.chipOn)}>
                                    {c}
                                </span>
                            ))}
                        </div>
                        <div className={styles.items}>
                            {menu.cats.map((cat) => (
                                <div key={cat.name}>
                                    <p className={styles.cat}>{cat.name}</p>
                                    {cat.dishes.map((d) => {
                                        const mod = mods.get(row++);
                                        const up = mod?.kind === "price";
                                        const off = mod?.kind === "sold";
                                        return (
                                            <div key={d.name} className={cx(styles.item, up && styles.itemUp, off && styles.itemOff)}>
                                                <div className={styles.itemText}>
                                                    <span className={styles.itemName}>
                                                        {d.name}
                                                        {off && <span className={styles.badge}>{PHONE.unavailable}</span>}
                                                    </span>
                                                    <span className={styles.itemDesc}>{d.desc}</span>
                                                </div>
                                                <span className={styles.itemPrice}>
                                                    {up && <s className={styles.itemOld}>{d.price} €</s>}
                                                    <span className={styles.itemValue}>{mod?.kind === "price" ? mod.to : d.price} €</span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

type HeroStageProps = {
    /** Menù in vista: lo legge l'hero per il bagliore di sfondo. */
    onFascia: (fascia: Fascia) => void;
    /** Parallasse (Hero.tsx): scrive `transform` su programmazione e telefono. */
    scheduleRef: Ref<HTMLDivElement>;
    phoneRef: Ref<HTMLDivElement>;
};

/**
 * Telefono simulato e programmazione di oggi (heroSequence.ts). Parte quando
 * entra nello schermo, si ferma fuori; uscito del tutto torna alle 12:00 e al
 * rientro riparte da capo. Con `prefers-reduced-motion` resta sull'aperitivo
 * con le bruschette esaurite. Decorativo: il senso lo dicono titolo e
 * sottotitolo.
 */
export default function HeroStage({ onFascia, scheduleRef, phoneRef }: HeroStageProps) {
    const ref = useRef<HTMLDivElement>(null);
    // Giri: +1 a ogni uscita completa dallo schermo.
    const [round, setRound] = useState(0);
    const nextRound = useCallback(() => setRound((r) => r + 1), []);
    const visible = useVisible(ref, 0.2, nextRound);
    const reduced = useReducedMotion();
    const live = useHeroSequence(visible && !reduced, round);
    const state = reduced ? REDUCED : live;

    useEffect(() => {
        onFascia(state.menu);
    }, [state.menu, onFascia]);

    return (
        <div ref={ref} className={styles.stage} aria-hidden="true">
            <div ref={scheduleRef} className={styles.scheduleTilt}>
                <Timeline state={state} />
                <Track state={state} />
            </div>
            <div ref={phoneRef} className={styles.phoneTilt}>
                <Phone state={state} />
            </div>
        </div>
    );
}
