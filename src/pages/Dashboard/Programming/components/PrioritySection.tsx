import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { PRIORITY_LEVEL_OPTIONS } from "@utils/priorityUtils";
import type { PriorityLevel } from "@utils/priorityUtils";
import cardStyles from "./PrioritySection.module.scss";
import styles from "../ProgrammingRuleDetail.module.scss";

interface PrioritySectionProps {
    priorityLevel: PriorityLevel;
    enabled: boolean;
    onFormChange: (
        updates: Partial<{
            priorityLevel: PriorityLevel;
            enabled: boolean;
        }>
    ) => void;
}

export function PrioritySection({ priorityLevel, enabled, onFormChange }: PrioritySectionProps) {
    return (
        <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
                <Text as="h3" variant="title-sm">
                    Priorità
                </Text>
                <div className={styles.switchRow}>
                    <Text variant="body-sm">Regola abilitata</Text>
                    <Switch checked={enabled} onChange={val => onFormChange({ enabled: val })} />
                </div>
            </div>

            <div className={cardStyles.optionGrid}>
                {PRIORITY_LEVEL_OPTIONS.map(option => {
                    const isSelected = option.value === priorityLevel;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            className={[
                                cardStyles.optionCard,
                                isSelected ? cardStyles.optionCardSelected : ""
                            ].join(" ")}
                            onClick={() => onFormChange({ priorityLevel: option.value })}
                        >
                            <span
                                className={[
                                    cardStyles.optionCardLabel,
                                    isSelected ? cardStyles.optionCardLabelSelected : ""
                                ].join(" ")}
                            >
                                {option.label}
                            </span>
                            <span className={cardStyles.optionCardDescription}>
                                {option.description}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
