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
    timeMode: LayoutTimeMode;
    dateFrom: string;
    dateTo: string;
    daysOfWeek: string[];
    timeFrom: string;
    timeTo: string;
    summary: string;
    onFormChange: (
        updates: Partial<{
            alwaysActive: boolean;
            timeMode: LayoutTimeMode;
            dateFrom: string;
            dateTo: string;
            daysOfWeek: string[];
            timeFrom: string;
            timeTo: string;
        }>
    ) => void;
}

export function SchedulingSection({
    alwaysActive,
    timeMode,
    dateFrom,
    dateTo,
    daysOfWeek,
    timeFrom,
    timeTo,
    summary,
    onFormChange
}: SchedulingSectionProps) {
    const handleToggleAlways = (checked: boolean) => {
        onFormChange({
            alwaysActive: checked,
            timeMode: checked ? "always" : "window"
        });
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
                    <div className={styles.sectionGrid}>
                        <DateInput
                            label="Data inizio"
                            value={dateFrom}
                            onChange={event => onFormChange({ dateFrom: event.target.value })}
                        />
                        <DateInput
                            label="Data fine"
                            value={dateTo}
                            onChange={event => onFormChange({ dateTo: event.target.value })}
                        />
                    </div>

                    <div className={styles.sectionGrid}>
                        <TimeInput
                            label="Dalle ore"
                            value={timeFrom}
                            onChange={event => onFormChange({ timeFrom: event.target.value })}
                        />
                        <TimeInput
                            label="Alle ore"
                            value={timeTo}
                            onChange={event => onFormChange({ timeTo: event.target.value })}
                        />
                    </div>

                    <div className={styles.inlineBlock}>
                        <Text variant="caption" colorVariant="muted">
                            Giorni della settimana
                        </Text>
                        <PillGroupMultiple
                            ariaLabel="Seleziona giorni della settimana"
                            options={DAY_OPTIONS}
                            value={daysOfWeek}
                            onChange={val => onFormChange({ daysOfWeek: [...val] })}
                            layout="auto"
                        />
                    </div>
                </div>
            )}

            <div className={styles.summaryBox}>
                <Text
                    variant="caption"
                    colorVariant="muted"
                    weight={600}
                    className={styles.summaryTitle}
                >
                    RIEPILOGO
                </Text>
                <Text variant="body-sm" colorVariant="muted">
                    {summary}
                </Text>
            </div>
        </section>
    );
}
