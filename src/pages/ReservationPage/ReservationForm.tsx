import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
    submitReservation,
    type SubmitReservationStatus
} from "@/services/supabase/reservations";
import type { FieldErrors, FormFields, Phase } from "./types";
import { EMPTY_FORM } from "./types";
import { snapTimeToQuarter, validateField } from "./validators";
import { availabilityErrors } from "./availability";
import type { OpeningHoursEntry, UpcomingClosure } from "./availability";
import WhenSection from "./WhenSection";
import WhoSection from "./WhoSection";
import NotesSection from "./NotesSection";
import styles from "./ReservationForm.module.scss";

type SubmitErrorCode =
    | "ACTIVITY_NOT_FOUND"
    | "ACTIVITY_NOT_ACTIVE"
    | "RESERVATIONS_DISABLED";

type Props = {
    slug: string;
    hours: OpeningHoursEntry[];
    closures: UpcomingClosure[];
    onSuccess: (snapshot: FormFields, status: SubmitReservationStatus) => void;
    onResolveErrorCode: (code: SubmitErrorCode) => void;
};

export default function ReservationForm({
    slug,
    hours,
    closures,
    onSuccess,
    onResolveErrorCode
}: Props) {
    const { t, i18n } = useTranslation("public");
    // Serve solo a preservare la lingua nel link all'informativa: la route
    // lang-aware è `/:slug/:lang/prenota`, quella base non ha il segmento.
    const { lang } = useParams<{ lang?: string }>();
    const [form, setForm] = useState<FormFields>(EMPTY_FORM);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    // Rifiuto server-side sull'orario appena inviato. `kind` distingue i due
    // fatti: il locale è pieno (capienza) oppure quell'orario ha già troppi
    // arrivi (pacing). Sono cose diverse e portano a due messaggi diversi —
    // nel secondo caso un orario vicino è probabilmente libero.
    const [slotFullSnapshot, setSlotFullSnapshot] = useState<{
        date: string;
        time: string;
        kind: "capacity" | "pacing";
    } | null>(null);
    const [phase, setPhase] = useState<Phase>("form");

    // Reactive availability validation against activity_hours / activity_closures.
    // Disabled when hours is empty (no schedule configured → free-form behavior).
    const availability = useMemo(
        () => availabilityErrors(form.reservation_date, form.reservation_time, hours, closures, t),
        [form.reservation_date, form.reservation_time, hours, closures, t]
    );

    // Merge availability errors with format-level fieldErrors.
    // Priority: format error first (e.g. "Inserisci una data valida.") then
    // slot-full (server-side rejection from the latest submit) then
    // availability ("Il locale è chiuso…"). Slot-full sticks to the
    // exact (date,time) pair the user submitted; any edit to either field
    // clears the snapshot via the change handler.
    const effectiveErrors: FieldErrors = useMemo(() => {
        const out: FieldErrors = { ...fieldErrors };
        const isSlotFullStillRelevant =
            slotFullSnapshot !== null &&
            slotFullSnapshot.date === form.reservation_date &&
            slotFullSnapshot.time === form.reservation_time;
        if (!out.reservation_time && isSlotFullStillRelevant) {
            out.reservation_time = t(
                slotFullSnapshot.kind === "pacing"
                    ? "reservation.err_pacing_full"
                    : "reservation.err_capacity_full"
            );
        }
        if (!out.reservation_date && availability.dateError) {
            out.reservation_date = availability.dateError;
        }
        if (!out.reservation_time && availability.timeError) {
            out.reservation_time = availability.timeError;
        }
        return out;
    }, [fieldErrors, availability, slotFullSnapshot, form.reservation_date, form.reservation_time, t]);

    const handleChange = useCallback(
        (name: keyof FormFields, value: string) => {
            setForm(prev => ({ ...prev, [name]: value }));
            setFieldErrors(prev => {
                if (!(name in prev)) return prev;
                const next = { ...prev };
                delete next[name];
                return next;
            });
            // Editing date or time invalidates a previous CAPACITY_FULL /
            // PACING_FULL snapshot — the inline error stops being relevant
            // the moment the user changes either field.
            if (name === "reservation_date" || name === "reservation_time") {
                setSlotFullSnapshot(null);
            }
        },
        []
    );

    const handleBlur = useCallback(
        (name: keyof FormFields) => {
            const err = validateField(name, form[name], t);
            setFieldErrors(prev => ({ ...prev, [name]: err ?? undefined }));
        },
        [form, t]
    );

    const handleSubmit = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();

            const next: FieldErrors = {};
            (Object.keys(form) as (keyof FormFields)[]).forEach(k => {
                const err = validateField(k, form[k], t);
                if (err) next[k] = err;
            });
            setFieldErrors(next);
            if (Object.values(next).some(v => v)) return;

            // Availability gate. Block submit when the soft validators flag
            // the chosen date+time. The user already sees the inline error,
            // we just refuse to send the payload.
            const a = availabilityErrors(
                form.reservation_date,
                form.reservation_time,
                hours,
                closures,
                t
            );
            if (a.dateError || a.timeError) return;

            setSubmitError(null);
            setPhase("submitting");
            // Defensive snap at submit time. The picker emits canonical
            // 15-minute slots, but autofill / programmatic value setters
            // could still land on non-quarter times — normalize before
            // sending the payload.
            const normalizedTime = snapTimeToQuarter(form.reservation_time.trim());
            try {
                const result = await submitReservation({
                    slug,
                    reservation_date: form.reservation_date.trim(),
                    reservation_time: normalizedTime,
                    party_size: Number(form.party_size),
                    customer_name: form.customer_name.trim(),
                    customer_email: form.customer_email.trim(),
                    customer_phone: form.customer_phone.trim(),
                    // Lingua in cui il cliente ha appena letto il form. È il
                    // solo momento in cui la sappiamo con certezza: da qui in
                    // poi le email partono da un cron o da un'azione
                    // dell'admin, dove nessun browser è più in ascolto.
                    language: i18n.language,
                    ...(form.notes.trim() ? { notes: form.notes.trim() } : {})
                });
                onSuccess(form, result.status);
                setPhase("success");
            } catch (err) {
                const errorObj = err as Error & { code?: string };
                const code = errorObj.code ?? "SERVER_ERROR";

                if (
                    code === "ACTIVITY_NOT_FOUND" ||
                    code === "ACTIVITY_NOT_ACTIVE" ||
                    code === "RESERVATIONS_DISABLED"
                ) {
                    onResolveErrorCode(code);
                    setPhase("form");
                    return;
                }

                if (code === "CAPACITY_FULL" || code === "PACING_FULL") {
                    // Inline error on the time field. Keep the form filled —
                    // the user only needs to pick a different time. Snapshot
                    // uses the normalized time so the inline error matches
                    // even if snap altered the value at submit.
                    setSlotFullSnapshot({
                        date: form.reservation_date.trim(),
                        time: normalizedTime,
                        kind: code === "PACING_FULL" ? "pacing" : "capacity"
                    });
                    setSubmitError(null);
                    setPhase("form");
                    return;
                }

                const message =
                    errorObj.message && errorObj.message !== code
                        ? errorObj.message
                        : t("reservation.err_submit");
                setSubmitError(message);
                setPhase("form");
            }
        },
        [form, slug, hours, closures, onSuccess, onResolveErrorCode, t]
    );

    const isSubmitting = phase === "submitting";

    return (
        <form
            className={styles.card}
            onSubmit={handleSubmit}
            noValidate
            aria-busy={isSubmitting}
        >
            <WhenSection
                values={{
                    reservation_date: form.reservation_date,
                    reservation_time: form.reservation_time,
                    party_size: form.party_size
                }}
                errors={effectiveErrors}
                hours={hours}
                closures={closures}
                slug={slug}
                onChange={handleChange}
                onBlur={handleBlur}
            />

            <WhoSection
                values={{
                    customer_name: form.customer_name,
                    customer_email: form.customer_email,
                    customer_phone: form.customer_phone
                }}
                errors={effectiveErrors}
                onChange={handleChange}
                onBlur={handleBlur}
            />

            <NotesSection
                value={form.notes}
                error={effectiveErrors.notes}
                onChange={handleChange}
                onBlur={handleBlur}
            />

            <div className={styles.submitRow}>
                {submitError && (
                    <div className={styles.bannerError} role="alert">
                        {submitError}
                    </div>
                )}

                <button
                    type="submit"
                    className={styles.submit}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                        <>
                            <span className={styles.spinner} aria-hidden="true" />
                            <span>{t("reservation.submitting")}</span>
                        </>
                    ) : (
                        t("reservation.submit")
                    )}
                </button>

                {/* Informativa DELLA SEDE, non quella di CataloGlobe: il
                    titolare del trattamento dei dati di chi prenota è il locale
                    (CataloGlobe è responsabile ex art. 28), quindi
                    `/legal/privacy` indicherebbe il soggetto sbagliato. */}
                <p className={styles.privacy}>
                    <Trans
                        i18nKey="reservation.consent"
                        ns="public"
                        components={{
                            privacy: (
                                <a
                                    href={
                                        lang
                                            ? `/${slug}/${lang}/privacy-prenotazioni`
                                            : `/${slug}/privacy-prenotazioni`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                />
                            )
                        }}
                    />
                </p>
            </div>
        </form>
    );
}
