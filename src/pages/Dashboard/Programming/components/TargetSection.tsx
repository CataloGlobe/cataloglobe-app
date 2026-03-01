import { Switch } from "@/components/ui/Switch/Switch";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { RuleType, LayoutRuleOption } from "@/services/supabase/v2/layoutScheduling";
import styles from "../ProgrammingRuleDetail.module.scss";

type TargetMode = "all_activities" | "activity_group" | "specific_activity";

interface TargetSectionProps {
    name: string;
    ruleType: RuleType;
    targetMode: TargetMode;
    activityId: string;
    activityGroupId: string;
    tenantActivities: LayoutRuleOption[];
    tenantGroups: LayoutRuleOption[];
    onFormChange: (
        updates: Partial<{
            name: string;
            targetMode: TargetMode;
            activityId: string;
            activityGroupId: string;
        }>
    ) => void;
}

export function TargetSection({
    name,
    ruleType,
    targetMode,
    activityId,
    activityGroupId,
    tenantActivities,
    tenantGroups,
    onFormChange
}: TargetSectionProps) {
    const isAllActivities = targetMode === "all_activities";

    const handleToggleAll = (enabled: boolean) => {
        onFormChange({
            targetMode: enabled ? "all_activities" : "specific_activity"
        });
    };

    return (
        <section className={styles.sectionCard}>
            <Text as="h3" variant="title-sm">
                Target
            </Text>
            <div className={styles.sectionGrid}>
                <TextInput
                    label="Nome regola"
                    value={name}
                    onChange={event => onFormChange({ name: event.target.value })}
                    required
                />

                <Select
                    label="Tipo"
                    value={ruleType}
                    options={[
                        { value: "layout", label: "Layout" },
                        { value: "price", label: "Prezzi" },
                        { value: "visibility", label: "Visibilità" }
                    ]}
                    disabled
                />
            </div>

            <div className={styles.targetControls}>
                <div className={styles.switchRow}>
                    <Text variant="body-sm">Applica a tutte le attività</Text>
                    <Switch checked={isAllActivities} onChange={handleToggleAll} />
                </div>

                {!isAllActivities && (
                    <div className={styles.sectionGrid}>
                        <Select
                            label="Ambito"
                            value={targetMode}
                            onChange={event =>
                                onFormChange({ targetMode: event.target.value as TargetMode })
                            }
                            options={[
                                { value: "activity_group", label: "Gruppo attività" },
                                { value: "specific_activity", label: "Attività specifica" }
                            ]}
                        />

                        {targetMode === "specific_activity" && (
                            <Select
                                label="Attività"
                                value={activityId}
                                onChange={event => onFormChange({ activityId: event.target.value })}
                                options={[
                                    { value: "", label: "Seleziona attività" },
                                    ...tenantActivities.map(activity => ({
                                        value: activity.id,
                                        label: activity.name
                                    }))
                                ]}
                            />
                        )}

                        {targetMode === "activity_group" && (
                            <Select
                                label="Gruppo attività"
                                value={activityGroupId}
                                onChange={event =>
                                    onFormChange({ activityGroupId: event.target.value })
                                }
                                options={[
                                    { value: "", label: "Seleziona gruppo" },
                                    ...tenantGroups.map(group => ({
                                        value: group.id,
                                        label: group.name
                                    }))
                                ]}
                            />
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
