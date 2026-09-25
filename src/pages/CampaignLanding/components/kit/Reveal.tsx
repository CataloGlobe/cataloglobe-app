import { useRef, type ReactNode } from "react";
import { useInView } from "@pages/CampaignLanding/hooks/useInView";
import styles from "./Reveal.module.scss";

type RevealProps = {
    className?: string;
    children: ReactNode;
};

/**
 * Ingresso di un blocco allo scroll (SPEC §8): i figli diretti salgono di 16 px
 * in dissolvenza, 60 ms l'uno dall'altro, quando il blocco entra per il 15%.
 * Una volta sola. Con `prefers-reduced-motion` niente ingresso (solo CSS).
 */
export default function Reveal({ className, children }: RevealProps) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, 0.15);

    return (
        <div ref={ref} className={[styles.reveal, inView ? styles.in : null, className].filter(Boolean).join(" ")}>
            {children}
        </div>
    );
}
