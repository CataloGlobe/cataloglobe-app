import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { submitReservation } from "@/services/supabase/reservations";
import type { FieldErrors, FormFields, Phase } from "./types";
import { EMPTY_FORM } from "./types";
import { todayIsoDate, validateField } from "./validators";
import { availabilityErrors, slotsLabelForDate } from "./availability";
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
    onSuccess: (snapshot: FormFields) => void;
    onResolveErrorCode: (code: SubmitErrorCode) => void;
};

export default function ReservationForm({
    slug,
    hours,
    closures,
    onSuccess,
    onResolveErrorCode
}: Props) {
    const [form, setForm] = useState<FormFields>(EMPTY_FORM);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>("form");

    const minDate = useMemo(() => todayIsoDate(), []);

    // Reactive availability validation against activity_hours / activity_closures.
    // Disabled when hours is empty (no schedule configured → free-form behavior).
    const availability = useMemo(
        () => availabilityErrors(form.reservation_date, form.reservation_time, hours, closures),
        [form.reservation_date, form.reservation_time, hours, closures]
    );
    const slotsLabel = useMemo(
        () => slotsLabelForDate(form.reservation_date, hours, closures),
        [form.reservation_date, hours, closures]
    );

    // Merge availability errors with format-level fieldErrors.
    // Priority: format error first (e.g. "Inserisci una data valida.") then
    // availability error ("Il locale è chiuso…"). Never mask a more
    // fundamental issue with a semantic one.
    const effectiveErrors: FieldErrors = useMemo(() => {
        const out: FieldErrors = { ...fieldErrors };
        if (!out.reservation_date && availability.dateError) {
            out.reservation_date = availability.dateError;
        }
        if (!out.reservation_time && availability.timeError) {
            out.reservation_time = availability.timeError;
        }
        return out;
    }, [fieldErrors, availability]);

    const handleChange = useCallback(
        (name: keyof FormFields, value: string) => {
            setForm(prev => ({ ...prev, [name]: value }));
            setFieldErrors(prev => {
                if (!(name in prev)) return prev;
                const next = { ...prev };
                delete next[name];
                return next;
            });
        },
        []
    );

    const handleBlur = useCallback(
        (name: keyof FormFields) => {
            const err = validateField(name, form[name]);
            setFieldErrors(prev => ({ ...prev, [name]: err ?? undefined }));
        },
        [form]
    );

    const handleSubmit = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();

            const next: FieldErrors = {};
            (Object.keys(form) as (keyof FormFields)[]).forEach(k => {
                const err = validateField(k, form[k]);
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
                closures
            );
            if (a.dateError || a.timeError) return;

            setSubmitError(null);
            setPhase("submitting");
            try {
                await submitReservation({
                    slug,
                    reservation_date: form.reservation_date.trim(),
                    reservation_time: form.reservation_time.trim(),
                    party_size: Number(form.party_size),
                    customer_name: form.customer_name.trim(),
                    customer_email: form.customer_email.trim(),
                    customer_phone: form.customer_phone.trim(),
                    ...(form.notes.trim() ? { notes: form.notes.trim() } : {})
                });
                onSuccess(form);
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

                const message =
                    errorObj.message && errorObj.message !== code
                        ? errorObj.message
                        : "Si è verificato un errore. Riprova tra qualche istante.";
                setSubmitError(message);
                setPhase("form");
            }
        },
        [form, slug, hours, closures, onSuccess, onResolveErrorCode]
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
                minDate={minDate}
                slotsLabel={slotsLabel}
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
                            <span>Invio in corso…</span>
                        </>
                    ) : (
                        "Invia richiesta"
                    )}
                </button>

                <p className={styles.privacy}>
                    Inviando la richiesta accetti il trattamento dei dati per gestire la prenotazione.{" "}
                    <Link to="/legal/privacy">Privacy</Link>
                </p>
            </div>
        </form>
    );
}
