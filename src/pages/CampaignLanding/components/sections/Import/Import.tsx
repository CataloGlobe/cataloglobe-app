import Section from "@pages/CampaignLanding/components/Section/Section";
import SectionHeader from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { IMPORT } from "@pages/CampaignLanding/content/landing";
import styles from "./Import.module.scss";

// Riposo: passo 3 «Revisione», i primi due fatti.
const CURRENT_STEP = 2;

function Check({ className }: { className: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

/** 3 · Import da foto: la card dell'import AI ferma sul passo di revisione. */
export default function Import() {
    const { card } = IMPORT;

    return (
        <Section tone="white">
            <div className={styles.split}>
                <div className={styles.text}>
                    <SectionHeader title={IMPORT.title} lede={IMPORT.lede} />
                </div>

                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <svg className={styles.sparkle} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M9 3.5 10.4 7.6 14.5 9 10.4 10.4 9 14.5 7.6 10.4 3.5 9 7.6 7.6z" />
                            <path d="M17.5 13.5 18.3 15.7 20.5 16.5 18.3 17.3 17.5 19.5 16.7 17.3 14.5 16.5 16.7 15.7z" />
                        </svg>
                        <span className={styles.cardTitle}>{card.title}</span>
                    </div>

                    <div className={styles.cardBody}>
                        <ol className={styles.steps}>
                            {card.steps.map((step, i) => {
                                const done = i < CURRENT_STEP;
                                const current = i === CURRENT_STEP;
                                return (
                                    <li
                                        key={step}
                                        className={styles.step}
                                        aria-current={current ? "step" : undefined}
                                    >
                                        <span className={current ? `${styles.pin} ${styles.pinNow}` : styles.pin}>
                                            {done && <Check className={styles.pinCheck} />}
                                            {current && <span className={styles.pinDot} />}
                                        </span>
                                        {step}
                                    </li>
                                );
                            })}
                        </ol>

                        <div className={styles.result}>
                            <ul className={styles.rows}>
                                {card.rows.map((row) => (
                                    <li key={row.name} className={styles.row}>
                                        <span className={styles.tick}>
                                            <Check className={styles.tickIcon} />
                                        </span>
                                        <span className={styles.rowName}>{row.name}</span>
                                        <span className={styles.rowCat}>{row.category}</span>
                                        <span className={styles.rowPrice}>{row.price}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className={styles.footer}>{card.footer}</p>
                        </div>
                    </div>
                </div>
            </div>
        </Section>
    );
}
