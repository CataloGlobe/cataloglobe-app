import { useState } from "react";
import Section from "@pages/CampaignLanding/components/Section/Section";
import SectionHeader from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { FEATURES, type FeatureKey } from "@pages/CampaignLanding/content/landing";
import FeaturePanel from "./FeaturePanels";
import styles from "./Features.module.scss";

const PANEL_ID = "landing-features-panel";

/**
 * 5 · Le nove schede in una carta sola. Statica (Passata 1): la voce cambia al
 * tocco, senza transizioni; ogni pannello è fermo nello stato che racconta la
 * scena (ordine già stampato, prenotazione già in agenda).
 */
export default function Features() {
    // Riposo: la prima voce aperta.
    const [active, setActive] = useState<FeatureKey>("orders");

    return (
        <Section tone="paper" id="funzioni">
            <SectionHeader title={FEATURES.title} lede={FEATURES.lede} />

            <div className={styles.board}>
                <nav className={styles.nav} aria-label={FEATURES.title}>
                    {FEATURES.groups.map((group) => (
                        <div key={group.label} className={styles.group}>
                            <p className={styles.groupLabel}>{group.label}</p>
                            <div className={styles.items}>
                                {group.items.map((key) => (
                                    <button
                                        key={key}
                                        type="button"
                                        className={key === active ? `${styles.item} ${styles.itemOn}` : styles.item}
                                        aria-pressed={key === active}
                                        aria-controls={PANEL_ID}
                                        onClick={() => setActive(key)}
                                    >
                                        {FEATURES.labels[key]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div id={PANEL_ID} className={styles.panel} aria-live="polite">
                    <FeaturePanel feature={active} />
                </div>
            </div>
        </Section>
    );
}
