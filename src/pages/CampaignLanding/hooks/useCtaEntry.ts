import { CTA, type CtaEntry, type CtaPlacement } from "@pages/CampaignLanding/content/cta";
import { useLandingVariant } from "@pages/CampaignLanding/variant";

/** Voce della CTA per la variante corrente: serve a chi stampa la nota. */
export function useCtaEntry(placement: CtaPlacement): CtaEntry {
    return CTA[useLandingVariant()][placement];
}
