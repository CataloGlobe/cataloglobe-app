import PartySizePicker from "./PartySizePicker";
import type { FieldErrors, FormFields } from "./types";
import styles from "./ReservationForm.module.scss";

type Props = {
    values: Pick<FormFields, "reservation_date" | "reservation_time" | "party_size">;
    errors: FieldErrors;
    minDate: string;
    onChange: (name: keyof FormFields, value: string) => void;
    onBlur: (name: keyof FormFields) => void;
};

export default function WhenSection({ values, errors, minDate, onChange, onBlur }: Props) {
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
                        onChange={e => onChange("reservation_date", e.target.value)}
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
                        className={styles.input}
                        value={values.reservation_time}
                        onChange={e => onChange("reservation_time", e.target.value)}
                        onBlur={() => onBlur("reservation_time")}
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

            <PartySizePicker
                value={values.party_size}
                error={errors.party_size}
                onChange={v => onChange("party_size", v)}
                onBlur={() => onBlur("party_size")}
            />
        </section>
    );
}
