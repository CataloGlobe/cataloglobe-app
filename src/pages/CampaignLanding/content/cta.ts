import type { Variante } from "@pages/CampaignLanding/variant";

/**
 * Unico posto dove vivono etichette, destinazioni e note delle CTA della landing.
 */
export type CtaPlacement =
    | "hero"
    | "bar-top" // CTA a destra nella barra desktop, dopo l'hero
    | "bar-mobile" // pulsante della barra compatta in alto su mobile, dopo l'hero
    | "pricing-base"
    | "pricing-pro"
    | "start" // sezione «Cosa ti costa provarlo»
    | "final"; // submit del form di contatto (variante form)

/** `note`: righe sotto (o accanto a) il pulsante; una riga per elemento. */
export type CtaEntry = { label: string; href: string; note?: string[] };

const FORM_LABEL = "Fatti richiamare";
const FORM_HREF = "#contatto";
const CALLBACK = "Ti richiamiamo entro 24 ore.";
const PRICE_NOTE = "Da 39 € al mese, 30 giorni di prova.";

const SIGNUP: CtaEntry = { label: "Provalo gratis", href: "/sign-up" };

export const CTA: Record<Variante, Record<CtaPlacement, CtaEntry>> = {
    form: {
        hero: { label: FORM_LABEL, href: FORM_HREF, note: [CALLBACK, PRICE_NOTE] },
        "bar-top": { label: FORM_LABEL, href: FORM_HREF },
        "bar-mobile": { label: FORM_LABEL, href: FORM_HREF },
        "pricing-base": { label: FORM_LABEL, href: FORM_HREF },
        "pricing-pro": { label: FORM_LABEL, href: FORM_HREF },
        start: { label: FORM_LABEL, href: FORM_HREF, note: [`${CALLBACK} Nessun impegno.`] },
        // Submit del form di contatto: `href` resta per completezza del tipo,
        // LandingCta rende un <button type="submit">.
        final: { label: FORM_LABEL, href: FORM_HREF }
    },
    signup: {
        hero: { ...SIGNUP, note: [PRICE_NOTE] },
        "bar-top": SIGNUP,
        "bar-mobile": SIGNUP,
        "pricing-base": SIGNUP,
        "pricing-pro": SIGNUP,
        start: SIGNUP,
        final: SIGNUP
    }
};
