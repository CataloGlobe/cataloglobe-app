import SiteLayout from "@layouts/SiteLayout/SiteLayout";
import Text from "@/components/ui/Text/Text";
import styles from "./Home.module.scss";

export default function Home() {
    return (
        <SiteLayout>
            {/* HERO */}
            <section className={styles.hero} aria-labelledby="hero-title">
                <div className={styles.heroContent}>
                    <Text variant="display" as={"h1"} colorVariant="dark">
                        Più recensioni, più clienti, meno stress.
                    </Text>
                    <Text colorVariant="muted">
                        CataloGlobe aiuta ristoratori e professionisti a ottenere più recensioni
                        positive su Google e migliorare la reputazione online — tutto in automatico.
                    </Text>
                    <div className={styles.heroCta}>
                        <a href="/dashboard" className={styles.primaryBtn}>
                            <Text as={"span"} colorVariant="white" weight={600}>
                                Accedi alla Dashboard
                            </Text>
                        </a>
                        <a href="#pricing" className={styles.secondaryBtn}>
                            <Text as={"span"} colorVariant="primary" weight={600}>
                                Scopri i piani
                            </Text>
                        </a>
                    </div>
                </div>

                <div className={styles.heroImage} role="presentation" />
            </section>

            {/* FEATURES */}
            <section className={styles.features} id="features" aria-label="Funzionalità principali">
                <Text variant="title-lg" as={"h2"} colorVariant="dark">
                    Funzionalità che fanno la differenza
                </Text>
                <div className={styles.featuresGrid}>
                    <div className={styles.feature}>
                        <Text variant="title-sm" as={"h3"} colorVariant="dark" weight={600}>
                            QR personalizzati
                        </Text>
                        <Text colorVariant="muted">
                            Fai lasciare recensioni ai clienti in un click, dal tavolo o dallo
                            scontrino.
                        </Text>
                    </div>
                    <div className={styles.feature}>
                        <Text variant="title-sm" as={"h3"} colorVariant="dark" weight={600}>
                            Gestione automatica
                        </Text>
                        <Text colorVariant="muted">
                            Recensioni positive pubblicate online, feedback negativi gestiti in
                            privato.
                        </Text>
                    </div>
                    <div className={styles.feature}>
                        <Text variant="title-sm" as={"h3"} colorVariant="dark" weight={600}>
                            Analisi intelligente
                        </Text>
                        <Text colorVariant="muted">
                            Grafici e statistiche per capire cosa pensano i clienti e come
                            migliorare.
                        </Text>
                    </div>
                </div>
            </section>

            {/* PRICING */}
            <section className={styles.pricing} id="pricing" aria-label="Piani e prezzi">
                <Text variant="title-lg" as={"h2"} colorVariant="dark">
                    Scegli il piano giusto per te
                </Text>
                <div className={styles.pricingGrid}>
                    <article className={styles.plan}>
                        <Text variant="title-sm" as={"h3"} colorVariant="dark" weight={600}>
                            Essential
                        </Text>
                        <Text colorVariant="primary" className={styles.price}>
                            99€/mese
                        </Text>
                        <ul>
                            <Text as={"li"}>Fino a 2 locali</Text>
                            <Text as={"li"}>Dashboard e report base</Text>
                            <Text as={"li"}>QR personalizzati</Text>
                        </ul>
                        <a href="/signup" className={styles.primaryBtn}>
                            <Text as={"span"} colorVariant="white" weight={600}>
                                Inizia ora
                            </Text>
                        </a>
                    </article>

                    <article className={styles.plan}>
                        <Text variant="title-sm" as={"h3"} colorVariant="dark" weight={600}>
                            Growth
                        </Text>
                        <Text colorVariant="primary" className={styles.price}>
                            199€/mese
                        </Text>
                        <ul>
                            <Text as={"li"}>Fino a 5 locali</Text>
                            <Text as={"li"}>Analisi AI recensioni</Text>
                            <Text as={"li"}>Automazioni WhatsApp</Text>
                        </ul>
                        <a href="/signup" className={styles.primaryBtn}>
                            <Text as={"span"} colorVariant="white" weight={600}>
                                Provalo gratis
                            </Text>
                        </a>
                    </article>

                    <article className={styles.plan}>
                        <Text variant="title-sm" as={"h3"} colorVariant="dark" weight={600}>
                            Scale
                        </Text>
                        <Text colorVariant="primary" className={styles.price}>
                            399€/mese
                        </Text>
                        <ul>
                            <Text as={"li"}>Locali illimitati</Text>
                            <Text as={"li"}>AI Reputation Assistant</Text>
                            <Text as={"li"}>Supporto premium</Text>
                        </ul>
                        <a href="/signup" className={styles.primaryBtn}>
                            <Text as={"span"} colorVariant="white" weight={600}>
                                Contattaci
                            </Text>
                        </a>
                    </article>
                </div>
            </section>
        </SiteLayout>
    );
}
