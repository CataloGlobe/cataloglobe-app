import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { submitReservation } from "@/services/supabase/reservations";
import type { FieldErrors, FormFields, Phase } from "./types";
import { EMPTY_FORM } from "./types";
import { todayIsoDate, validateField } from "./validators";
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
    onSuccess: (snapshot: FormFields) => void;
    onResolveErrorCode: (code: SubmitErrorCode) => void;
};

export default function ReservationForm({ slug, onSuccess, onResolveErrorCode }: Props) {
    const [form, setForm] = useState<FormFields>(EMPTY_FORM);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>("form");

    const minDate = useMemo(() => todayIsoDate(), []);

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
        [form, slug, onSuccess, onResolveErrorCode]
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
                errors={fieldErrors}
                minDate={minDate}
                onChange={handleChange}
                onBlur={handleBlur}
            />

            <WhoSection
                values={{
                    customer_name: form.customer_name,
                    customer_email: form.customer_email,
                    customer_phone: form.customer_phone
                }}
                errors={fieldErrors}
                onChange={handleChange}
                onBlur={handleBlur}
            />

            <NotesSection
                value={form.notes}
                error={fieldErrors.notes}
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
