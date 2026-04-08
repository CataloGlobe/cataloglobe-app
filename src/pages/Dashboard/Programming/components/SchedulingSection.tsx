import { useState } from "react";
import { DateInput } from "@/components/ui/Input/DateInput";
import { PillGroupMultiple } from "@/components/ui/PillGroup/PillGroupMultiple";
import { Switch } from "@/components/ui/Switch/Switch";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import Text from "@/components/ui/Text/Text";
import { LayoutTimeMode } from "@/services/supabase/layoutScheduling";
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
    daysOfWeek: string[];
    timeFrom: string;
    timeTo: string;
    onFormChange: (
        updates: Partial<{
            alwaysActive: boolean;
            timeMode: LayoutTimeMode;
            startAt: string;
            endAt: string;
            daysOfWeek: string[];
            timeFrom: string;
            timeTo: string;
        }>
    ) => void;
}

export function SchedulingSection({
    alwaysActive,
    startAt,
    endAt,
    daysOfWeek,
    timeFrom,
    timeTo,
    onFormChange
}: SchedulingSectionProps) {
    const [startAtError, setStartAtError] = useState("");
    const [endAtError, setEndAtError] = useState("");
    const [timeFromTouched, setTimeFromTouched] = useState(false);
    const [timeToTouched, setTimeToTouched] = useState(false);

    // Progressive toggle states — initialized from existing prop values
    const [hasPeriod, setHasPeriod] = useState(!!(startAt || endAt));
    const [hasTime, setHasTime] = useState(!!(timeFrom || timeTo));
    const [hasDays, setHasDays] = useState(daysOfWeek.length > 0);

    const today = new Date().toISOString().split("T")[0];
    const timeOrderError =
        timeFromTouched && timeToTouched && timeFrom && timeTo && timeTo <= timeFrom
            ? "L'orario di fine deve essere successivo all'orario di inizio"
            : null;

    const validateEndAt = (end: string, start: string) => {
        if (!end) { setEndAtError(""); return; }
        if (end < today) { setEndAtError("La data di fine non può essere nel passato"); return; }
        if (start && end < start) { setEndAtError("La data di fine deve essere successiva alla data di inizio"); return; }
        setEndAtError("");
    };

    const handleStartAtBlur = () => {
        if (startAt && startAt < today) {
            setStartAtError("La data di inizio non può essere nel passato");
        } else {
            setStartAtError("");
        }
        if (endAt) validateEndAt(endAt, startAt);
    };

    const handleEndAtBlur = () => {
        validateEndAt(endAt, startAt);
    };

    const handleToggleAlways = (checked: boolean) => {
        onFormChange({
            alwaysActive: checked,
            timeMode: checked ? "always" : "window"
        });
    };

    const handleTogglePeriod = (checked: boolean) => {
        setHasPeriod(checked);
        if (checked) {
            // Disable and reset days when period is active
            setHasDays(false);
            onFormChange({ daysOfWeek: [] });
        } else {
            setStartAtError("");
            setEndAtError("");
            onFormChange({ startAt: "", endAt: "" });
        }
    };

    const handleToggleTime = (checked: boolean) => {
        setHasTime(checked);
        if (!checked) {
            setTimeFromTouched(false);
            setTimeToTouched(false);
            onFormChange({ timeFrom: "", timeTo: "" });
        }
    };

    const handleToggleDays = (checked: boolean) => {
        setHasDays(checked);
        if (!checked) {
            onFormChange({ daysOfWeek: [] });
        }
    };

    return (
        <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
                <Text as="h3" variant="title-sm">
                    Programmazione
                </Text>
                <div className={styles.switchRow}>
                    <Text variant="body-sm">Sempre attiva</Text>
                    <Switch checked={alwaysActive} onChange={handleToggleAlways} />
                </div>
            </div>

            {!alwaysActive && (
                <div className={styles.schedulingGrid}>
                    {/* Step 1 — Periodo */}
                    <div className={styles.inlineBlock}>
                        <div className={styles.switchRow}>
                            <Switch checked={hasPeriod} onChange={handleTogglePeriod} />
                            <Text variant="body-sm">Vale solo in un periodo specifico?</Text>
                        </div>
                        {hasPeriod && (
                            <>
                                <div className={styles.sectionGrid}>
                                    <div>
                                        <DateInput
                                            label="Data inizio"
                                            value={startAt}
                                            onChange={event => {
                                                const newStart = event.target.value;
                                                if (endAt && newStart && endAt < newStart) {
                                                    onFormChange({ startAt: newStart, endAt: "" });
                                                    setEndAtError("");
                                                } else {
                                                    onFormChange({ startAt: newStart });
                                                }
                                            }}
                                            onBlur={handleStartAtBlur}
                                        />
                                        {startAtError && (
                                            <Text variant="caption" colorVariant="error">{startAtError}</Text>
                                        )}
                                    </div>
                                    <div>
                                        <DateInput
                                            label="Data fine"
                                            value={endAt}
                                            min={startAt || undefined}
                                            onChange={event => onFormChange({ endAt: event.target.value })}
                                            onBlur={handleEndAtBlur}
                                        />
                                        {endAtError && (
                                            <Text variant="caption" colorVariant="error">{endAtError}</Text>
                                        )}
                                    </div>
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
                            <Switch checked={hasTime} onChange={handleToggleTime} />
                            <Text variant="body-sm">Vale solo in certi orari?</Text>
                        </div>
                        {hasTime && (
                            <>
                                <div className={styles.sectionGrid}>
                                    <TimeInput
                                        label="Orario inizio"
                                        value={timeFrom}
                                        onChange={event => onFormChange({ timeFrom: event.target.value })}
                                        onBlur={() => setTimeFromTouched(true)}
                                    />
                                    <TimeInput
                                        label="Orario fine"
                                        value={timeTo}
                                        onChange={event => onFormChange({ timeTo: event.target.value })}
                                        onBlur={() => setTimeToTouched(true)}
                                    />
                                </div>
                                {timeOrderError && (
                                    <Text variant="caption" colorVariant="error">
                                        {timeOrderError}
                                    </Text>
                                )}
                            </>
                        )}
                    </div>

                    <div className={styles.schedulingSeparator} />

                    {/* Step 3 — Giorni */}
                    <div className={styles.inlineBlock}>
                        <div className={styles.switchRow}>
                            <Switch
                                checked={hasDays}
                                onChange={handleToggleDays}
                                disabled={hasPeriod}
                            />
                            <Text
                                variant="body-sm"
                                colorVariant={hasPeriod ? "muted" : undefined}
                            >
                                Vale solo in certi giorni della settimana?
                            </Text>
                        </div>
                        {hasPeriod && (
                            <Text variant="caption" colorVariant="muted">
                                I giorni sono già definiti dal periodo selezionato.
                            </Text>
                        )}
                        {hasDays && !hasPeriod && (
                            <div className={styles.daysCompact}>
                                <PillGroupMultiple
                                    ariaLabel="Seleziona giorni della settimana"
                                    options={DAY_OPTIONS}
                                    value={daysOfWeek}
                                    onChange={val => onFormChange({ daysOfWeek: [...val] })}
                                    layout="auto"
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

        </section>
    );
}
