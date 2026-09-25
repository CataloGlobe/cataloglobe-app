import Frame from "@pages/CampaignLanding/components/Frame/Frame";
import NavBar from "@pages/CampaignLanding/components/NavBar/NavBar";
import Hero from "@pages/CampaignLanding/components/sections/Hero/Hero";
import { LandingVariantContext, type Variante } from "@pages/CampaignLanding/variant";

type LandingPageProps = {
    variante: Variante;
};

/** Landing di campagna — Versione C (docs/landing/versione-c/SPEC.md). */
export default function LandingPage({ variante }: LandingPageProps) {
    return (
        <LandingVariantContext.Provider value={variante}>
            <Frame fixed={<NavBar />}>
                <Hero />
            </Frame>
        </LandingVariantContext.Provider>
    );
}
