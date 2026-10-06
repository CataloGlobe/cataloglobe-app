import { TextInput } from "@/components/ui/Input/TextInput";
import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import { ChipPicker } from "@/components/ui/ChipPicker";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
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
        { value: "activities", label: "Sedi specifiche", description: "Scegli le sedi una per una." },
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

            {/* RG1: le scelte come chip, la scelta in un pannello (pattern T1). */}
            {targetMode === "activities" && (
                <ChipPicker
                    options={tenantActivities.map(activity => ({
                        id: activity.id,
                        name: activity.name,
                        badge: activity.status === "inactive" ? <StatusBadge variant="neutral" label="Sospesa" /> : undefined
                    }))}
                    value={activityIds}
                    onChange={ids => onFormChange({ activityIds: ids })}
                    editLabel="Modifica sedi"
                    title="Sedi"
                    emptyText="Nessuna sede scelta."
                    searchPlaceholder="Cerca una sede"
                />
            )}

            {targetMode === "groups" &&
                (tenantGroups.length > 0 ? (
                    <ChipPicker
                        options={tenantGroups.map(group => ({ id: group.id, name: group.name }))}
                        value={groupIds}
                        onChange={ids => onFormChange({ groupIds: ids })}
                        editLabel="Modifica gruppi"
                        title="Gruppi di sedi"
                        emptyText="Nessun gruppo scelto."
                        searchPlaceholder="Cerca un gruppo"
                    />
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun gruppo di sedi: si creano in Sedi.
                    </Text>
                ))}
        </section>
    );
}
