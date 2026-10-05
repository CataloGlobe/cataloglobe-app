import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { COMPANY } from "@/config/company";
import { validateLead, type LeadField, type LeadFieldError, type LeadInterest } from "@/utils/leadValidation";
import { normalizePhoneToE164 } from "@/utils/phoneNormalize";
import { getAttribution } from "@pages/CampaignLanding/attribution";
import LandingCta, { LANDING_CONTACT_FORM_ID } from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, UnderlinedText } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { CONTACT } from "@pages/CampaignLanding/content/landing";
import { useLandingVariant } from "@pages/CampaignLanding/variant";
import styles from "./Contact.module.scss";
import { leadSuccessCopy } from "./successCopy";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

// Il client Supabase serve solo all'invio: si scarica quando il form prende il
// fuoco, non con la pagina. Un download fallito si riprova al tentativo dopo.
type LeadsModule = typeof import("@/services/supabase/leads");
let leadsModule: Promise<LeadsModule> | null = null;
const loadLeads = () =>
    (leadsModule ??= import("@/services/supabase/leads").catch((err: unknown) => {
        leadsModule = null;
        throw err;
    }));

type Values = { name: string; venueName: string; phone: string; email: string };
type Errors = Partial<Record<LeadField, LeadFieldError>>;
type Status = "idle" | "sending" | "success" | "error";

const EMPTY: Values = { name: "", venueName: "", phone: "", email: "" };
const FIELDS: { key: keyof Values; label: string; type: string; inputName: string; autoComplete: string; optional?: boolean }[] = [
    { key: "name", label: CONTACT.fields.name, type: "text", inputName: "nome", autoComplete: "given-name" },
    { key: "venueName", label: CONTACT.fields.venue, type: "text", inputName: "locale", autoComplete: "organization" },
    { key: "phone", label: CONTACT.fields.phone, type: "tel", inputName: "telefono", autoComplete: "tel" },
    { key: "email", label: CONTACT.fields.email, type: "email", inputName: "email", autoComplete: "email", optional: true }
];
const check = (values: Values, consent: boolean, interests: LeadInterest[]) =>
    validateLead({ ...values, consent, interests }, (raw) => normalizePhoneToE164(raw));

/**
 * Evento per il tag manager dell'agenzia, se la pagina ne carica uno: solo la
 * variante, nessun dato personale. Oggi la landing non ha un tracker proprio
 * (quello pubblico dei menù è per sede) e senza `dataLayer` non fa nulla.
 */
function reportLeadSubmitted(variant: string) {
    const w = window as Window & { dataLayer?: unknown[] };
    if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event: "lead_submitted", variante: variant });
}

/**
 * Form «Richiedi una demo»: invia a `submit-lead` e lascia il posto alla
 * conferma. Form e conferma stanno nella stessa cella: il form resta sotto,
 * nascosto e inerte, e da desktop tiene l'altezza della scheda (nessun salto).
 */
function ContactForm() {
    const variante = useLandingVariant();
    const [values, setValues] = useState<Values>(EMPTY);
    const [interests, setInterests] = useState<LeadInterest[]>([]);
    const [consent, setConsent] = useState(false);
    const [errors, setErrors] = useState<Errors>({});
    const [status, setStatus] = useState<Status>("idle");
    const honeypot = useRef<HTMLInputElement>(null);
    const form = useRef<HTMLFormElement>(null);
    const doneTitle = useRef<HTMLHeadingElement>(null);
    const email = COMPANY.contact.info;

    useEffect(() => {
        if (status === "success") doneTitle.current?.focus();
    }, [status]);

    // Il form è nell'HTML prerenderizzato prima del JS: quello che il
    // visitatore scrive prima dell'idratazione sta nel DOM ma non nello stato,
    // e al primo render React lo cancellerebbe. Lo si riprende una volta,
    // all'idratazione, prima di qualsiasi altro render. Renderizzata dal client
    // (createRoot) DOM e stato coincidono e non cambia nulla.
    useLayoutEffect(() => {
        const el = form.current;
        if (!el) return;
        const input = (name: string) => el.elements.namedItem(name) as HTMLInputElement | null;
        const fromDom = { ...EMPTY };
        for (const f of FIELDS) fromDom[f.key] = input(f.inputName)?.value ?? "";
        if (FIELDS.some((f) => fromDom[f.key] !== "")) setValues(fromDom);
        if (input("privacy")?.checked) setConsent(true);
    }, []);

    // Dopo il primo errore un campo si riconvalida mentre lo si corregge.
    const revalidate = (nextValues: Values, nextConsent: boolean) => {
        if (Object.keys(errors).length === 0) return;
        const r = check(nextValues, nextConsent, interests);
        const nextErrors = r.ok ? {} : r.errors;
        setErrors((current) => {
            const kept: Errors = {};
            for (const key of Object.keys(current) as LeadField[]) if (nextErrors[key]) kept[key] = nextErrors[key];
            return kept;
        });
    };

    const setValue = (key: keyof Values, value: string) => {
        const next = { ...values, [key]: value };
        setValues(next);
        revalidate(next, consent);
    };

    const toggle = (id: LeadInterest) =>
        setInterests((current) => (current.includes(id) ? current.filter((i) => i !== id) : [...current, id]));

    const focusFirst = (found: Errors) => {
        const first = (["name", "venueName", "phone", "email", "consent"] as const).find((f) => found[f]);
        if (first) form.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (status === "sending") return;
        const r = check(values, consent, interests);
        if (!r.ok) {
            setErrors(r.errors);
            focusFirst(r.errors);
            return;
        }
        setErrors({});
        setStatus("sending");
        let leads: LeadsModule | null = null;
        try {
            leads = await loadLeads();
            const origin = getAttribution();
            await leads.submitLead({
                name: values.name,
                venue_name: values.venueName,
                phone: values.phone,
                email: values.email || undefined,
                interests,
                consent,
                variant: variante,
                website: honeypot.current?.value ?? "",
                utm_source: origin.utm_source ?? null,
                utm_medium: origin.utm_medium ?? null,
                utm_campaign: origin.utm_campaign ?? null,
                utm_content: origin.utm_content ?? null,
                utm_term: origin.utm_term ?? null,
                referrer: origin.referrer ?? null,
                landing_path: origin.landing_path ?? null
            });
            setStatus("success");
            reportLeadSubmitted(variante);
        } catch (err) {
            // Il server ha l'ultima parola sui campi: se ne rifiuta uno, lo si
            // mostra sotto il campo come gli errori del client.
            if (leads && err instanceof leads.SubmitLeadError && err.code === "INVALID_PAYLOAD" && Object.keys(err.fields).length > 0) {
                setErrors(err.fields);
                setStatus("idle");
                focusFirst(err.fields);
                return;
            }
            setStatus("error");
        }
    };

    const errorId = (field: LeadField) => `landing-lead-${field}-error`;
    const fieldError = (field: LeadField) =>
        errors[field] ? (
            <span id={errorId(field)} className={styles.error}>
                {CONTACT.errors[field][errors[field]!]}
            </span>
        ) : null;

    const sent = status === "success";
    const success = sent ? leadSuccessCopy(values.name, values.phone) : null;

    return (
        <div className={styles.stack}>
            <form
                ref={form}
                id={LANDING_CONTACT_FORM_ID}
                onFocus={() => void loadLeads().catch(() => undefined)}
                className={cx(styles.form, sent && styles.formSent)}
                data-tone="light"
                onSubmit={handleSubmit}
                noValidate
                inert={sent}
                aria-hidden={sent || undefined}
            >
                <div className={styles.fields}>
                    {FIELDS.map((f) => (
                        <label key={f.key} className={styles.field}>
                            {f.label} {f.optional && <span className={styles.optional}>{CONTACT.fields.optional}</span>}
                            <input
                                className={cx(styles.input, errors[f.key] && styles.inputError)}
                                type={f.type}
                                name={f.inputName}
                                autoComplete={f.autoComplete}
                                value={values[f.key]}
                                onChange={(e) => setValue(f.key, e.target.value)}
                                data-field={f.key}
                                aria-invalid={errors[f.key] ? true : undefined}
                                aria-describedby={errors[f.key] ? errorId(f.key) : undefined}
                            />
                            {fieldError(f.key)}
                        </label>
                    ))}
                </div>

                {/* Honeypot: fuori schermo e fuori dal tab order, lo compilano solo i bot. */}
                <label className={styles.trap} aria-hidden="true">
                    Sito web
                    <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
                </label>

                <fieldset className={styles.fieldset}>
                    <legend className={styles.legend}>{CONTACT.interestsLabel}</legend>
                    <div className={styles.pills}>
                        {CONTACT.interests.map((interest) => {
                            const on = interests.includes(interest.id);
                            return (
                                <button key={interest.id} type="button" className={cx(styles.pill, on && styles.pillOn)} aria-pressed={on} onClick={() => toggle(interest.id)}>
                                    {interest.label}
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                <div>
                    <label className={styles.consent}>
                        <input
                            className={styles.checkbox}
                            type="checkbox"
                            name="privacy"
                            checked={consent}
                            onChange={(e) => {
                                setConsent(e.target.checked);
                                revalidate(values, e.target.checked);
                            }}
                            data-field="consent"
                            aria-invalid={errors.consent ? true : undefined}
                            aria-describedby={errors.consent ? errorId("consent") : undefined}
                        />
                        <span>
                            {CONTACT.privacy.before}
                            <a href={CONTACT.privacy.href}>{CONTACT.privacy.link}</a>
                            {CONTACT.privacy.after}
                        </span>
                    </label>
                    {fieldError("consent")}
                </div>

                <LandingCta placement="final" shape="submit" busyLabel={status === "sending" ? CONTACT.sending : undefined} />

                {status === "error" && (
                    <p className={styles.failure} role="alert">
                        {CONTACT.failure.before}
                        <a href={`mailto:${email}`}>{email}</a>
                        {CONTACT.failure.after}
                    </p>
                )}
            </form>

            {success && (
                <div className={cx(styles.form, styles.done)} data-tone="light" role="status">
                    <span className={styles.doneIcon} aria-hidden="true">
                        <Check size={26} strokeWidth={2.5} />
                    </span>
                    <h3 ref={doneTitle} className={styles.doneTitle} tabIndex={-1}>
                        {success.title}
                    </h3>
                    <p className={styles.doneText}>
                        {success.phone ? (
                            <>
                                {CONTACT.success.text.before}
                                <span className={styles.nowrap}>{success.phone}</span>
                                {CONTACT.success.text.after}
                            </>
                        ) : (
                            CONTACT.success.textNoPhone
                        )}
                    </p>
                </div>
            )}
        </div>
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
        <Section tone="dark" id="contatto" space="form" className={styles.section} labelledBy="landing-contact-title">
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
