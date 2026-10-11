import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { submitReservation, type SubmitReservationStatus } from "@/services/supabase/reservations";
import { EMPTY_FORM, type FieldErrors, type FormFields } from "@/pages/ReservationPage/types";
import { snapTimeToQuarter, validateField } from "@/pages/ReservationPage/validators";
import { availabilityErrors } from "@/pages/ReservationPage/availability";
import { ALLERGIES_CONSENT_VERSION, ALLERGIES_ENABLED } from "@/pages/ReservationPage/allergiesConsent";
import { getSheetState, useSheetState } from "../sheets/sheetStack";
import { BOOKING_PREFIX, goToBookingStep, isBookingPage, showBookingDone } from "./bookingSheet";
import { firstBookableDate, firstErrorField, validateStep, type BookingConfig, type BookingStep } from "./bookingForm";

/** Oltre questo l'invio si dà per non riuscito (regola della pagina pubblica: mai un'attesa infinita). */
export const BOOKING_SUBMIT_TIMEOUT_MS = 20_000;

export type BookingResult = { snapshot: FormFields; status: SubmitReservationStatus };

export type BookingBinding = {
    config: BookingConfig;
    form: FormFields;
    /** Errori a vista: formato, orario pieno all'ultimo invio, giorno chiuso, fuori orario. */
    errors: FieldErrors;
    allergiesConsent: boolean;
    setField: (name: keyof FormFields, value: string) => void;
    blurField: (name: keyof FormFields) => void;
    setAllergiesConsent: (checked: boolean) => void;
    /** Controlla il passo: avanti se va bene, altrimenti porta al primo campo da sistemare. */
    next: (step: Exclude<BookingStep, "recap">) => void;
    submit: () => void;
    submitting: boolean;
    submitError: string | null;
    /** La sede non prende più prenotazioni online (sospesa, spente): il riepilogo lo dice. */
    unavailable: boolean;
    result: BookingResult | null;
};

const ACTIVITY_CODES = new Set(["ACTIVITY_NOT_FOUND", "ACTIVITY_NOT_ACTIVE", "RESERVATIONS_DISABLED"]);

/** Porta al campo da sistemare: il fuoco se è un campo da scrivere, altrimenti il messaggio a vista. */
function revealField(field: keyof FormFields) {
    requestAnimationFrame(() => {
        const input = document.getElementById(field);
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
            input.focus();
            return;
        }
        document.getElementById(`err-${field}`)?.scrollIntoView({ block: "center" });
    });
}

/**
 * Il modulo della prenotazione nel foglio: una bozza sola per i tre passi,
 * tenuta da `VenueSheets` (pagine e piede la leggono). Riparte da capo quando il
 * primo passo rientra nella pila; invio e codici d'errore come nella pagina
 * `/:slug/prenota` (`ReservationForm`).
 */
export function useBooking(config: BookingConfig | undefined): BookingBinding | undefined {
    const { t, i18n } = useTranslation("public");
    const [form, setForm] = useState<FormFields>(EMPTY_FORM);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [allergiesConsent, setConsent] = useState(false);
    const [slotFull, setSlotFull] = useState<{ date: string; time: string; kind: "capacity" | "pacing" } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [result, setResult] = useState<BookingResult | null>(null);
    const sendingRef = useRef(false);
    // Ogni modulo nuovo cambia giro: la risposta di un invio del giro prima
    // (foglio chiuso mentre partiva) non riapre il foglio né tocca il modulo.
    const roundRef = useRef(0);

    // Il primo passo entra nella pila: modulo nuovo, col primo giorno prenotabile già scelto.
    // Parte da false: il foglio arriva in un chunk al primo tocco, già col primo passo in pila.
    const whenInStack = useSheetState().pages.some(page => page.key === `${BOOKING_PREFIX}when`);
    const [wasInStack, setWasInStack] = useState(false);
    if (whenInStack !== wasInStack) {
        setWasInStack(whenInStack);
        if (whenInStack && config) {
            roundRef.current += 1;
            sendingRef.current = false;
            setSubmitting(false);
            setForm({ ...EMPTY_FORM, reservation_date: firstBookableDate(config) });
            setFieldErrors({});
            setConsent(false);
            setSlotFull(null);
            setSubmitError(null);
            setUnavailable(false);
            setResult(null);
        }
    }

    const errors = useMemo(() => {
        if (!config) return fieldErrors;
        const out: FieldErrors = { ...fieldErrors };
        if (!out.reservation_time && slotFull && slotFull.date === form.reservation_date && slotFull.time === form.reservation_time) {
            out.reservation_time = t(slotFull.kind === "pacing" ? "reservation.err_pacing_full" : "reservation.err_capacity_full");
        }
        const availability = availabilityErrors(form.reservation_date, form.reservation_time, config.hours, config.closures, t);
        if (!out.reservation_date && availability.dateError) out.reservation_date = availability.dateError;
        if (!out.reservation_time && availability.timeError) out.reservation_time = availability.timeError;
        return out;
    }, [config, fieldErrors, slotFull, form.reservation_date, form.reservation_time, t]);

    const setField = useCallback((name: keyof FormFields, value: string) => {
        setForm(prev => ({ ...prev, [name]: value }));
        setFieldErrors(prev => {
            if (!(name in prev)) return prev;
            const next = { ...prev };
            delete next[name];
            return next;
        });
        if (name === "reservation_date" || name === "reservation_time") setSlotFull(null);
    }, []);

    const blurField = useCallback(
        (name: keyof FormFields) => {
            const error = validateField(name, form[name], t);
            setFieldErrors(prev => ({ ...prev, [name]: error ?? undefined }));
        },
        [form, t]
    );

    const setAllergiesConsent = useCallback(
        (checked: boolean) => {
            setConsent(checked);
            // Tolta la spunta, il testo non deve restare.
            if (!checked) setField("allergies", "");
        },
        [setField]
    );

    const next = useCallback(
        (step: Exclude<BookingStep, "recap">) => {
            if (!config) return;
            const stepErrors = validateStep(step, form, config, t);
            setFieldErrors(prev => ({ ...prev, ...stepErrors }));
            const field = firstErrorField(step, stepErrors);
            if (field) {
                revealField(field);
                return;
            }
            goToBookingStep(step === "when" ? "who" : "recap");
        },
        [config, form, t]
    );

    const submit = useCallback(() => {
        if (!config || sendingRef.current) return;
        // Un passo indietro modificato male: si torna lì, col campo a vista.
        for (const step of ["when", "who"] as const) {
            const stepErrors = validateStep(step, form, config, t);
            const field = firstErrorField(step, stepErrors);
            if (field) {
                setFieldErrors(prev => ({ ...prev, ...stepErrors }));
                goToBookingStep(step);
                revealField(field);
                return;
            }
        }
        sendingRef.current = true;
        const round = roundRef.current;
        setSubmitting(true);
        setSubmitError(null);
        const time = snapTimeToQuarter(form.reservation_time.trim());
        void submitReservation(
            {
                slug: config.slug,
                reservation_date: form.reservation_date.trim(),
                reservation_time: time,
                party_size: Number(form.party_size),
                customer_name: form.customer_name.trim(),
                customer_email: form.customer_email.trim(),
                customer_phone: form.customer_phone.trim(),
                // La lingua in cui il cliente ha letto il modulo: le email dopo partono senza browser.
                language: i18n.language,
                ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
                ...(ALLERGIES_ENABLED && allergiesConsent && form.allergies.trim()
                    ? { allergies: form.allergies.trim(), allergies_consent_version: ALLERGIES_CONSENT_VERSION }
                    : {})
            },
            { timeoutMs: BOOKING_SUBMIT_TIMEOUT_MS }
        )
            .then(response => {
                if (round !== roundRef.current || !getSheetState().pages.some(isBookingPage)) return;
                setResult({ snapshot: form, status: response.status });
                showBookingDone();
            })
            .catch((error: Error & { code?: string }) => {
                if (round !== roundRef.current || !getSheetState().pages.some(isBookingPage)) return;
                const code = error.code ?? "SERVER_ERROR";
                if (ACTIVITY_CODES.has(code)) {
                    setUnavailable(true);
                } else if (code === "CAPACITY_FULL" || code === "PACING_FULL") {
                    // L'ora è piena: si torna a Quando, col messaggio sotto l'orario.
                    setSlotFull({ date: form.reservation_date.trim(), time, kind: code === "PACING_FULL" ? "pacing" : "capacity" });
                    goToBookingStep("when");
                    revealField("reservation_time");
                } else if (code === "TIMEOUT") {
                    setSubmitError(t("booking.err_timeout"));
                } else {
                    setSubmitError(error.message && error.message !== code ? error.message : t("reservation.err_submit"));
                }
            })
            .finally(() => {
                if (round !== roundRef.current) return;
                sendingRef.current = false;
                setSubmitting(false);
            });
    }, [config, form, allergiesConsent, i18n.language, t]);

    if (!config) return undefined;
    return {
        config,
        form,
        errors,
        allergiesConsent,
        setField,
        blurField,
        setAllergiesConsent,
        next,
        submit,
        submitting,
        submitError,
        unavailable,
        result
    };
}
