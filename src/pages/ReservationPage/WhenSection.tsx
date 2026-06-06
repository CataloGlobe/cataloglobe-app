import PartySizePicker from "./PartySizePicker";
import type { FieldErrors, FormFields } from "./types";
import { CalendarIcon, ClockIcon } from "./icons";
import { snapTimeToQuarter } from "./validators";
import styles from "./ReservationForm.module.scss";

type Props = {
    values: Pick<FormFields, "reservation_date" | "reservation_time" | "party_size">;
    errors: FieldErrors;
    minDate: string;
    /** "Aperto 12:00–15:00, 19:00–23:00" — empty string when no schedule
     *  available, day fully closed, or hours not configured for the venue. */
    slotsLabel: string;
    onChange: (name: keyof FormFields, value: string) => void;
    onBlur: (name: keyof FormFields) => void;
};

export default function WhenSection({
    values,
    errors,
    minDate,
    slotsLabel,
    onChange,
    onBlur
}: Props) {
    return (
        <section className={styles.section} aria-labelledby="sec-quando">
            <div className={styles.sectionHead}>
                <span className={styles.sectionNum}>01</span>
                <span id="sec-quando" className={styles.sectionLabel}>Quando</span>
                <span className={styles.sectionRule} aria-hidden="true" />
            </div>

            <div className={styles.row}>
                <div className={styles.field}>
                    <label htmlFor="reservation_date" className={styles.label}>
                        Data
                    </label>
                    <input
                        id="reservation_date"
                        type="date"
                        required
                        className={styles.input}
                        value={values.reservation_date}
                        min={minDate}
                        onChange={e => {
                            const next = e.target.value;
                            onChange("reservation_date", next);
                            // Clear time when date is removed: prevents an
                            // orphan time value that bypasses availability
                            // validation (which is gated on date presence).
                            if (!next && values.reservation_time) {
                                onChange("reservation_time", "");
                            }
                        }}
                        onBlur={() => onBlur("reservation_date")}
                        aria-invalid={errors.reservation_date ? "true" : undefined}
                        aria-describedby={
                            errors.reservation_date ? "err-reservation_date" : undefined
                        }
                    />
                    {errors.reservation_date && (
                        <span id="err-reservation_date" className={styles.fieldError}>
                            {errors.reservation_date}
                        </span>
                    )}
                </div>

                <div className={styles.field}>
                    <label htmlFor="reservation_time" className={styles.label}>
                        Ora
                    </label>
                    <input
                        id="reservation_time"
                        type="time"
                        required
                        step={900}
                        disabled={!values.reservation_date}
                        className={styles.input}
                        value={values.reservation_time}
                        onChange={e => {
                            const raw = e.target.value;
                            onChange(
                                "reservation_time",
                                raw ? snapTimeToQuarter(raw) : ""
                            );
                        }}
                        onBlur={() => {
                            // Defensive snap on blur: catches programmatic
                            // value changes (autofill, scripted setters) and
                            // any browser that emits non-quarter values
                            // without firing change.
                            const current = values.reservation_time;
                            if (current) {
                                const snapped = snapTimeToQuarter(current);
                                if (snapped !== current) {
                                    onChange("reservation_time", snapped);
                                }
                            }
                            onBlur("reservation_time");
                        }}
                        aria-invalid={errors.reservation_time ? "true" : undefined}
                        aria-describedby={
                            errors.reservation_time ? "err-reservation_time" : undefined
                        }
                    />
                    {errors.reservation_time && (
                        <span id="err-reservation_time" className={styles.fieldError}>
                            {errors.reservation_time}
                        </span>
                    )}
                </div>
            </div>

            {!values.reservation_date ? (
                <p className={styles.slotsHint} aria-live="polite">
                    <CalendarIcon size={14} />
                    <span>Scegli prima la data</span>
                </p>
            ) : slotsLabel ? (
                <p className={styles.slotsHint} aria-live="polite">
                    <ClockIcon size={14} />
                    <span>{slotsLabel}</span>
                </p>
            ) : null}

            <PartySizePicker
                value={values.party_size}
                error={errors.party_size}
                onChange={v => onChange("party_size", v)}
                onBlur={() => onBlur("party_size")}
            />
        </section>
    );
}
