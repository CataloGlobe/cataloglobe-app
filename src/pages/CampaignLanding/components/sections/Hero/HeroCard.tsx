import { useEffect, useRef, useState } from "react";
import { HERO, type HeroBeatIcon } from "@pages/CampaignLanding/content/landing";
import { useVisible } from "@pages/CampaignLanding/hooks/useVisible";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import {
    HERO_BEAT_MS,
    HERO_EXIT_MS,
    HERO_FIRST_CHANGE_MS,
    HERO_REDUCED_BEAT,
    changesFascia,
    heroFrame,
    nextBeat,
    startBeatForHour,
    type Fascia
} from "./heroCycle";
import styles from "./Hero.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

function BeatIcon({ icon }: { icon: HeroBeatIcon }) {
    const common = {
        width: 15,
        height: 15,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true
    };
    if (icon === "tag") {
        return (
            <svg {...common}>
                <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8L13.8 21a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6Z" />
                <circle cx="7.5" cy="7.5" r="1.5" />
            </svg>
        );
    }
    if (icon === "ban") {
        return (
            <svg {...common}>
                <circle cx="12" cy="12" r="9" />
                <path d="m5.7 5.7 12.6 12.6" />
            </svg>
        );
    }
    return (
        <svg {...common}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </svg>
    );
}

type HeroCardProps = {
    /** Fascia mostrata: la legge anche l'hero, per il bagliore di sfondo. */
    onFascia: (fascia: Fascia) => void;
};

/** Cosa sta uscendo: solo la striscia, o striscia e blocco menù (cambio di fascia). */
type Leaving = null | "bar" | "all";

/**
 * Scheda del menù animata (heroCycle.ts): parte dalla fascia dell'orario del
 * visitatore e gira di continuo finché è sullo schermo (in pausa fuori vista
 * e a scheda del browser nascosta). Con `prefers-reduced-motion` resta
 * sull'esaurito.
 *
 * Una sola transizione per tutti i passaggi: la parte che cambia prende
 * `.leaving` (esce in 160 ms), poi il momento nuovo la rimonta con una key e
 * rientra con la sua animazione d'ingresso (240 ms). Nelle modifiche dal
 * telefono il blocco menù non ha key nuova: entra solo il pezzo della riga.
 */
export default function HeroCard({ onFascia }: HeroCardProps) {
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisible(ref, 0.3);
    const reduced = useReducedMotion();
    const [beat, setBeat] = useState(() => startBeatForHour(new Date().getHours()));
    const [leaving, setLeaving] = useState<Leaving>(null);
    // Stato del timer fuori dal render: momento corrente e ms che mancano al
    // prossimo cambio, conservati fra una pausa e l'altra.
    const clock = useRef<{ beat: number; remaining: number } | null>(null);

    useEffect(() => {
        if (!visible || reduced) return;
        const c = (clock.current ??= { beat, remaining: HERO_FIRST_CHANGE_MS });
        let since = performance.now();
        let pending: number | null = null;
        let swapTimer = 0;

        const swap = () => {
            if (pending === null) return;
            c.beat = pending;
            pending = null;
            setBeat(c.beat);
            setLeaving(null);
        };
        const leave = () => {
            pending = nextBeat(c.beat);
            setLeaving(changesFascia(c.beat) ? "all" : "bar");
            swapTimer = window.setTimeout(swap, HERO_EXIT_MS);
            c.remaining = HERO_BEAT_MS[pending];
            since = performance.now();
            timer = window.setTimeout(leave, c.remaining);
        };
        let timer = window.setTimeout(leave, c.remaining);

        return () => {
            window.clearTimeout(timer);
            window.clearTimeout(swapTimer);
            c.remaining = Math.max(0, c.remaining - (performance.now() - since));
            // In pausa a metà uscita: il momento nuovo si mostra subito.
            swap();
        };
        // `beat` serve solo alla prima partenza: poi il timer tiene il suo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, reduced]);

    const frame = heroFrame(reduced ? HERO_REDUCED_BEAT : beat);
    const bar = HERO.beats[frame.beat];
    const fascia = HERO.fasce[frame.fascia];

    useEffect(() => {
        onFascia(frame.fascia);
    }, [frame.fascia, onFascia]);

    return (
        <div ref={ref} className={styles.card} data-tone="light">
            <div className={cx(styles.bar, styles[`bar-${bar.icon}`])} aria-live="polite">
                <div key={frame.beat} className={cx(styles.barInner, styles.enter, leaving && styles.leaving)}>
                    <span className={styles.barIcon}>
                        <BeatIcon icon={bar.icon} />
                    </span>
                    <span className={styles.barTitle}>{bar.title}</span>
                    <span className={styles.barSub}>{bar.sub}</span>
                </div>
            </div>
            <div className={styles.cardBody}>
                <div key={frame.fascia} className={cx(styles.menu, styles.enter, leaving === "all" && styles.leaving)}>
                    <div className={styles.menuHead}>
                        <span className={styles.menuTitle}>{fascia.title}</span>
                        <span className={styles.menuHours}>{fascia.hours}</span>
                    </div>
                    <div className={styles.rows}>
                        {fascia.dishes.map((dish, i) => {
                            const raised = frame.raisedRow === i;
                            const off = frame.soldOutRow === i;
                            return (
                                <div key={dish.name} className={cx(styles.row, off && styles.rowOff, raised && styles.rowUp)}>
                                    <span className={styles.rowName}>{dish.name}</span>
                                    {off && <span className={styles.badge}>{HERO.unavailable}</span>}
                                    <span className={styles.leader} aria-hidden="true" />
                                    {raised && <span className={styles.old}>{dish.price} €</span>}
                                    {/* key: il prezzo nuovo è un elemento nuovo, ed entra */}
                                    <span key={raised ? "up" : "base"} className={cx(styles.price, raised && styles.priceIn)}>
                                        {raised ? dish.price + 1 : dish.price} €
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
