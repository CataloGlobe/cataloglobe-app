import { useEffect, useRef, useState } from "react";
import Problem from "@pages/CampaignLanding/components/Problem/Problem";
import { MenuRow, PhoneQrCard } from "@pages/CampaignLanding/components/kit/Kit";
import { SUPPLIER } from "@pages/CampaignLanding/content/landing";
import { useInView } from "@pages/CampaignLanding/hooks/useInView";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import styles from "./Supplier.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Dall'ingresso nello schermo: il campo prezzo cambia a 500 ms, il menù del cliente 400 ms dopo. */
const PHONE_MS = 500;
const CUSTOMER_MS = 900;

/**
 * 2 · Il fornitore aumenta: la scheda telefono → menù del cliente (come
 * «Un piatto è finito»). All'ingresso nello schermo, una volta, la tagliata
 * passa da 22 a 23 € sul telefono e poi nel menù del cliente. Con
 * `prefers-reduced-motion` è già a 23 €.
 */
export default function Supplier() {
    const { card, loss } = SUPPLIER;
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, 0.4);
    const reduced = useReducedMotion();
    const [step, setStep] = useState(0);

    useEffect(() => {
        if (!inView || reduced) return;
        const t1 = window.setTimeout(() => setStep(1), PHONE_MS);
        const t2 = window.setTimeout(() => setStep(2), CUSTOMER_MS);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [inView, reduced]);

    const shown = reduced ? 2 : step;

    return (
        <Problem
            tone="white"
            copy={SUPPLIER.copy}
            visualSide="right"
            visual={
                <>
                    <div ref={ref}>
                        <PhoneQrCard
                            dish={card.dish}
                            paper="customer"
                            control={
                                <span className={styles.stepper} aria-hidden="true">
                                    <span className={styles.stepBtn}>−</span>
                                    <span className={cx(styles.stepValue, shown >= 1 && styles.stepValueOn)}>
                                        {shown >= 1 ? card.to : card.from}
                                    </span>
                                    <span className={styles.stepBtn}>+</span>
                                </span>
                            }
                        >
                            {card.rows.map((row) => {
                                const up = Boolean(row.raised) && shown >= 2;
                                return (
                                    <MenuRow
                                        key={row.name}
                                        name={row.name}
                                        price={up ? card.to : row.price}
                                        oldPrice={up ? row.price : undefined}
                                        className={cx(up && styles.rowUp)}
                                    />
                                );
                            })}
                        </PhoneQrCard>
                    </div>
                    <div className={styles.loss}>
                        <span className={styles.amount}>{loss.amount}</span>
                        <span className={styles.lossText}>
                            {loss.text}
                            <span className={styles.math}>{loss.math}</span>
                        </span>
                    </div>
                </>
            }
        />
    );
}
