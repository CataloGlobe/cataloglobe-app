import { useState } from "react";
import { DateInput } from "@/components/ui/Input/DateInput";
import { ChipGroupMultiple } from "@/components/ui/Chip/ChipGroup";
import { Switch } from "@/components/ui/Switch/Switch";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import Text from "@/components/ui/Text/Text";
import { LayoutTimeMode } from "@/services/supabase/layoutScheduling";
import type { RuleFormErrors, RuleFormField } from "@/utils/ruleDetailForm";
import styles from "../ProgrammingRuleDetail.module.scss";

const DAY_OPTIONS = [
    { value: "1", label: "Lun" },
    { value: "2", label: "Mar" },
    { value: "3", label: "Mer" },
    { value: "4", label: "Gio" },
    { value: "5", label: "Ven" },
    { value: "6", label: "Sab" },
    { value: "0", label: "Dom" }
];

interface SchedulingSectionProps {
    alwaysActive: boolean;
    startAt: string;
    endAt: string;
    /** «In certi giorni», dal form: acceso senza giorni è un errore di `validateRuleForm`. */
    daysEnabled: boolean;
    daysOfWeek: string[];
    timeFrom: string;
    timeTo: string;
    onFormChange: (
        updates: Partial<{
            alwaysActive: boolean;
            timeMode: LayoutTimeMode;
            startAt: string;
            endAt: string;
            daysEnabled: boolean;
            daysOfWeek: string[];
            timeFrom: string;
            timeTo: string;
        }>
    ) => void;
    /** Errori di `validateRuleForm`: sui campi, e «Quando» vuoto sulla card. */
    errors?: RuleFormErrors;
    /** Il campo lasciato: da lì in poi il suo errore si vede. */
    onFieldBlur?: (field: RuleFormField) => void;
}

export function SchedulingSection({
    alwaysActive,
    startAt,
    endAt,
    daysEnabled,
    daysOfWeek,
    timeFrom,
    timeTo,
    onFormChange,
    errors = {},
    onFieldBlur
}: SchedulingSectionProps) {

    // Progressive toggle states — initialized from existing prop values
    const [hasPeriod, setHasPeriod] = useState(!!(startAt || endAt));
    const [hasTime, setHasTime] = useState(!!(timeFrom || timeTo));

    const handleToggleAlways = (checked: boolean) => {
        onFormChange({
            alwaysActive: checked,
            timeMode: checked ? "always" : "window"
        });
    };

    const handleTogglePeriod = (checked: boolean) => {
        setHasPeriod(checked);
        if (!checked) onFormChange({ startAt: "", endAt: "" });
    };

    const handleToggleTime = (checked: boolean) => {
        setHasTime(checked);
        if (!checked) onFormChange({ timeFrom: "", timeTo: "" });
    };

    const handleToggleDays = (checked: boolean) => {
        onFormChange(checked ? { daysEnabled: true } : { daysEnabled: false, daysOfWeek: [] });
    };

    return (
        <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
                <Text as="h3" variant="title-sm">
                    Quando
                </Text>
                <div className={styles.switchRow}>
                    <Text variant="body-sm">Sempre attiva</Text>
                    <Switch ariaLabel="Sempre attiva" checked={alwaysActive} onChange={handleToggleAlways} />
                </div>
            </div>

            {errors.when && (
                <Text id="rule-field-when" tabIndex={-1} variant="caption" colorVariant="error">
                    {errors.when}
                </Text>
            )}

            {!alwaysActive && (
                <div className={styles.schedulingGrid}>
                    {/* Step 1 — Periodo */}
                    <div className={styles.inlineBlock}>
                        <div className={styles.switchRow}>
                            <Switch ariaLabel="In un periodo" checked={hasPeriod} onChange={handleTogglePeriod} />
                            <Text variant="body-sm">In un periodo</Text>
                        </div>
                        {hasPeriod && (
                            <>
                                <div className={styles.sectionGrid}>
                                    <DateInput
                                        id="rule-field-startAt"
                                        label="Data di inizio *"
                                        value={startAt}
                                        onChange={event => {
                                            // Un inizio dopo la fine la azzera: la fine si risceglie.
                                            const next = event.target.value;
                                            onFormChange(endAt && next && endAt < next ? { startAt: next, endAt: "" } : { startAt: next });
                                        }}
                                        onBlur={() => onFieldBlur?.("startAt")}
                                        error={errors.startAt}
                                    />
                                    <DateInput
                                        id="rule-field-endAt"
                                        label="Data di fine *"
                                        value={endAt}
                                        min={startAt || undefined}
                                        onChange={event => onFormChange({ endAt: event.target.value })}
                                        onBlur={() => onFieldBlur?.("endAt")}
                                        error={errors.endAt}
                                    />
                                </div>
                                <Text variant="caption" colorVariant="muted">
                                    La regola si attiva e disattiva automaticamente nelle date indicate.
                                </Text>
                            </>
                        )}
                    </div>

                    <div className={styles.schedulingSeparator} />

                    {/* Step 2 — Orario */}
                    <div className={styles.inlineBlock}>
                        <div className={styles.switchRow}>
                            <Switch ariaLabel="In certe ore" checked={hasTime} onChange={handleToggleTime} />
                            <Text variant="body-sm">In certe ore</Text>
                        </div>
                        {hasTime && (
                            <>
                                <div className={styles.sectionGrid}>
                                    <TimeInput
                                        id="rule-field-timeFrom"
                                        label="Ora di inizio"
                                        value={timeFrom}
                                        onChange={event => onFormChange({ timeFrom: event.target.value })}
                                        onBlur={() => onFieldBlur?.("timeFrom")}
                                        error={errors.timeFrom}
                                    />
                                    <TimeInput
                                        id="rule-field-timeTo"
                                        label="Ora di fine"
                                        value={timeTo}
                                        onChange={event => onFormChange({ timeTo: event.target.value })}
                                        onBlur={() => onFieldBlur?.("timeTo")}
                                        error={errors.timeTo}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <div className={styles.schedulingSeparator} />

                    {/* Step 3 — Giorni */}
                    <div className={styles.inlineBlock}>
                        <div className={styles.switchRow}>
                            <Switch ariaLabel="In certi giorni" checked={daysEnabled} onChange={handleToggleDays} />
                            <Text variant="body-sm">
                                In certi giorni
                            </Text>
                        </div>
                        {daysEnabled && (
                            <ChipGroupMultiple
                                ariaLabel="Giorni della settimana"
                                options={DAY_OPTIONS}
                                value={daysOfWeek}
                                onChange={val => onFormChange({ daysOfWeek: [...val] })}
                                layout="auto"
                            />
                        )}
                    </div>
                </div>
            )}

        </section>
    );
}
