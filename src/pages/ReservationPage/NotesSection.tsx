import { useTranslation } from "react-i18next";
import type { FormFields } from "./types";
import { ALLERGIES_MAX_LENGTH } from "./allergiesConsent";
import styles from "./ReservationForm.module.scss";

const MAX_NOTES = 500;

type Props = {
    value: string;
    error?: string;
    allergies: string;
    allergiesError?: string;
    allergiesConsent: boolean;
    onAllergiesConsentChange: (checked: boolean) => void;
    onChange: (name: keyof FormFields, value: string) => void;
    onBlur: (name: keyof FormFields) => void;
};

export default function NotesSection({
    value,
    error,
    allergies,
    allergiesError,
    allergiesConsent,
    onAllergiesConsentChange,
    onChange,
    onBlur
}: Props) {
    const { t } = useTranslation("public");
    return (
        <section className={styles.section} aria-labelledby="sec-note">
            <div className={styles.sectionHead}>
                <span className={styles.sectionNum}>03</span>
                <span id="sec-note" className={styles.sectionLabel}>{t("reservation.notes")}</span>
                <span className={styles.sectionRule} aria-hidden="true" />
            </div>

            <div className={styles.field}>
                <label htmlFor="notes" className={styles.label}>
                    {t("reservation.special_requests")}{" "}
                    <span className={styles.labelHint}>{t("reservation.optional")}</span>
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
                    placeholder={t("reservation.notes_placeholder")}
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

            {/* Allergie: dato sulla salute, quindi campo a parte con consenso
                esplicito. Casella non spuntata all'inizio; il campo si accende
                solo con la spunta e la versione del testo parte con l'invio. */}
            <div className={styles.field}>
                <label htmlFor="allergies" className={styles.label}>
                    {t("reservation.allergies_label")}{" "}
                    <span className={styles.labelHint}>{t("reservation.optional")}</span>
                </label>
                <label className={styles.consentRow}>
                    <input
                        type="checkbox"
                        className={styles.consentCheckbox}
                        aria-controls="allergies"
                        checked={allergiesConsent}
                        onChange={e => onAllergiesConsentChange(e.target.checked)}
                    />
                    <span id="allergies-consent">{t("reservation.allergies_consent")}</span>
                </label>
                <textarea
                    id="allergies"
                    rows={2}
                    maxLength={ALLERGIES_MAX_LENGTH}
                    className={styles.textarea}
                    value={allergies}
                    disabled={!allergiesConsent}
                    onChange={e => onChange("allergies", e.target.value)}
                    onBlur={() => onBlur("allergies")}
                    aria-invalid={allergiesError ? "true" : undefined}
                    aria-describedby={allergiesError ? "allergies-consent err-allergies" : "allergies-consent"}
                    placeholder={t("reservation.allergies_placeholder")}
                />
                {allergiesError && (
                    <span id="err-allergies" className={styles.fieldError}>
                        {allergiesError}
                    </span>
                )}
            </div>
        </section>
    );
}
