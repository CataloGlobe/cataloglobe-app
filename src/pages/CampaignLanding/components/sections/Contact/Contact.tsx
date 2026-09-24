import { useState, type FormEvent } from "react";
import { COMPANY } from "@/config/company";
import LandingCta, { LANDING_CONTACT_FORM_ID } from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import Section from "@pages/CampaignLanding/components/Section/Section";
import SectionHeader, { HighlightedText } from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { CONTACT } from "@pages/CampaignLanding/content/landing";
import { useLandingVariant } from "@pages/CampaignLanding/variant";
import styles from "./Contact.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Solo interfaccia: il backend dei contatti è una passata a sé. */
function ContactForm() {
    const [interests, setInterests] = useState<string[]>([]);

    const toggle = (interest: string) =>
        setInterests((current) =>
            current.includes(interest) ? current.filter((i) => i !== interest) : [...current, interest]
        );

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // TODO(lead-backend): invio a edge function + tabella `leads` (passata dedicata,
        // con /security-review). Non riusare join-waitlist: promette una lista d'attesa.
    };

    return (
        <form id={LANDING_CONTACT_FORM_ID} className={styles.form} data-tone="light" onSubmit={handleSubmit}>
            <label className={styles.field}>
                {CONTACT.fields.name}
                <input className={styles.input} type="text" name="nome" autoComplete="given-name" />
            </label>
            <label className={styles.field}>
                {CONTACT.fields.venue}
                <input className={styles.input} type="text" name="locale" autoComplete="organization" />
            </label>
            <label className={styles.field}>
                {CONTACT.fields.phone}
                <input className={styles.input} type="tel" name="telefono" autoComplete="tel" />
            </label>
            <label className={styles.field}>
                {CONTACT.fields.email}
                <input className={styles.input} type="email" name="email" autoComplete="email" />
            </label>

            <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>{CONTACT.interestsLabel}</legend>
                <div className={styles.pills}>
                    {CONTACT.interests.map((interest) => {
                        const on = interests.includes(interest);
                        return (
                            <button
                                key={interest}
                                type="button"
                                className={cx(styles.pill, on && styles.pillOn)}
                                aria-pressed={on}
                                onClick={() => toggle(interest)}
                            >
                                {interest}
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            <label className={styles.consent}>
                <input className={styles.checkbox} type="checkbox" name="privacy" />
                <span>
                    {CONTACT.privacy.before}
                    <a href={CONTACT.privacy.href}>{CONTACT.privacy.link}</a>
                    {CONTACT.privacy.after}
                </span>
            </label>

            <div className={styles.submit}>
                <LandingCta placement="final" look="filled" size="lg" block />
            </div>
        </form>
    );
}

/**
 * 10 · Chiusura. Variante form: testo a sinistra, form a destra. Variante
 * signup (provvisoria): stesso titolo e lede, CTA verso la registrazione e la
 * riga per chi preferisce scrivere, niente form.
 */
export default function Contact() {
    const variante = useLandingVariant();
    const email = COMPANY.contact.info;

    return (
        <Section tone="dark" id="contatto">
            <div className={styles.layout}>
                <div className={styles.text}>
                    <SectionHeader title={<HighlightedText title={CONTACT.title} />} lede={CONTACT.lede} />

                    {variante === "form" ? (
                        <p className={styles.write}>
                            {CONTACT.writeInstead} <a href={`mailto:${email}`}>{email}</a>
                        </p>
                    ) : (
                        <>
                            <div className={styles.signupCta}>
                                <LandingCta placement="final" look="filled" size="lg" block="mobile" />
                            </div>
                            <p className={styles.write}>
                                {CONTACT.talkInstead} <a href={`mailto:${email}`}>{email}</a>
                            </p>
                        </>
                    )}
                </div>

                {variante === "form" && (
                    <div className={styles.formCol}>
                        <ContactForm />
                    </div>
                )}
            </div>
        </Section>
    );
}
