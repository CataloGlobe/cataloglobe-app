import { useEffect, useRef, useState } from "react";
import Problem from "@pages/CampaignLanding/components/Problem/Problem";
import { MenuRow, PhoneQrCard } from "@pages/CampaignLanding/components/kit/Kit";
import { SUPPLIER } from "@pages/CampaignLanding/content/landing";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import { useVisible } from "@pages/CampaignLanding/hooks/useVisible";
import styles from "./Supplier.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Dall'ingresso nello schermo: il campo prezzo cambia a 500 ms, il menù del cliente 400 ms dopo. */
const PHONE_MS = 500;
const CUSTOMER_MS = 900;

const euro = (n: number) => `${n} €`;

/**
 * 2 · Il fornitore aumenta: la scheda telefono → menù del cliente (come
 * «Un piatto è finito»). All'ingresso nello schermo la tagliata passa da 22 a
 * 23 € sul telefono e poi nel menù del cliente; da lì il campo è uno stepper
 * (18–28 €) e il menù del cliente lo segue subito. Uscita del tutto dallo
 * schermo torna a 22 € e al rientro rifà il passaggio, se nessuno ha toccato
 * lo stepper. Con `prefers-reduced-motion` parte già da 23 €.
 */
export default function Supplier() {
    const { card, loss } = SUPPLIER;
    const ref = useRef<HTMLDivElement>(null);
    /** Prezzo sul telefono e quello già arrivato al menù del cliente. */
    const [phone, setPhone] = useState(card.base);
    const [customer, setCustomer] = useState(card.base);
    const [played, setPlayed] = useState(false);
    const [touched, setTouched] = useState(false);
    const visible = useVisible(ref, 0.4, () => {
        if (touched) return;
        setPhone(card.base);
        setCustomer(card.base);
        setPlayed(false);
    });
    const reduced = useReducedMotion();

    useEffect(() => {
        if (!visible || reduced || played) return;
        const t1 = window.setTimeout(() => setPhone(card.raised), PHONE_MS);
        const t2 = window.setTimeout(() => {
            setCustomer(card.raised);
            setPlayed(true);
        }, CUSTOMER_MS);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [visible, reduced, played, card.raised]);

    // Con reduced-motion lo stato di partenza è quello finale.
    const still = reduced && !touched;
    const phoneValue = still ? card.raised : phone;
    const customerValue = still ? card.raised : customer;

    const step = (delta: number) => {
        const next = Math.min(card.max, Math.max(card.min, phoneValue + delta));
        setPhone(next);
        setCustomer(next);
        setPlayed(true);
        setTouched(true);
    };

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
                                <span className={styles.stepper}>
                                    <button
                                        type="button"
                                        className={styles.stepBtn}
                                        aria-label={card.decrease}
                                        disabled={phoneValue <= card.min}
                                        onClick={() => step(-1)}
                                    >
                                        −
                                    </button>
                                    <output className={cx(styles.stepValue, phoneValue !== card.base && styles.stepValueOn)}>
                                        {euro(phoneValue)}
                                    </output>
                                    <button
                                        type="button"
                                        className={styles.stepBtn}
                                        aria-label={card.increase}
                                        disabled={phoneValue >= card.max}
                                        onClick={() => step(1)}
                                    >
                                        +
                                    </button>
                                </span>
                            }
                        >
                            {card.rows.map((row) => {
                                const changed = Boolean(row.raised) && customerValue !== card.base;
                                return (
                                    <MenuRow
                                        // Chiave nuova a ogni prezzo: il lampo riparte.
                                        key={row.raised ? `${row.name}-${customerValue}` : row.name}
                                        name={row.name}
                                        price={changed ? euro(customerValue) : row.price}
                                        oldPrice={changed ? row.price : undefined}
                                        className={cx(changed && styles.rowUp)}
                                    />
                                );
                            })}
                        </PhoneQrCard>
                    </div>
                    <p className={styles.hint}>{SUPPLIER.hint}</p>
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
