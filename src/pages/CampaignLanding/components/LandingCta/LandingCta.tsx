import { forwardRef } from "react";
import { CTA, type CtaPlacement } from "@pages/CampaignLanding/content/cta";
import { useLandingVariant } from "@pages/CampaignLanding/variant";
import styles from "./LandingCta.module.scss";

/** Id del form di contatto a cui si aggancia il submit `final` (variante form). */
export const LANDING_CONTACT_FORM_ID = "landing-contact-form";

type LandingCtaProps = {
    placement: CtaPlacement;
    /** primary = blu; dark = notte (Pro); soft = carta con bordo (Base). */
    look?: "primary" | "dark" | "soft";
    /**
     * hero = 18/34 (desktop), a tutta larghezza su mobile; start = 17/40,
     * a tutta larghezza su mobile; pill = barra desktop, alta 54; compact =
     * barra mobile, alta 36; plan = schede prezzi; submit = form.
     */
    shape: "hero" | "start" | "pill" | "compact" | "plan" | "submit";
    /** Il pulsante resta nel DOM ma esce dal tab order (barre nascoste). */
    inert?: boolean;
    className?: string;
};

/**
 * CTA della landing: etichetta e destinazione vengono da `content/cta.ts`
 * secondo la variante del context. L'agenzia aggancia il pixel a
 * `data-cta` / `data-variante`, non alle classi (hashate dai CSS Modules).
 * Mai `target="_blank"`.
 */
const LandingCta = forwardRef<HTMLAnchorElement, LandingCtaProps>(function LandingCta(
    { placement, look = "primary", shape, inert = false, className },
    ref
) {
    const variante = useLandingVariant();
    const entry = CTA[variante][placement];
    const cls = [styles.cta, styles[shape], styles[look], className].filter(Boolean).join(" ");

    // In variante form `final` è il submit del form di contatto; in signup
    // porta alla registrazione come le altre.
    if (placement === "final" && variante === "form") {
        return (
            <button type="submit" form={LANDING_CONTACT_FORM_ID} className={cls} data-cta={placement} data-variante={variante}>
                {entry.label}
            </button>
        );
    }

    return (
        <a
            ref={ref}
            href={entry.href}
            className={cls}
            data-cta={placement}
            data-variante={variante}
            tabIndex={inert ? -1 : undefined}
            aria-hidden={inert || undefined}
        >
            {entry.label}
        </a>
    );
});

export default LandingCta;
