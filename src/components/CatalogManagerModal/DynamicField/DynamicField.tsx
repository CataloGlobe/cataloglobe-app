import Text from "@/components/ui/Text/Text";
import styles from "./DynamicField.module.scss";
import type { FieldDef } from "@/domain/catalog/fields";
import { TextInput } from "@/components/ui/Input/TextInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { Select } from "@/components/ui/Select/Select";
import { Textarea } from "@/components/ui/Textarea/Textarea";

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
                    <Textarea
                        label={label}
                        required={required}
                        value={value ?? ""}
                        placeholder={placeholder}
                        onChange={e => onChange(e.target.value)}
                        helperText={helpText}
                    />
                </div>
            );

        case "select":
            return (
                <div className={styles.field}>
                    <Select
                        label="Contenuto"
                        value={value ?? ""}
                        onChange={e => onChange(e.target.value)}
                        required={required}
                        options={
                            options
                                ? [
                                      { value: "", label: "Seleziona una categoria" },
                                      ...options.map(opt => ({
                                          value: opt.value,
                                          label: opt.label
                                      }))
                                  ]
                                : [
                                      {
                                          value: "Valore",
                                          label: "Label"
                                      }
                                  ]
                        }
                    />
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
                                <CheckboxInput
                                    key={opt.value}
                                    label={opt.value}
                                    description={opt.label}
                                    checked={checked}
                                    onChange={e => {
                                        const current = Array.isArray(value) ? value : [];
                                        const next = e.target.checked
                                            ? [...current, opt.value]
                                            : current.filter(v => v !== opt.value);
                                        onChange(next);
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            );

        case "switch":
            return (
                <CheckboxInput
                    label={label}
                    checked={Boolean(value)}
                    onChange={e => onChange(e.target.checked)}
                />
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
