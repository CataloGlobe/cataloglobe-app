import { useEffect, useRef, useState } from "react";
import { HERO, type HeroBeatIcon } from "@pages/CampaignLanding/content/landing";
import { useInView } from "@pages/CampaignLanding/hooks/useInView";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import { HERO_CYCLE_TICKS, HERO_REDUCED_TICK, HERO_TICK_MS, heroFrame, startTickForHour, type Fascia } from "./heroCycle";
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

/**
 * Scheda del menù animata: cinque momenti, parte dalla fascia dell'orario
 * del visitatore quando entra nello schermo, fa un giro completo e si ferma
 * lì. Con `prefers-reduced-motion` resta sull'esaurito.
 */
export default function HeroCard({ onFascia }: HeroCardProps) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, 0.3);
    const reduced = useReducedMotion();
    const [start] = useState(() => startTickForHour(new Date().getHours()));
    const [tick, setTick] = useState(start);

    useEffect(() => {
        if (!inView || reduced) return;
        const id = window.setInterval(() => {
            setTick((t) => {
                const next = t + 1;
                if (next >= start + HERO_CYCLE_TICKS) window.clearInterval(id);
                return next;
            });
        }, HERO_TICK_MS);
        return () => window.clearInterval(id);
    }, [inView, reduced, start]);

    const frame = heroFrame(reduced ? HERO_REDUCED_TICK : tick);
    const beat = HERO.beats[frame.beat];
    const fascia = HERO.fasce[frame.fascia];

    useEffect(() => {
        onFascia(frame.fascia);
    }, [frame.fascia, onFascia]);

    return (
        <div ref={ref} className={styles.card} data-tone="light">
            <div className={cx(styles.bar, styles[`bar-${beat.icon}`])} aria-live="polite">
                {/* key: il momento nuovo rientra dal basso */}
                <div key={frame.beat} className={styles.barInner}>
                    <span className={styles.barIcon}>
                        <BeatIcon icon={beat.icon} />
                    </span>
                    <span className={styles.barTitle}>{beat.title}</span>
                    <span className={styles.barSub}>{beat.sub}</span>
                </div>
            </div>
            <div className={styles.cardBody}>
                {/* key: titolo, orario e piatti entrano come un unico blocco al cambio di fascia */}
                <div key={frame.fascia} className={styles.menu}>
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
                                    <span className={styles.price}>{raised ? dish.price + 1 : dish.price} €</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
