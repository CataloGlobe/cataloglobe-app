import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import PartySizePicker from "./PartySizePicker";
import ReservationDatePicker from "./components/ReservationDatePicker";
import ReservationTimePicker from "./components/ReservationTimePicker";
import { getReservationPeriodsForDate } from "./utils/reservationSlots";
import type {
    OpeningHoursEntry,
    UpcomingClosure
} from "./availability";
import type { FieldErrors, FormFields } from "./types";
import styles from "./ReservationForm.module.scss";

type Props = {
    values: Pick<FormFields, "reservation_date" | "reservation_time" | "party_size">;
    errors: FieldErrors;
    hours: OpeningHoursEntry[];
    closures: UpcomingClosure[];
    onChange: (name: keyof FormFields, value: string) => void;
    onBlur: (name: keyof FormFields) => void;
};

export default function WhenSection({
    values,
    errors,
    hours,
    closures,
    onChange,
    onBlur
}: Props) {
    const { t } = useTranslation("public");
    // Build the period groups for the picker. Recomputed when the selected
    // date changes or the upstream hours/closures change.
    // `getReservationPeriodsForDate` still routes through the unchanged slot
    // generator (overnight rule, 15-min step, past/available state); only
    // the grouping differs — slots are bucketed by time-of-day period
    // (Notte / Mattina / Pranzo / Pomeriggio / Sera) instead of by raw
    // opening range. The time picker stays mode-agnostic.
    const servicePeriods = useMemo(() => {
        if (!values.reservation_date) return [];
        return getReservationPeriodsForDate(
            values.reservation_date,
            hours,
            closures,
            new Date()
        );
    }, [values.reservation_date, hours, closures]);

    const handleDateChange = (iso: string) => {
        if (iso === values.reservation_date) return;
        onChange("reservation_date", iso);
        // Clear the time when the date changes: prevents an orphan time
        // value that would survive into a day whose service blocks no
        // longer contain it.
        if (values.reservation_time) {
            onChange("reservation_time", "");
        }
        // No synchronous onBlur call here: with a discrete picker "blur"
        // has no semantic meaning, and invoking validateField inside the
        // same React tick as onChange would read a stale `form` from the
        // parent's closure and falsely flag the just-picked value as
        // empty. Submit-time validation + reactive availabilityErrors
        // still cover all real failure modes.
    };

    const handleTimeChange = (time: string) => {
        onChange("reservation_time", time);
        // See note in handleDateChange — onBlur removed to avoid stale
        // closure validation on the first selection.
    };

    const dateInvalid = Boolean(errors.reservation_date);
    const timeInvalid = Boolean(errors.reservation_time);

    return (
        <section className={styles.section} aria-labelledby="sec-quando">
            <div className={styles.sectionHead}>
                <span className={styles.sectionNum}>01</span>
                <span id="sec-quando" className={styles.sectionLabel}>{t("reservation.when")}</span>
                <span className={styles.sectionRule} aria-hidden="true" />
            </div>

            <div className={styles.field}>
                <span id="lbl-reservation_date" className={styles.label}>
                    {t("reservation.date")}
                </span>
                <ReservationDatePicker
                    value={values.reservation_date}
                    onChange={handleDateChange}
                    hours={hours}
                    closures={closures}
                    invalid={dateInvalid}
                    errorId={dateInvalid ? "err-reservation_date" : undefined}
                />
                {errors.reservation_date && (
                    <span id="err-reservation_date" className={styles.fieldError}>
                        {errors.reservation_date}
                    </span>
                )}
            </div>

            <div className={styles.field}>
                <span id="lbl-reservation_time" className={styles.label}>
                    {t("reservation.time")}
                </span>
                <ReservationTimePicker
                    value={values.reservation_time}
                    onChange={handleTimeChange}
                    periods={servicePeriods}
                    disabled={!values.reservation_date}
                    disabledMessage={t("reservation.choose_date_first")}
                    invalid={timeInvalid}
                    errorId={timeInvalid ? "err-reservation_time" : undefined}
                />
                {errors.reservation_time && (
                    <span id="err-reservation_time" className={styles.fieldError}>
                        {errors.reservation_time}
                    </span>
                )}
            </div>

            <PartySizePicker
                value={values.party_size}
                error={errors.party_size}
                onChange={v => onChange("party_size", v)}
                onBlur={() => onBlur("party_size")}
            />
        </section>
    );
}
