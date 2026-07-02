import { useTranslation } from "react-i18next";
import styles from "./ReservationForm.module.scss";

type Props = {
    value: string;
    error?: string;
    onChange: (value: string) => void;
    onBlur: () => void;
};

const PARTY_PILLS = ["1", "2", "3", "4", "5", "6", "7+"] as const;

export default function PartySizePicker({ value, error, onChange, onBlur }: Props) {
    const { t } = useTranslation("public");
    const n = Number(value);
    const isExplicitPill =
        Number.isInteger(n) && n >= 1 && n <= 6;
    const isOpenSeven = !isExplicitPill && Number.isFinite(n) && n >= 7;

    const handlePill = (v: string) => {
        if (v === "7+") onChange("7");
        else onChange(v);
    };

    return (
        <div className={styles.party}>
            <span className={styles.label}>{t("reservation.people")}</span>

            <div className={styles.partyPills} role="group" aria-label={t("reservation.people")}>
                {PARTY_PILLS.map(v => {
                    const isActive =
                        v === "7+" ? isOpenSeven : isExplicitPill && value === v;
                    return (
                        <button
                            key={v}
                            type="button"
                            className={`${styles.pill} ${isActive ? styles.pillActive : ""}`}
                            onClick={() => handlePill(v)}
                            aria-pressed={isActive}
                        >
                            {v}
                        </button>
                    );
                })}
            </div>

            {isOpenSeven && (
                <div className={styles.partyPlus}>
                    <label htmlFor="party_size_exact" className={styles.label}>
                        <span className={styles.labelHint}>{t("reservation.exact_number")}</span>
                    </label>
                    <input
                        id="party_size_exact"
                        type="number"
                        min={7}
                        max={50}
                        required
                        className={styles.input}
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        onBlur={onBlur}
                        aria-invalid={error ? "true" : undefined}
                        aria-describedby={error ? "err-party_size" : undefined}
                    />
                </div>
            )}

            {error && (
                <span id="err-party_size" className={styles.fieldError}>
                    {error}
                </span>
            )}
        </div>
    );
}
