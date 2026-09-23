import type { FormEvent } from "react";
import Frame from "@pages/CampaignLanding/components/Frame/Frame";
import LandingCta, {
    LANDING_CONTACT_FORM_ID
} from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import Section from "@pages/CampaignLanding/components/Section/Section";
import SectionHeader, {
    Highlight
} from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { LandingVariantContext, type Variante } from "@pages/CampaignLanding/variant";
import styles from "./LandingPage.module.scss";

type LandingPageProps = {
    variante: Variante;
};

/**
 * Landing di campagna — Passata 0: pagina di smoke test delle fondamenta
 * (cornice, toni di sezione, CTA per variante). Nessun contenuto vero.
 */
export default function LandingPage({ variante }: LandingPageProps) {
    // Il form vero arriva in Passata 1: qui il submit non deve navigare.
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
    };

    return (
        <LandingVariantContext.Provider value={variante}>
            <Frame>
                <Section tone="paper">
                    <div className={styles.stack}>
                        <SectionHeader
                            level={1}
                            eyebrow="Pagina di prova"
                            title={
                                <>
                                    Titolo di prova con una <Highlight>parola</Highlight> evidenziata
                                </>
                            }
                            lede="Testo introduttivo segnaposto: serve solo a verificare font, colori e ritmo."
                            maxWidth={740}
                        />
                        <LandingCta placement="hero" look="filled" size="lg" block showNote />
                    </div>
                </Section>

                <Section tone="white">
                    <div className={styles.stack}>
                        <SectionHeader
                            title="Sezione bianca di prova"
                            lede="Tono alternato per le sezioni chiare."
                        />
                        <div className={styles.row}>
                            <LandingCta placement="pricing-base" look="outline" size="md" />
                        </div>
                    </div>
                </Section>

                <Section tone="dark" id="contatto">
                    <div className={styles.stack}>
                        <SectionHeader
                            eyebrow="Contatto"
                            title={
                                <>
                                    Sezione scura di <Highlight>prova</Highlight>
                                </>
                            }
                            lede="I token di testo si ridefiniscono per scope sul tono scuro."
                        />
                        <form
                            id={LANDING_CONTACT_FORM_ID}
                            className={styles.form}
                            onSubmit={handleSubmit}
                        />
                        <LandingCta placement="final" look="filled" size="lg" />
                    </div>
                </Section>

                <Section as="footer" tone="dark">
                    <p className={styles.body}>Footer di prova.</p>
                </Section>
            </Frame>
        </LandingVariantContext.Provider>
    );
}
