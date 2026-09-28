import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ENTRY_ROOT_MARGIN, useInView } from "@pages/CampaignLanding/hooks/useInView";
import styles from "./Reveal.module.scss";

type RevealProps = {
    className?: string;
    /** `cards`: schede prezzi, 120 ms fra una e l'altra e 24 px di salita. */
    variant?: "default" | "cards";
    children: ReactNode;
};

/**
 * Ingresso di un blocco allo scroll (SPEC §8): i figli diretti salgono di 16 px
 * in dissolvenza in 500 ms, 60 ms l'uno dall'altro, quando il blocco entra per
 * il 15% nello schermo ristretto del 12% in basso (ENTRY_ROOT_MARGIN). Una
 * volta sola. Con `prefers-reduced-motion` niente ingresso (solo CSS).
 */
export default function Reveal({ className, variant = "default", children }: RevealProps) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, 0.15, ENTRY_ROOT_MARGIN);

    // Sfalsamento sui soli figli visibili: le varianti mobile/desktop nascoste
    // (display: none) non devono lasciare buchi. Valore calcolato, scritto dal
    // ref come le altre misure della landing. Già al montaggio, così all'ingresso
    // i ritardi ci sono dal primo fotogramma; di nuovo all'ingresso, se nel
    // frattempo la finestra ha cambiato misura.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        let i = 0;
        for (const child of Array.from(el.children)) {
            if (!(child instanceof HTMLElement) || getComputedStyle(child).display === "none") continue;
            child.style.setProperty("--reveal-i", String(i++));
        }
    }, [inView]);

    return (
        <div
            ref={ref}
            className={[styles.reveal, variant === "cards" ? styles.cards : null, inView ? styles.in : null, className].filter(Boolean).join(" ")}
        >
            {children}
        </div>
    );
}
