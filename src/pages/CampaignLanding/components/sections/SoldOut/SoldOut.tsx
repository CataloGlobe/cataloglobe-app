import { useEffect, useRef, useState } from "react";
import Problem from "@pages/CampaignLanding/components/Problem/Problem";
import { MenuRow, PhoneQrCard } from "@pages/CampaignLanding/components/kit/Kit";
import { SOLD_OUT } from "@pages/CampaignLanding/content/landing";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import { useVisible } from "@pages/CampaignLanding/hooks/useVisible";
import styles from "./SoldOut.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Dall'ingresso nello schermo: l'interruttore scatta a 500 ms, il menù del cliente 400 ms dopo (come il fornitore). */
const PHONE_MS = 500;
const CUSTOMER_MS = 900;

/**
 * 3 · Un piatto è finito. Il branzino parte «Disponibile»; all'ingresso nello
 * schermo l'interruttore passa su «Esaurito» e nel menù del cliente la riga
 * diventa «Non disponibile». Poi l'interruttore è libero. Uscito del tutto
 * dallo schermo torna «Disponibile» e al rientro rifà il passaggio, anche se
 * l'interruttore era stato toccato. Con `prefers-reduced-motion` parte già
 * esaurito.
 */
export default function SoldOut() {
    const ref = useRef<HTMLDivElement>(null);
    /** Stato sul telefono e quello già arrivato al menù del cliente. */
    const [phone, setPhone] = useState(false);
    const [customer, setCustomer] = useState(false);
    const [played, setPlayed] = useState(false);
    const [touched, setTouched] = useState(false);
    const visible = useVisible(ref, 0.4, () => {
        setTouched(false);
        setPhone(false);
        setCustomer(false);
        setPlayed(false);
    });
    const reduced = useReducedMotion();

    useEffect(() => {
        if (!visible || reduced || played) return;
        const t1 = window.setTimeout(() => setPhone(true), PHONE_MS);
        const t2 = window.setTimeout(() => {
            setCustomer(true);
            setPlayed(true);
        }, CUSTOMER_MS);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [visible, reduced, played]);

    // Con reduced-motion lo stato di partenza è quello finale.
    const still = reduced && !touched;
    const soldOut = still || phone;
    const shownOff = still || customer;

    const toggle = () => {
        setPhone(!soldOut);
        setCustomer(!soldOut);
        setPlayed(true);
        setTouched(true);
    };

    return (
        <Problem
            tone="lilla"
            copy={SOLD_OUT.copy}
            visualSide="left"
            visual={
                <>
                    <p className={styles.hint}>{SOLD_OUT.hint}</p>
                    <div ref={ref}>
                        <PhoneQrCard
                            dish={SOLD_OUT.dish}
                            paper="phone"
                            control={
                                <>
                                    {/* Le due parole sempre nella stessa cella, allineate a destra: la larghezza non cambia e la parola non salta. */}
                                    <span className={styles.state} aria-hidden="true">
                                        <span className={cx(styles.word, !soldOut && styles.wordOn)}>{SOLD_OUT.available}</span>
                                        <span className={cx(styles.word, styles.wordOff, soldOut && styles.wordOn)}>{SOLD_OUT.soldOut}</span>
                                    </span>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={soldOut}
                                        aria-label={SOLD_OUT.switchLabel}
                                        className={cx(styles.switch, soldOut && styles.switchOn)}
                                        onClick={toggle}
                                    >
                                        <span className={styles.knob} />
                                    </button>
                                </>
                            }
                        >
                            {SOLD_OUT.rows.map((row) => {
                                const off = Boolean(row.toggled) && shownOff;
                                return (
                                    <MenuRow
                                        key={row.name}
                                        name={row.name}
                                        price={row.price}
                                        off={off}
                                        badge={off ? SOLD_OUT.unavailable : undefined}
                                    />
                                );
                            })}
                        </PhoneQrCard>
                    </div>
                </>
            }
        />
    );
}
