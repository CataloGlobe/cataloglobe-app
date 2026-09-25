import { useEffect, useRef, useState } from "react";
import { Logo } from "@components/ui/Logo/Logo";
import LandingCta from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import { BRAND } from "@pages/CampaignLanding/content/landing";
import styles from "./NavBar.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Scarto fra la pillola nell'hero (16 + 28 px) e la pillola fissa (18 px). */
const PILL_DROP = 26;

type BarState = { pastHero: boolean; atForm: boolean };

/**
 * Barra di navigazione (SPEC §5).
 * Desktop: pillola fissa logo | Accedi, trasparente sull'hero e bianca dopo;
 * a destra entra la CTA dopo l'hero ed esce al form.
 * Mobile: la testata sta nell'hero; dopo l'hero compare in alto una barra
 * compatta (logo | pulsante piccolo), che sparisce al form. In alto e non in
 * basso: in fondo allo schermo le barre di Safari, Chrome e delle webview la
 * coprono o la fanno saltare.
 * Lo scroll scrive solo `transform` (rAF); lo stato cambia solo alle soglie.
 */
export default function NavBar() {
    const desk = useRef<HTMLDivElement>(null);
    const [state, setState] = useState<BarState>({ pastHero: false, atForm: false });

    useEffect(() => {
        let frame = 0;
        const measure = () => {
            frame = 0;
            const y = window.scrollY;
            // La pillola scende con l'hero per i primi 26 px, poi resta a 18 px.
            if (desk.current) desk.current.style.transform = `translateY(${Math.max(0, PILL_DROP - y)}px)`;
            const hero = document.querySelector("[data-landing-hero]");
            const form = document.getElementById("contatto");
            const pastHero = hero ? hero.getBoundingClientRect().bottom < 80 : false;
            const atForm = form ? form.getBoundingClientRect().top < window.innerHeight * 0.85 : false;
            setState((s) => (s.pastHero === pastHero && s.atForm === atForm ? s : { pastHero, atForm }));
        };
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(measure);
        };
        measure();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, []);

    const showCta = state.pastHero && !state.atForm;

    return (
        <>
            <div className={styles.desk}>
                <div ref={desk} className={styles.deskInner}>
                    <nav className={cx(styles.pill, state.pastHero && styles.pillSolid)} aria-label="Principale">
                        <span className={styles.logos}>
                            <Logo variant="wordmark" color="mono-white" className={cx(styles.logo, styles.logoLight)} alt={BRAND.name} />
                            <Logo variant="wordmark" color="mono-dark" className={cx(styles.logo, styles.logoDark)} alt="" />
                        </span>
                        <span className={styles.divider} aria-hidden="true" />
                        <a className={styles.login} href={BRAND.login.href}>
                            {BRAND.login.label}
                        </a>
                    </nav>
                    <div className={cx(styles.deskCta, showCta && styles.on)}>
                        <LandingCta placement="bar-top" shape="pill" inert={!showCta} />
                    </div>
                </div>
            </div>

            <div className={cx(styles.mobileBar, showCta && styles.on)} aria-hidden={!showCta || undefined}>
                <Logo variant="wordmark" color="mono-dark" className={styles.mobileLogo} alt={BRAND.name} />
                <LandingCta placement="bar-mobile" shape="compact" inert={!showCta} />
            </div>
        </>
    );
}
