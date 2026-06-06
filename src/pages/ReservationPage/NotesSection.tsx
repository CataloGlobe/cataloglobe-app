import type { FormFields } from "./types";
import styles from "./ReservationForm.module.scss";

const MAX_NOTES = 500;

type Props = {
    value: string;
    error?: string;
    onChange: (name: keyof FormFields, value: string) => void;
    onBlur: (name: keyof FormFields) => void;
};

export default function NotesSection({ value, error, onChange, onBlur }: Props) {
    return (
        <section className={styles.section} aria-labelledby="sec-note">
            <div className={styles.sectionHead}>
                <span className={styles.sectionNum}>03</span>
                <span id="sec-note" className={styles.sectionLabel}>Note</span>
                <span className={styles.sectionRule} aria-hidden="true" />
            </div>

            <div className={styles.field}>
                <label htmlFor="notes" className={styles.label}>
                    Richieste particolari{" "}
                    <span className={styles.labelHint}>(facoltativo)</span>
                </label>
                <textarea
                    id="notes"
                    rows={3}
                    maxLength={MAX_NOTES}
                    className={styles.textarea}
                    value={value}
                    onChange={e => onChange("notes", e.target.value)}
                    onBlur={() => onBlur("notes")}
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? "err-notes" : undefined}
                    placeholder="Allergie, esigenze particolari, occasioni speciali…"
                />
                <span className={styles.notesCount}>
                    {value.length}/{MAX_NOTES}
                </span>
                {error && (
                    <span id="err-notes" className={styles.fieldError}>
                        {error}
                    </span>
                )}
            </div>
        </section>
    );
}
