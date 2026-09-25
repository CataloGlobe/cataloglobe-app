import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Logo } from "@components/ui/Logo/Logo";
import LandingCta from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import { useCtaEntry } from "@pages/CampaignLanding/hooks/useCtaEntry";
import { UnderlinedText } from "@pages/CampaignLanding/components/kit/Kit";
import { BRAND, HERO } from "@pages/CampaignLanding/content/landing";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import HeroCard from "./HeroCard";
import type { Fascia } from "./heroCycle";
import styles from "./Hero.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * Effetto cursore, solo desktop con puntatore fine (SPEC §6): scheda, testo e
 * bagliore si spostano col mouse; un alone segue il cursore. Scrive
 * direttamente `transform` in un requestAnimationFrame, niente setState.
 */
function useHeroParallax(enabled: boolean) {
    const panel = useRef<HTMLDivElement>(null);
    const glow = useRef<HTMLDivElement>(null);
    const card = useRef<HTMLDivElement>(null);
    const text = useRef<HTMLDivElement>(null);
    const spot = useRef<HTMLDivElement>(null);
    const frame = useRef(0);
    const pointer = useRef({ x: 0, y: 0, px: 0, py: 0 });

    const apply = useCallback(() => {
        frame.current = 0;
        const { x, y, px, py } = pointer.current;
        if (glow.current) glow.current.style.transform = `translate(${(x * 70).toFixed(1)}px, ${(y * 50).toFixed(1)}px)`;
        if (card.current) {
            card.current.style.transform = `rotateY(${(x * 9).toFixed(2)}deg) rotateX(${(-y * 7).toFixed(2)}deg) translate(${(x * 14).toFixed(1)}px, ${(y * 10).toFixed(1)}px)`;
        }
        if (text.current) text.current.style.transform = `translate(${(-x * 10).toFixed(1)}px, ${(-y * 6).toFixed(1)}px)`;
        if (spot.current) {
            spot.current.style.opacity = "1";
            spot.current.style.transform = `translate(${px.toFixed(0)}px, ${py.toFixed(0)}px)`;
        }
    }, []);

    const onPointerMove = useCallback(
        (e: PointerEvent<HTMLDivElement>) => {
            if (!enabled || e.pointerType !== "mouse" || !panel.current) return;
            const r = panel.current.getBoundingClientRect();
            pointer.current = {
                x: (e.clientX - r.left) / r.width - 0.5,
                y: (e.clientY - r.top) / r.height - 0.5,
                px: e.clientX - r.left,
                py: e.clientY - r.top
            };
            if (!frame.current) frame.current = requestAnimationFrame(apply);
        },
        [enabled, apply]
    );

    const onPointerLeave = useCallback(() => {
        if (frame.current) cancelAnimationFrame(frame.current);
        frame.current = 0;
        for (const el of [glow.current, card.current, text.current]) if (el) el.style.transform = "";
        if (spot.current) spot.current.style.opacity = "0";
    }, []);

    useEffect(() => () => cancelAnimationFrame(frame.current), []);

    return { refs: { panel, glow, card, text, spot }, onPointerMove, onPointerLeave };
}

function useFinePointer(): boolean {
    const [fine, setFine] = useState(false);
    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
        const update = () => setFine(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, []);
    return fine;
}

/**
 * 1 · Hero: l'unico pannello staccato dai bordi. Su mobile porta logo e
 * «Accedi» (scorrono via con l'hero); su desktop la pillola è della barra
 * fissa (`NavBar`), qui resta solo il suo spazio.
 */
export default function Hero() {
    const reduced = useReducedMotion();
    const fine = useFinePointer();
    const [fascia, setFascia] = useState<Fascia>(0);
    const { refs, onPointerMove, onPointerLeave } = useHeroParallax(fine && !reduced);
    const note = useCtaEntry("hero").note ?? [];

    return (
        <section className={styles.hero} aria-labelledby="landing-hero-title">
            <div
                ref={refs.panel}
                className={styles.panel}
                data-tone="dark"
                data-landing-hero=""
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
            >
                <div ref={refs.glow} className={styles.glow} aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className={cx(styles.glowLayer, styles[`glow${i}`], i === fascia && styles.glowOn)} />
                    ))}
                </div>
                <div ref={refs.spot} className={styles.spot} aria-hidden="true" />

                <div className={styles.mobileTop}>
                    <Logo variant="wordmark" color="mono-white" className={styles.mobileLogo} alt={BRAND.name} />
                    <a className={styles.mobileLogin} href={BRAND.login.href}>
                        {BRAND.login.label}
                    </a>
                </div>
                <div className={styles.barSpace} aria-hidden="true" />

                <div className={styles.grid}>
                    <div ref={refs.text} className={styles.copy}>
                        <p className={cx(styles.eyebrow, styles.in1)}>{HERO.eyebrow}</p>
                        <h1 id="landing-hero-title" className={cx(styles.title, styles.in2)}>
                            <UnderlinedText title={HERO.title} className={styles.titleHl} />
                        </h1>
                        <p className={cx(styles.lede, styles.in3)}>{HERO.lede}</p>
                        <div className={styles.ctaRow}>
                            <LandingCta placement="hero" shape="hero" className={styles.in4} />
                            {note.length > 0 && (
                                <p className={cx(styles.note, styles.in5)}>
                                    {note.map((line, i) => (
                                        <span key={line}>
                                            {i > 0 && <br />}
                                            {line}
                                        </span>
                                    ))}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className={styles.cardCol}>
                        <div ref={refs.card} className={styles.cardTilt}>
                            <div className={styles.cardIn}>
                                <HeroCard onFascia={setFascia} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
