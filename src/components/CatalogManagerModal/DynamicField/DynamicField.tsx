import Text from "@/components/ui/Text/Text";
import styles from "./DynamicField.module.scss";
import type { FieldDef } from "@/domain/catalog/fields";
import { TextInput } from "@/components/ui/Input/TextInput";

type Props = {
    field: FieldDef;
    value: any;
    onChange: (value: any) => void;
};

export default function DynamicField({ field, value, onChange }: Props) {
    const { label, type, required, placeholder, helpText, options } = field;

    switch (type) {
        case "text":
        case "number":
            return (
                <TextInput
                    label={label}
                    value={value ?? ""}
                    required={required}
                    placeholder={placeholder}
                    inputMode={type === "number" ? "decimal" : undefined}
                    onChange={e => onChange(e.target.value)}
                />
            );

        case "textarea":
            return (
                <div className={styles.field}>
                    <label className={styles.label}>
                        <Text weight={600}>
                            {label}
                            {required && " *"}
                        </Text>
                    </label>

                    <textarea
                        className={styles.textarea}
                        value={value ?? ""}
                        placeholder={placeholder}
                        rows={3}
                        onChange={e => onChange(e.target.value)}
                    />

                    {helpText && (
                        <Text variant="caption" colorVariant="muted">
                            {helpText}
                        </Text>
                    )}
                </div>
            );

        case "select":
            return (
                <div className={styles.field}>
                    <label className={styles.label}>
                        <Text weight={600}>
                            {label}
                            {required && " *"}
                        </Text>
                    </label>

                    <select
                        className={styles.select}
                        value={value ?? ""}
                        onChange={e => onChange(e.target.value)}
                    >
                        <option value="">—</option>
                        {options?.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            );

        case "multiselect":
            return (
                <div className={styles.field}>
                    <Text weight={600}>{label}</Text>

                    <div className={styles.multi}>
                        {options?.map(opt => {
                            const checked = Array.isArray(value)
                                ? value.includes(opt.value)
                                : false;

                            return (
                                <label key={opt.value} className={styles.checkbox}>
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={e => {
                                            const current = Array.isArray(value) ? value : [];
                                            const next = e.target.checked
                                                ? [...current, opt.value]
                                                : current.filter(v => v !== opt.value);
                                            onChange(next);
                                        }}
                                    />
                                    <Text variant="caption">{opt.label}</Text>
                                </label>
                            );
                        })}
                    </div>
                </div>
            );

        case "switch":
            return (
                <label className={styles.switch}>
                    <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={e => onChange(e.target.checked)}
                    />
                    <Text>{label}</Text>
                </label>
            );

        case "chips":
            return (
                <div className={styles.field}>
                    <Text weight={600}>{label}</Text>

                    <TextInput
                        className={styles.input}
                        value={Array.isArray(value) ? value.join(", ") : ""}
                        placeholder="Separati da virgola"
                        onChange={e =>
                            onChange(
                                e.target.value
                                    .split(",")
                                    .map(v => v.trim())
                                    .filter(Boolean)
                            )
                        }
                    />

                    {helpText && (
                        <Text variant="caption" colorVariant="muted">
                            {helpText}
                        </Text>
                    )}
                </div>
            );

        case "datetime":
            return (
                // TODO
                <></>
            );

        default:
            return null;
    }
}
