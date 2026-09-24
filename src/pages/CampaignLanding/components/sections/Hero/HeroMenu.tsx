import { HERO } from "@pages/CampaignLanding/content/landing";
import styles from "./HeroMenu.module.scss";

type HeroMenuProps = {
    fascia: number;
    onSelect: (index: number) => void;
};

const CURSOR_CLASS = ["at0", "at1", "at2"] as const;

/**
 * Carta menù dell'hero con il selettore delle fasce. Statica (Passata 1):
 * la fascia cambia al tocco, senza transizioni; il ciclo automatico e il
 * cross-fade arrivano in Passata 2.
 */
export default function HeroMenu({ fascia, onSelect }: HeroMenuProps) {
    const { menu } = HERO;
    const active = menu.fasce[fascia];

    return (
        <div className={styles.menu}>
            <div className={styles.card} data-tone="light">
                <div className={styles.bar} aria-hidden="true">
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.url}>{menu.url}</span>
                </div>

                <div className={styles.body}>
                    <div className={styles.head}>
                        <span className={styles.title}>{active.menuTitle}</span>
                        <span className={styles.live}>
                            <span className={styles.liveDot} aria-hidden="true" />
                            {menu.liveBadge}
                        </span>
                    </div>

                    <ul className={styles.dishes}>
                        {active.dishes.map((dish) => (
                            <li key={dish.name} className={styles.dish}>
                                <span className={styles.dishName}>{dish.name}</span>
                                <span className={styles.leader} aria-hidden="true" />
                                <span className={styles.dishPrice}>{dish.price}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className={styles.fasce} role="group" aria-label={menu.fasceLabel} data-tone="light">
                <span className={`${styles.cursor} ${styles[CURSOR_CLASS[fascia]]}`} aria-hidden="true" />
                {menu.fasce.map((f, i) => (
                    <button
                        key={f.label}
                        type="button"
                        className={i === fascia ? `${styles.fascia} ${styles.fasciaOn}` : styles.fascia}
                        aria-pressed={i === fascia}
                        onClick={() => onSelect(i)}
                    >
                        <span className={styles.fasciaLabel}>{f.label}</span>
                        <span className={styles.fasciaHours}>{f.hours}</span>
                    </button>
                ))}
            </div>

            <p className={styles.caption}>{menu.caption}</p>
        </div>
    );
}
