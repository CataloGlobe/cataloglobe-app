import { useState } from "react";
import Problem from "@pages/CampaignLanding/components/Problem/Problem";
import { Kicker, MenuRow } from "@pages/CampaignLanding/components/kit/Kit";
import { SOLD_OUT } from "@pages/CampaignLanding/content/landing";
import styles from "./SoldOut.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * 3 · Un piatto è finito. L'interruttore parte su «Esaurito» (l'azione del
 * ristoratore); nel menù del cliente la riga diventa «Non disponibile».
 */
export default function SoldOut() {
    const [soldOut, setSoldOut] = useState(true);

    return (
        <Problem
            tone="lilla"
            copy={SOLD_OUT.copy}
            visualSide="left"
            visual={
                <>
                    <div className={styles.card}>
                        <div className={styles.phone}>
                            <Kicker>{SOLD_OUT.phoneLabel}</Kicker>
                            <div className={styles.control}>
                                <span className={styles.dish}>{SOLD_OUT.dish}</span>
                                <span className={cx(styles.state, soldOut && styles.stateOff)} aria-hidden="true">
                                    {soldOut ? SOLD_OUT.soldOut : SOLD_OUT.available}
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={soldOut}
                                    aria-label={SOLD_OUT.switchLabel}
                                    className={cx(styles.switch, soldOut && styles.switchOn)}
                                    onClick={() => setSoldOut((v) => !v)}
                                >
                                    <span className={styles.knob} />
                                </button>
                            </div>
                        </div>
                        <div className={styles.customer} aria-live="polite">
                            <Kicker className={styles.customerLabel}>{SOLD_OUT.customerLabel}</Kicker>
                            {SOLD_OUT.rows.map((row) => {
                                const off = Boolean(row.toggled) && soldOut;
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
                        </div>
                    </div>
                    <p className={styles.hint}>{SOLD_OUT.hint}</p>
                </>
            }
        />
    );
}
