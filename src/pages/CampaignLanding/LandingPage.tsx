import { useEffect } from "react";
import { captureAttribution } from "@pages/CampaignLanding/attribution";
import CookieBanner from "@pages/CampaignLanding/components/CookieBanner/CookieBanner";
import Frame from "@pages/CampaignLanding/components/Frame/Frame";
import NavBar from "@pages/CampaignLanding/components/NavBar/NavBar";
import Board from "@pages/CampaignLanding/components/sections/Board/Board";
import Contact from "@pages/CampaignLanding/components/sections/Contact/Contact";
import Demos from "@pages/CampaignLanding/components/sections/Demos/Demos";
import Faq from "@pages/CampaignLanding/components/sections/Faq/Faq";
import Footer from "@pages/CampaignLanding/components/sections/Footer/Footer";
import styles from "./LandingPage.module.scss";
import Hero from "@pages/CampaignLanding/components/sections/Hero/Hero";
import Import from "@pages/CampaignLanding/components/sections/Import/Import";
import Orders from "@pages/CampaignLanding/components/sections/Orders/Orders";
import Pricing from "@pages/CampaignLanding/components/sections/Pricing/Pricing";
import SoldOut from "@pages/CampaignLanding/components/sections/SoldOut/SoldOut";
import Start from "@pages/CampaignLanding/components/sections/Start/Start";
import Supplier from "@pages/CampaignLanding/components/sections/Supplier/Supplier";
import { useVariantHead } from "@pages/CampaignLanding/hooks/useVariantHead";
import { LandingVariantContext, type Variante } from "@pages/CampaignLanding/variant";

type LandingPageProps = {
    variante: Variante;
};

/** Landing di campagna — Versione C. */
export default function LandingPage({ variante }: LandingPageProps) {
    // UTM e provenienza all'arrivo, per il form contatti in fondo.
    useEffect(captureAttribution, []);
    // /b: canonical su / e noindex.
    useVariantHead(variante);

    return (
        <LandingVariantContext.Provider value={variante}>
            <Frame
                fixed={
                    <>
                        <NavBar />
                        <CookieBanner />
                    </>
                }
            >
                <Hero />
                <Supplier />
                <SoldOut />
                <Orders />
                <Board />
                <Import />
                <Demos />
                <Pricing />
                <Start />
                <Faq />
                <div className={styles.finale}>
                    <Contact />
                    <Footer />
                </div>
            </Frame>
        </LandingVariantContext.Provider>
    );
}
