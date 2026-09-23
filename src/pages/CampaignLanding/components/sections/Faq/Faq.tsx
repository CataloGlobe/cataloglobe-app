import { COMPANY } from "@/config/company";
import Section from "@pages/CampaignLanding/components/Section/Section";
import SectionHeader from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { FAQ } from "@pages/CampaignLanding/content/landing";
import styles from "./Faq.module.scss";

/** 9 · FAQ: `<details>` nativi, tutti chiusi, nessun JS. */
export default function Faq() {
    const email = COMPANY.contact.info;

    return (
        <Section tone="white" id="faq">
            <div className={styles.header}>
                <SectionHeader title={FAQ.title} />
            </div>
            <div className={styles.box}>
                {FAQ.items.map((item) => (
                    <details key={item.q} className={styles.item}>
                        <summary className={styles.summary}>
                            <span className={styles.question}>{item.q}</span>
                            <span className={styles.toggle} aria-hidden="true" />
                        </summary>
                        <p className={styles.answer}>{item.a}</p>
                    </details>
                ))}
                <div className={styles.more}>
                    <span className={styles.moreText}>{FAQ.more}</span>
                    <a className={styles.mail} href={`mailto:${email}`}>
                        {email}
                    </a>
                </div>
            </div>
        </Section>
    );
}
