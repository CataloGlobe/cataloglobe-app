import Problem from "@pages/CampaignLanding/components/Problem/Problem";
import { MenuRow } from "@pages/CampaignLanding/components/kit/Kit";
import { SUPPLIER } from "@pages/CampaignLanding/content/landing";
import styles from "./Supplier.module.scss";

/** 2 · Il fornitore aumenta: scheda «Secondi» con il prezzo alzato e il conto dei 500 €. */
export default function Supplier() {
    const { card, loss } = SUPPLIER;
    return (
        <Problem
            tone="white"
            copy={SUPPLIER.copy}
            visualSide="right"
            visual={
                <>
                    <div className={styles.card}>
                        <p className={styles.cardTitle}>{card.title}</p>
                        {card.dishes.map((d) => (
                            <MenuRow key={d.name} name={d.name} price={d.price} oldPrice={d.oldPrice} />
                        ))}
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
