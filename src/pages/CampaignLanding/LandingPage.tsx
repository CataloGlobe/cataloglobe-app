import Frame from "@pages/CampaignLanding/components/Frame/Frame";
import Analytics from "@pages/CampaignLanding/components/sections/Analytics/Analytics";
import Compare from "@pages/CampaignLanding/components/sections/Compare/Compare";
import Hero from "@pages/CampaignLanding/components/sections/Hero/Hero";
import Import from "@pages/CampaignLanding/components/sections/Import/Import";
import { LandingVariantContext, type Variante } from "@pages/CampaignLanding/variant";

type LandingPageProps = {
    variante: Variante;
};

/**
 * Landing di campagna — Passata 1: pagina statica, nessuna animazione.
 * Step A: sezioni 1–4. Le sezioni 5–11 arrivano nello Step B.
 */
export default function LandingPage({ variante }: LandingPageProps) {
    return (
        <LandingVariantContext.Provider value={variante}>
            <Frame>
                <Hero />
                <Compare />
                <Import />
                <Analytics />
            </Frame>
        </LandingVariantContext.Provider>
    );
}
