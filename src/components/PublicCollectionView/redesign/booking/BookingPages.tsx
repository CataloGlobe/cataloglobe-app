import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Check, Phone } from "lucide-react";
import WhoSection from "@/pages/ReservationPage/WhoSection";
import NotesSection from "@/pages/ReservationPage/NotesSection";
import ReservationRecap from "@/pages/ReservationPage/ReservationRecap";
import { closeSheet, type SheetPage } from "../sheets/sheetStack";
import { BOOKING_DONE_KEY, bookingStepOf, pushBookingSheet } from "./bookingSheet";
import { BOOKING_STEPS, whenSummary, type BookingStep } from "./bookingForm";
import BookingWhen from "./BookingWhen";
import type { BookingBinding } from "./useBooking";
import styles from "./BookingPages.module.scss";

/**
 * Le pagine della prenotazione nel foglio unico (Quando, I tuoi dati, Riepilogo,
 * conferma) e il loro piede. «Quando» è quello del mockup v38 (`BookingWhen`,
 * stessi orari e stessa disponibilità di /prenota); dati, note e riepilogo sono
 * le sezioni della pagina `/:slug/prenota`. Le note stanno nel Riepilogo (v38). Ogni passo è un `<form>`; il pulsante del piede lo invia
 * col suo attributo `form`, così Invio sulla tastiera fa la stessa cosa.
 */
const FORM_ID = { when: "booking-when", who: "booking-who", recap: "booking-recap" } as const;

export default function BookingPage({ page, booking }: { page: SheetPage; booking: BookingBinding }) {
    const { t, i18n } = useTranslation("public");
    const { lang } = useParams<{ lang?: string }>();
    const { config, form, errors } = booking;

    if (page.key === BOOKING_DONE_KEY) return <BookingDone booking={booking} />;
    const step = bookingStepOf(page);
    if (!step) return null;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (step === "recap") booking.submit();
        else booking.next(step);
    };

    return (
        <form id={FORM_ID[step]} className={styles.step} onSubmit={submit} noValidate aria-busy={booking.submitting}>
            <StepProgress step={step} />
            {step === "when" ? (
                <BookingWhen
                    values={{
                        reservation_date: form.reservation_date,
                        reservation_time: form.reservation_time,
                        party_size: form.party_size
                    }}
                    errors={errors}
                    config={config}
                    onChange={booking.setField}
                />
            ) : null}
            {step === "who" ? (
                <WhoSection
                    values={{
                        customer_name: form.customer_name,
                        customer_email: form.customer_email,
                        customer_phone: form.customer_phone
                    }}
                    errors={errors}
                    onChange={booking.setField}
                    onBlur={booking.blurField}
                />
            ) : null}
            {step === "recap" ? (
                <>
                    <ReservationRecap
                        locale={i18n.language}
                        venueName={config.venueName}
                        reservationDate={form.reservation_date}
                        reservationTime={form.reservation_time}
                        partySize={form.party_size}
                        customerName={form.customer_name}
                    />
                    <NotesSection
                        value={form.notes}
                        error={errors.notes}
                        allergies={form.allergies}
                        allergiesError={errors.allergies}
                        allergiesConsent={booking.allergiesConsent}
                        onAllergiesConsentChange={booking.setAllergiesConsent}
                        onChange={booking.setField}
                        onBlur={booking.blurField}
                    />
                    {booking.unavailable ? (
                        <div className={styles.notice} role="alert">
                            <p>{t("booking.unavailable")}</p>
                            {config.phone ? (
                                <a className={styles.call} href={`tel:${config.phone.replace(/\s+/g, "")}`}>
                                    <Phone size={16} strokeWidth={2} aria-hidden />
                                    {t("reservation.call_venue")}
                                </a>
                            ) : null}
                        </div>
                    ) : booking.submitError ? (
                        <p className={styles.error} role="alert">
                            {booking.submitError}
                        </p>
                    ) : null}
                    {/* Informativa della sede, non di CataloGlobe: il titolare è il locale (come la pagina /prenota). */}
                    <p className={styles.privacy}>
                        <Trans
                            i18nKey="reservation.consent"
                            ns="public"
                            components={{
                                privacy: (
                                    <a
                                        href={
                                            lang
                                                ? `/${config.slug}/${lang}/privacy-prenotazioni`
                                                : `/${config.slug}/privacy-prenotazioni`
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    />
                                )
                            }}
                        />
                    </p>
                </>
            ) : null}
        </form>
    );
}

const STEP_LABELS: Record<BookingStep, string> = {
    when: "reservation.when",
    who: "booking.title_who",
    recap: "booking.title_recap"
};

/** «1 di 3 · Quando» con i tre trattini (mockup v38). */
function StepProgress({ step }: { step: BookingStep }) {
    const { t } = useTranslation("public");
    const n = BOOKING_STEPS.indexOf(step) + 1;
    const label = t(STEP_LABELS[step]);
    const total = BOOKING_STEPS.length;
    return (
        <p className={styles.progress}>
            {BOOKING_STEPS.map((s, i) => (
                <i key={s} data-on={i < n ? "" : undefined} aria-hidden="true" />
            ))}
            <span>{t("booking.progress", { n, total, label })}</span>
        </p>
    );
}

function BookingDone({ booking }: { booking: BookingBinding }) {
    const { t, i18n } = useTranslation("public");
    const result = booking.result;
    if (!result) return null;
    const confirmed = result.status === "confirmed";
    return (
        <div className={styles.done} data-status={result.status}>
            <span className={styles.doneIcon} aria-hidden>
                <Check size={28} strokeWidth={2.4} />
            </span>
            <h2 className={styles.doneTitle}>{t(confirmed ? "reservation.confirmed_title" : "reservation.pending_title")}</h2>
            <p className={styles.doneLead}>{t(confirmed ? "reservation.confirmed_lead" : "reservation.pending_lead")}</p>
            <div className={styles.doneRecap}>
                <ReservationRecap
                    locale={i18n.language}
                    venueName={booking.config.venueName}
                    reservationDate={result.snapshot.reservation_date}
                    reservationTime={result.snapshot.reservation_time}
                    partySize={result.snapshot.party_size}
                    customerName={result.snapshot.customer_name}
                />
            </div>
            <span className={styles.doneStatus}>{t(confirmed ? "reservation.confirmed_pill" : "reservation.pending_pill")}</span>
        </div>
    );
}

/** Il piede di ogni passo: Continua (col riepilogo a Quando), Invia richiesta, Torna al menu. */
export function BookingFooter({ page, booking }: { page: SheetPage; booking: BookingBinding }) {
    const { t, i18n } = useTranslation("public");
    if (page.key === BOOKING_DONE_KEY) {
        return (
            <div className={styles.footer}>
                <button type="button" className={styles.cta} onClick={closeSheet}>
                    {t("reservation.back_to_menu")}
                </button>
            </div>
        );
    }
    const step = bookingStepOf(page);
    if (!step) return null;

    if (step === "when") {
        const summary = whenSummary(booking.form, i18n.language, count => t("reservation.party_count", { count }));
        return (
            <div className={styles.footer}>
                {/* Manca l'ora: il pulsante lo dice e porta lì (mai preselezionata, spec v25). Su una riga (v38). */}
                <button type="submit" form={FORM_ID.when} className={styles.cta} data-missing={summary ? undefined : ""}>
                    {summary ? <span className={styles.ctaLine}>{`${t("booking.continue")} · ${summary}`}</span> : t("booking.pick_time")}
                </button>
            </div>
        );
    }
    if (step === "who") {
        return (
            <div className={styles.footer}>
                <button type="submit" form={FORM_ID.who} className={styles.cta}>
                    {t("booking.continue")}
                </button>
            </div>
        );
    }
    return (
        <div className={styles.footer}>
            <button
                type="submit"
                form={FORM_ID.recap}
                className={styles.cta}
                disabled={booking.submitting || booking.unavailable}
                aria-busy={booking.submitting}
            >
                {booking.submitting ? t("reservation.submitting") : t("reservation.submit")}
            </button>
        </div>
    );
}

/** Il pulsante di un contenuto in evidenza che porta alla prenotazione: i passi entrano a spinta. */
export function BookingCtaFooter({ label }: { label: string }) {
    return (
        <div className={styles.footer}>
            <button type="button" className={styles.cta} onClick={pushBookingSheet}>
                {label}
            </button>
        </div>
    );
}
