import { useTranslation } from "react-i18next";
import type { FieldErrors, FormFields } from "./types";
import styles from "./ReservationForm.module.scss";

type Props = {
    values: Pick<FormFields, "customer_name" | "customer_email" | "customer_phone">;
    errors: FieldErrors;
    onChange: (name: keyof FormFields, value: string) => void;
    onBlur: (name: keyof FormFields) => void;
};

export default function WhoSection({ values, errors, onChange, onBlur }: Props) {
    const { t } = useTranslation("public");
    return (
        <section className={styles.section} aria-labelledby="sec-chi">
            <div className={styles.sectionHead}>
                <span className={styles.sectionNum}>02</span>
                <span id="sec-chi" className={styles.sectionLabel}>{t("reservation.who")}</span>
                <span className={styles.sectionRule} aria-hidden="true" />
            </div>

            <div className={styles.field}>
                <label htmlFor="customer_name" className={styles.label}>
                    {t("reservation.name")}
                </label>
                <input
                    id="customer_name"
                    type="text"
                    required
                    autoComplete="name"
                    className={styles.input}
                    value={values.customer_name}
                    onChange={e => onChange("customer_name", e.target.value)}
                    onBlur={() => onBlur("customer_name")}
                    aria-invalid={errors.customer_name ? "true" : undefined}
                    aria-describedby={
                        errors.customer_name ? "err-customer_name" : undefined
                    }
                />
                {errors.customer_name && (
                    <span id="err-customer_name" className={styles.fieldError}>
                        {errors.customer_name}
                    </span>
                )}
            </div>

            <div className={styles.row}>
                <div className={styles.field}>
                    <label htmlFor="customer_phone" className={styles.label}>
                        {t("reservation.phone")}
                    </label>
                    <input
                        id="customer_phone"
                        type="tel"
                        required
                        autoComplete="tel"
                        className={styles.input}
                        value={values.customer_phone}
                        onChange={e => onChange("customer_phone", e.target.value)}
                        onBlur={() => onBlur("customer_phone")}
                        aria-invalid={errors.customer_phone ? "true" : undefined}
                        aria-describedby={
                            errors.customer_phone ? "err-customer_phone" : undefined
                        }
                    />
                    {errors.customer_phone && (
                        <span id="err-customer_phone" className={styles.fieldError}>
                            {errors.customer_phone}
                        </span>
                    )}
                </div>
                <div className={styles.field}>
                    <label htmlFor="customer_email" className={styles.label}>
                        {t("reservation.email")}
                    </label>
                    <input
                        id="customer_email"
                        type="email"
                        required
                        autoComplete="email"
                        className={styles.input}
                        value={values.customer_email}
                        onChange={e => onChange("customer_email", e.target.value)}
                        onBlur={() => onBlur("customer_email")}
                        aria-invalid={errors.customer_email ? "true" : undefined}
                        aria-describedby={
                            errors.customer_email ? "err-customer_email" : undefined
                        }
                    />
                    {errors.customer_email && (
                        <span id="err-customer_email" className={styles.fieldError}>
                            {errors.customer_email}
                        </span>
                    )}
                </div>
            </div>
        </section>
    );
}
