import { CTA, type CtaPlacement } from "@pages/CampaignLanding/content/cta";
import { useLandingVariant } from "@pages/CampaignLanding/variant";
import styles from "./LandingCta.module.scss";

/** Id del form di contatto a cui si aggancia il submit `final` (variante form). */
export const LANDING_CONTACT_FORM_ID = "landing-contact-form";

type LandingCtaProps = {
    placement: CtaPlacement;
    /**
     * filled = azione piena (hero, barre); outline = bordo neutro su chiaro;
     * ghost = bordo e testo azione, fondo trasparente (card Base); glass = su foto.
     */
    look?: "filled" | "outline" | "ghost" | "glass";
    /**
     * lg = 17px, padding 17/28, raggio cta; md = 14px, padding 10/20, pill;
     * plan = 15–16px, padding 14–15, raggio 12, senza ombra (card dei prezzi).
     */
    size?: "md" | "lg" | "plan";
    /** Larghezza piena (barra inferiore); "mobile" = piena solo sotto il breakpoint desktop (hero). */
    block?: boolean | "mobile";
    /** Stampa la nota sotto la CTA, se il placement ne ha una. */
    showNote?: boolean;
};

/**
 * CTA della landing: etichetta e destinazione vengono da `content/cta.ts`
 * secondo la variante del context. L'agenzia aggancia il pixel a
 * `data-cta` / `data-variante`, non alle classi (hashate dai CSS Modules).
 * Mai `target="_blank"`.
 */
export default function LandingCta({
    placement,
    look = "filled",
    size = "lg",
    block = false,
    showNote = false
}: LandingCtaProps) {
    const variante = useLandingVariant();
    const entry = CTA[variante][placement];

    const blockClass = block === "mobile" ? styles.blockMobile : block ? styles.block : null;
    const className = [styles.cta, styles[size], styles[look], blockClass]
        .filter(Boolean)
        .join(" ");

    // In variante form `final` è il submit del form di contatto; in signup
    // porta alla registrazione come le altre.
    const isSubmit = placement === "final" && variante === "form";

    const control = isSubmit ? (
        <button
            type="submit"
            form={LANDING_CONTACT_FORM_ID}
            className={className}
            data-cta={placement}
            data-variante={variante}
        >
            {entry.label}
        </button>
    ) : (
        <a href={entry.href} className={className} data-cta={placement} data-variante={variante}>
            {entry.label}
        </a>
    );

    if (!showNote || !entry.note) {
        return control;
    }

    return (
        <div className={[styles.wrap, blockClass ? styles.wrapBlock : null].filter(Boolean).join(" ")}>
            {control}
            <p className={styles.note}>{entry.note}</p>
        </div>
    );
}
