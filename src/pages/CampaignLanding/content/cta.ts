import type { Variante } from "@pages/CampaignLanding/variant";

/**
 * Unico posto dove vivono etichette e destinazioni delle CTA della landing.
 * Copy provvisorie: da approvare in Passata 1.
 */
export type CtaPlacement =
    | "hero"
    | "bar-top"
    | "bar-bottom"
    | "pricing-base"
    | "pricing-pro"
    | "risk"
    | "final"
    | "sheet"
    | "demo"; // il «Parliamone» sotto i locali demo

export type CtaEntry = { label: string; href: string; note?: string };

const FORM_LABEL = "Parliamone";
const FORM_HREF = "#contatto";
const FORM_NOTE = "Ti richiamiamo entro 24 ore. Nessun impegno.";

const SIGNUP: CtaEntry = { label: "Provalo gratis", href: "/sign-up" };

export const CTA: Record<Variante, Record<CtaPlacement, CtaEntry>> = {
    form: {
        hero: { label: FORM_LABEL, href: FORM_HREF, note: FORM_NOTE },
        "bar-top": { label: FORM_LABEL, href: FORM_HREF },
        "bar-bottom": { label: FORM_LABEL, href: FORM_HREF, note: FORM_NOTE },
        "pricing-base": { label: FORM_LABEL, href: FORM_HREF },
        "pricing-pro": { label: FORM_LABEL, href: FORM_HREF },
        risk: { label: FORM_LABEL, href: FORM_HREF },
        // Submit del form di contatto: `href` resta per completezza del tipo,
        // LandingCta rende un <button type="submit">.
        final: { label: FORM_LABEL, href: FORM_HREF },
        sheet: { label: FORM_LABEL, href: FORM_HREF },
        demo: { label: FORM_LABEL, href: FORM_HREF }
    },
    signup: {
        hero: SIGNUP,
        "bar-top": SIGNUP,
        "bar-bottom": SIGNUP,
        "pricing-base": SIGNUP,
        "pricing-pro": SIGNUP,
        risk: SIGNUP,
        final: SIGNUP,
        sheet: SIGNUP,
        demo: SIGNUP
    }
};
