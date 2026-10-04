import { Button } from "@/components/ui/Button/Button";
import { DateInput } from "@/components/ui/Input/DateInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import type { CrmTeamMember } from "@/types/crm";
import type { CallDraft, CallDraftErrors } from "@/utils/crm/agenda";
import { formatCallDay, formatCallTime, romeDayKey } from "@shared/crmCallSlots";
import styles from "../Crm.module.scss";

/**
 * Form puro della telefonata: controllato, nessuna logica di drawer né di
 * salvataggio. Bozza, orari liberi e avvisi arrivano da `CallScheduleDrawer`.
 */

type Props = {
    formId: string;
    draft: CallDraft;
    errors: CallDraftErrors;
    team: CrmTeamMember[];
    /** Orari liberi nelle fasce; null = ancora da leggere. */
    slots: Date[] | null;
    slotsNote: string | null;
    warnings: string[];
    showNote: boolean;
    disabled: boolean;
    onChange: (patch: Partial<CallDraft>) => void;
    onSubmit: () => void;
};

export function CallForm({
    formId,
    draft,
    errors,
    team,
    slots,
    slotsNote,
    warnings,
    showNote,
    disabled,
    onChange,
    onSubmit
}: Props) {
    return (
        <form
            id={formId}
            className={styles.drawerForm}
            noValidate
            onSubmit={e => {
                e.preventDefault();
                onSubmit();
            }}
        >
            <div className={styles.venueNameForm}>
                <Text variant="body-sm" weight={600}>
                    Orari liberi
                </Text>
                {slots === null ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Leggo il calendario…
                    </Text>
                ) : slots.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun orario libero nelle fasce dei prossimi giorni: scegli a mano.
                    </Text>
                ) : (
                    <div className={styles.choiceActions}>
                        {slots.map(slot => {
                            const selected = draft.day === romeDayKey(slot) && draft.time === formatCallTime(slot);
                            return (
                                <Button
                                    key={slot.toISOString()}
                                    type="button"
                                    size="sm"
                                    variant={selected ? "primary" : "secondary"}
                                    disabled={disabled}
                                    onClick={() => onChange({ day: romeDayKey(slot), time: formatCallTime(slot) })}
                                >
                                    {`${formatCallDay(slot)} ${formatCallTime(slot)}`}
                                </Button>
                            );
                        })}
                    </div>
                )}
                {slotsNote && (
                    <Text variant="caption" colorVariant="muted">
                        {slotsNote}
                    </Text>
                )}
            </div>

            <div className={styles.venueNameFields}>
                <DateInput
                    label="Giorno"
                    required
                    value={draft.day}
                    onChange={e => onChange({ day: e.target.value })}
                    error={errors.day}
                    disabled={disabled}
                />
                <TimeInput
                    label="Ora"
                    required
                    step={300}
                    value={draft.time}
                    onChange={e => onChange({ time: e.target.value })}
                    error={errors.time}
                    disabled={disabled}
                />
                <NumberInput
                    label="Durata (minuti)"
                    required
                    min={5}
                    max={120}
                    step={5}
                    value={draft.duration}
                    onChange={e => onChange({ duration: e.target.value })}
                    error={errors.duration}
                    disabled={disabled}
                />
                <Select
                    label="Chi chiama"
                    required
                    value={draft.callerUserId}
                    onChange={e => onChange({ callerUserId: e.target.value })}
                    options={team.map(m => ({ value: m.user_id, label: m.display_name }))}
                    error={errors.callerUserId}
                    disabled={disabled}
                />
            </div>

            {warnings.map(w => (
                <Text key={w} variant="body-sm" colorVariant="warning">
                    {w}
                </Text>
            ))}

            {showNote && (
                <Textarea
                    label="Nota per chi chiama"
                    rows={2}
                    maxLength={500}
                    value={draft.note}
                    onChange={e => onChange({ note: e.target.value })}
                    disabled={disabled}
                />
            )}
        </form>
    );
}
