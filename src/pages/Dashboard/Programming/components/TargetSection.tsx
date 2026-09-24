import { TextInput } from "@/components/ui/Input/TextInput";
import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import { ActivityMultiSelect } from "@/components/ui/ActivityMultiSelect/ActivityMultiSelect";
import { ChipGroupMultiple } from "@/components/ui/Chip/ChipGroup";
import Text from "@/components/ui/Text/Text";
import { LayoutRuleOption } from "@/services/supabase/layoutScheduling";
import styles from "../ProgrammingRuleDetail.module.scss";

export type TargetMode = "all" | "activities" | "groups";

interface TargetSectionProps {
    name: string;
    targetMode: TargetMode;
    activityIds: string[];
    groupIds: string[];
    tenantActivities: LayoutRuleOption[];
    tenantGroups: LayoutRuleOption[];
    /** L'azienda: `ActivityMultiSelect` la chiede, le sedi arrivano già da `tenantActivities`. */
    tenantId: string;
    onFormChange: (
        updates: Partial<{
            name: string;
            targetMode: TargetMode;
            activityIds: string[];
            groupIds: string[];
        }>
    ) => void;
    /** Errore del nome (`validateRuleForm`), sotto il campo. */
    nameError?: string;
    onNameBlur?: () => void;
}

// ─── TargetSection ─────────────────────────────────────────────────────────────

export function TargetSection({
    name,
    targetMode,
    activityIds,
    groupIds,
    tenantActivities,
    tenantGroups,
    tenantId,
    onFormChange,
    nameError,
    onNameBlur
}: TargetSectionProps) {
    const handleModeChange = (newMode: TargetMode) => {
        if (newMode === "all") {
            onFormChange({ targetMode: "all", activityIds: [], groupIds: [] });
        } else if (newMode === "activities") {
            onFormChange({ targetMode: "activities", groupIds: [] });
        } else {
            onFormChange({ targetMode: "groups", activityIds: [] });
        }
    };

    const modeOptions = [
        { value: "all", label: "Tutte le sedi", description: "Anche quelle che aggiungerai." },
        { value: "activities", label: "Alcune sedi", description: "Scegli le sedi una per una." },
        { value: "groups", label: "Gruppi di sedi", description: "Vale per le sedi del gruppo, anche se il gruppo cambia." }
    ];

    return (
        <section className={styles.sectionCard}>
            <Text as="h3" variant="title-sm">
                Dove si applica
            </Text>

            <TextInput
                id="rule-field-name"
                label="Nome"
                value={name}
                onChange={event => onFormChange({ name: event.target.value })}
                onBlur={onNameBlur}
                error={nameError}
                required
            />

            <RadioGroup
                label="Si applica a"
                variant="card"
                value={targetMode}
                onChange={value => handleModeChange(value as TargetMode)}
                options={modeOptions}
            />

            {targetMode === "activities" && (
                <ActivityMultiSelect
                    tenantId={tenantId}
                    activities={tenantActivities}
                    callerScopedActivityIds={[]}
                    callerIsTenantWide
                    required={false}
                    value={activityIds}
                    onChange={ids => onFormChange({ activityIds: ids })}
                />
            )}

            {targetMode === "groups" &&
                (tenantGroups.length > 0 ? (
                    <ChipGroupMultiple
                        label="Gruppi di sedi"
                        ariaLabel="Gruppi di sedi"
                        options={tenantGroups.map(group => ({ value: group.id, label: group.name }))}
                        value={groupIds}
                        onChange={ids => onFormChange({ groupIds: [...ids] })}
                        layout="auto"
                    />
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun gruppo di sedi: si creano in Sedi.
                    </Text>
                ))}
        </section>
    );
}
