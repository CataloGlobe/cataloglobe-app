import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { Pill } from "@/components/ui/Pill/Pill";
import { BusinessScheduleRow } from "@/services/supabase/schedules";
import styles from "./BusinessCollectionSchedule.module.scss";

type CollectionOption = {
    id: string;
    name: string;
    kind: "standard" | "special";
};

export type DraftRule = {
    collectionId: string | null;
    start: string;
    end: string;
    days: number[];
    allDay: boolean;
};

export type ScheduleRuleDrawerRef = {
    submit: () => void;
    canSubmit: () => boolean;
};

type ScheduleRuleDrawerProps =
    | {
          mode: "add";
          slot: "primary" | "overlay";
          collections: CollectionOption[];
          onSubmit: (draft: DraftRule) => void;
          onCancel: () => void;
      }
    | {
          mode: "edit";
          rule: BusinessScheduleRow;
          collections: CollectionOption[];
          onSubmit: (draft: DraftRule) => void;
          onCancel: () => void;
      };

const DEFAULT_DRAFT: DraftRule = {
    collectionId: null,
    start: "09:00",
    end: "18:00",
    days: [1, 2, 3, 4, 5],
    allDay: false
};

const DAY_LABELS = ["D", "L", "M", "M", "G", "V", "S"];
const DAY_UI_ORDER = [1, 2, 3, 4, 5, 6, 0];

function toggleDay(days: number[], day: number) {
    return days.includes(day) ? days.filter(d => d !== day) : [...days, day];
}

const ScheduleRuleDrawer = forwardRef<ScheduleRuleDrawerRef, ScheduleRuleDrawerProps>(
    (props, ref) => {
        const mode = props.mode;
        const ruleId = props.mode === "edit" ? props.rule.id : null;
        const slot = props.mode === "add" ? props.slot : null;

        const [draft, setDraft] = useState<DraftRule>(DEFAULT_DRAFT);

        useEffect(() => {
            if (props.mode === "edit") {
                const rule = props.rule;
                const isAllDay = rule.start_time.slice(0, 5) === rule.end_time.slice(0, 5);

                setDraft({
                    collectionId: rule.collection.id,
                    start: rule.start_time.slice(0, 5),
                    end: rule.end_time.slice(0, 5),
                    days: rule.days_of_week,
                    allDay: isAllDay
                });
            } else {
                setDraft(DEFAULT_DRAFT);
            }
        }, [mode, ruleId, slot]);

        const availableCollections = useMemo(() => {
            if (props.mode === "add") {
                return props.collections.filter(c =>
                    props.slot === "primary" ? c.kind === "standard" : c.kind === "special"
                );
            }

            // edit: mantieni il tipo corretto
            const slot = props.rule.slot;
            return props.collections.filter(c =>
                slot === "primary" ? c.kind === "standard" : c.kind === "special"
            );
        }, [props]);

        const canSubmit =
            !!draft.collectionId &&
            draft.days.length > 0 &&
            (draft.allDay || draft.start !== draft.end);

        useImperativeHandle(ref, () => ({
            submit() {
                if (!canSubmit) return;
                props.onSubmit(draft);
            },
            canSubmit() {
                return canSubmit;
            }
        }));

        return (
            <div className={styles.wrapper}>
                <div className={styles.form}>
                    <Select
                        label="Collezione"
                        value={draft.collectionId ?? ""}
                        onChange={e =>
                            setDraft(p => ({
                                ...p,
                                collectionId: e.target.value || null
                            }))
                        }
                        options={[
                            { value: "", label: "Seleziona…" },
                            ...availableCollections.map(c => ({
                                value: c.id,
                                label: c.name
                            }))
                        ]}
                    />

                    <div>
                        <Text variant="caption" colorVariant="muted">
                            Giorni
                        </Text>
                        <div className={styles.days}>
                            {DAY_UI_ORDER.map(day => {
                                const active = draft.days.includes(day);
                                return (
                                    <Pill
                                        key={day}
                                        label={DAY_LABELS[day]}
                                        shape="circle"
                                        active={active}
                                        onClick={() =>
                                            setDraft(p => ({
                                                ...p,
                                                days: toggleDay(p.days, day)
                                            }))
                                        }
                                    />
                                );
                            })}
                        </div>
                    </div>

                    <CheckboxInput
                        label="Tutto il giorno"
                        checked={draft.allDay}
                        description="Mostra per l'intera giornata"
                        onChange={e =>
                            setDraft(p => ({
                                ...p,
                                allDay: e.target.checked,
                                start: e.target.checked ? "00:00" : p.start,
                                end: e.target.checked ? "00:00" : p.end
                            }))
                        }
                    />

                    <div className={styles.timeRow}>
                        <TimeInput
                            label="Orario inizio"
                            value={draft.start}
                            disabled={draft.allDay}
                            onChange={e => setDraft(p => ({ ...p, start: e.target.value }))}
                        />
                        <TimeInput
                            label="Orario fine"
                            value={draft.end}
                            disabled={draft.allDay}
                            onChange={e => setDraft(p => ({ ...p, end: e.target.value }))}
                        />
                    </div>
                </div>
            </div>
        );
    }
);

export default ScheduleRuleDrawer;
