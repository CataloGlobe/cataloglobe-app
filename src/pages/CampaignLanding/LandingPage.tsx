import Board from "@pages/CampaignLanding/components/sections/Board/Board";
import Demos from "@pages/CampaignLanding/components/sections/Demos/Demos";
import Frame from "@pages/CampaignLanding/components/Frame/Frame";
import NavBar from "@pages/CampaignLanding/components/NavBar/NavBar";
import Import from "@pages/CampaignLanding/components/sections/Import/Import";
import Hero from "@pages/CampaignLanding/components/sections/Hero/Hero";
import Orders from "@pages/CampaignLanding/components/sections/Orders/Orders";
import SoldOut from "@pages/CampaignLanding/components/sections/SoldOut/SoldOut";
import Supplier from "@pages/CampaignLanding/components/sections/Supplier/Supplier";
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
                <Supplier />
                <SoldOut />
                <Orders />
                <Board />
                <Import />
                <Demos />
            </Frame>
        </LandingVariantContext.Provider>
    );
}
