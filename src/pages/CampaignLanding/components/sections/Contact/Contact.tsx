import { useState, type FormEvent } from "react";
import { COMPANY } from "@/config/company";
import LandingCta, { LANDING_CONTACT_FORM_ID } from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, UnderlinedText } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { CONTACT } from "@pages/CampaignLanding/content/landing";
import { useLandingVariant } from "@pages/CampaignLanding/variant";
import styles from "./Contact.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Solo interfaccia: il backend dei contatti è una passata a sé (SPEC §9.6). */
function ContactForm() {
    const [interests, setInterests] = useState<string[]>([]);

    const toggle = (interest: string) =>
        setInterests((current) => (current.includes(interest) ? current.filter((i) => i !== interest) : [...current, interest]));

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // TODO(lead-backend): invio a edge function + tabella `leads` (passata dedicata,
        // con /security-review). Non riusare join-waitlist: promette una lista d'attesa.
    };

    return (
        <form id={LANDING_CONTACT_FORM_ID} className={styles.form} data-tone="light" onSubmit={handleSubmit}>
            <div className={styles.fields}>
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
                    {CONTACT.fields.email} <span className={styles.optional}>{CONTACT.fields.optional}</span>
                    <input className={styles.input} type="email" name="email" autoComplete="email" />
                </label>
            </div>

            <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>{CONTACT.interestsLabel}</legend>
                <div className={styles.pills}>
                    {CONTACT.interests.map((interest) => {
                        const on = interests.includes(interest);
                        return (
                            <button key={interest} type="button" className={cx(styles.pill, on && styles.pillOn)} aria-pressed={on} onClick={() => toggle(interest)}>
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

            <LandingCta placement="final" shape="submit" />
        </form>
    );
}

/**
 * 11 · Chiusura. Variante form: testo a sinistra, form a destra (sotto su
 * mobile). Variante signup: stesso titolo e lede, CTA verso la registrazione
 * e la riga per chi preferisce scrivere, niente form.
 */
export default function Contact() {
    const variante = useLandingVariant();
    const email = COMPANY.contact.info;

    return (
        <Section tone="dark" id="contatto" space="form" labelledBy="landing-contact-title">
            <div className={styles.grid}>
                <Reveal>
                    <HandNote size="form">{CONTACT.note}</HandNote>
                    <h2 id="landing-contact-title" className={styles.title}>
                        <UnderlinedText title={CONTACT.title} className={styles.titleHl} />
                    </h2>
                    <p className={styles.lede}>{CONTACT.lede}</p>
                    {variante === "form" ? (
                        <p className={cx(styles.write, styles.writeDesktop)}>
                            {CONTACT.writeInstead} <a href={`mailto:${email}`}>{email}</a>
                        </p>
                    ) : (
                        <>
                            <div className={styles.signupCta}>
                                <LandingCta placement="final" shape="start" />
                            </div>
                            <p className={styles.write}>
                                {CONTACT.talkInstead} <a href={`mailto:${email}`}>{email}</a>
                            </p>
                        </>
                    )}
                </Reveal>

                {variante === "form" && (
                    <Reveal className={styles.formCol}>
                        <ContactForm />
                        <p className={cx(styles.write, styles.writeMobile)}>
                            {CONTACT.writeInstead} <a href={`mailto:${email}`}>{email}</a>
                        </p>
                    </Reveal>
                )}
            </div>
        </Section>
    );
}
