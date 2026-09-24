import Frame from "@pages/CampaignLanding/components/Frame/Frame";
import Analytics from "@pages/CampaignLanding/components/sections/Analytics/Analytics";
import Compare from "@pages/CampaignLanding/components/sections/Compare/Compare";
import Contact from "@pages/CampaignLanding/components/sections/Contact/Contact";
import Demos from "@pages/CampaignLanding/components/sections/Demos/Demos";
import Faq from "@pages/CampaignLanding/components/sections/Faq/Faq";
import Features from "@pages/CampaignLanding/components/sections/Features/Features";
import Footer from "@pages/CampaignLanding/components/sections/Footer/Footer";
import Hero from "@pages/CampaignLanding/components/sections/Hero/Hero";
import Import from "@pages/CampaignLanding/components/sections/Import/Import";
import Pricing from "@pages/CampaignLanding/components/sections/Pricing/Pricing";
import Risk from "@pages/CampaignLanding/components/sections/Risk/Risk";
import { LandingVariantContext, type Variante } from "@pages/CampaignLanding/variant";

type LandingPageProps = {
    variante: Variante;
};

/** Landing di campagna — Passata 1: pagina intera, statica, nessuna animazione né backend. */
export default function LandingPage({ variante }: LandingPageProps) {
    return (
        <LandingVariantContext.Provider value={variante}>
            <Frame>
                <Hero />
                <Compare />
                <Import />
                <Analytics />
                <Features />
                <Demos />
                <Pricing />
                <Risk />
                <Faq />
                <Contact />
                <Footer />
            </Frame>
        </LandingVariantContext.Provider>
    );
}
