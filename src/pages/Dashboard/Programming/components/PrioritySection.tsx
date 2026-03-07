import { NumberInput } from "@/components/ui/Input/NumberInput";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import styles from "../ProgrammingRuleDetail.module.scss";

interface PrioritySectionProps {
    priority: string;
    enabled: boolean;
    onFormChange: (
        updates: Partial<{
            priority: string;
            enabled: boolean;
        }>
    ) => void;
}

export function PrioritySection({ priority, enabled, onFormChange }: PrioritySectionProps) {
    return (
        <section className={styles.sectionCard}>
            <Text as="h3" variant="title-sm">
                Priorità
            </Text>
            <div className={styles.sectionGrid}>
                <NumberInput
                    label="Priorità"
                    value={priority}
                    min={0}
                    step={1}
                    onChange={event => onFormChange({ priority: event.target.value })}
                    helperText="Numero più basso = precedenza più alta"
                />

                <div className={styles.switchRow}>
                    <Text variant="body-sm">Regola abilitata</Text>
                    <Switch checked={enabled} onChange={val => onFormChange({ enabled: val })} />
                </div>
            </div>
        </section>
    );
}
