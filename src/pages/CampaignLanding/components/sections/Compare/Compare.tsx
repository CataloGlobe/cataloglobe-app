import ComparePanel from "@pages/CampaignLanding/components/ComparePanel/ComparePanel";
import Section from "@pages/CampaignLanding/components/Section/Section";
import SectionHeader from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { COMPARE } from "@pages/CampaignLanding/content/landing";
import styles from "./Compare.module.scss";

/** 2 · Carta o PDF: due pannelli di confronto, prima e con CataloGlobe. */
export default function Compare() {
    return (
        <Section tone="paper">
            <SectionHeader title={COMPARE.title} lede={COMPARE.lede} />
            <div className={styles.panels}>
                <ComparePanel tone="before" label={COMPARE.before.label} items={COMPARE.before.items} />
                <ComparePanel tone="after" label={COMPARE.after.label} items={COMPARE.after.items} />
            </div>
        </Section>
    );
}
