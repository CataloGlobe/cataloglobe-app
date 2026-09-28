import { Card } from "@/components/ui/Card/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import type { StoryStatus } from "@/services/supabase/stories";
import type { AppearanceActivity } from "@/utils/ruleAppearance";
import styles from "../Stories.module.scss";

type Scope = "tenant" | "activity";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
    { value: "tenant", label: "Tutta l'azienda" },
    { value: "activity", label: "Una sede" }
];

type StoryPlacementCardProps = {
    /** null = tutta l'azienda. */
    activityId: string | null;
    onChange: (activityId: string | null) => void;
    activities: readonly AppearanceActivity[];
    status: StoryStatus;
    disabled: boolean;
};

/**
 * «Dove appare» (§34.7, §50.13): la storia è dell'azienda, su ogni sede, o di
 * una sede sola — «la storia del nostro forno» è di Garbagnate. Nella bozza
 * della pagina, come il resto; la frase sotto dice dove finisce.
 */
export function StoryPlacementCard({ activityId, onChange, activities, status, disabled }: StoryPlacementCardProps) {
    const scope: Scope = activityId ? "activity" : "tenant";
    const seat = activities.find(activity => activity.id === activityId);
    const where = activityId
        ? `solo nella pagina di ${seat?.name ?? "una sede che non c'è più"}`
        : "su tutte le sedi pubblicate";
    const sentence = status === "published" ? `Compare ${where}.` : `È una bozza: pubblicata, comparirà ${where}.`;

    const handleScope = (next: Scope) => {
        if (next === "tenant") return onChange(null);
        const first = activities.find(activity => activity.status === "active") ?? activities[0];
        if (first) onChange(first.id);
    };

    return (
        <Card title="Dove appare" subtitle="Una storia dell'azienda compare su ogni sede; una di una sede, solo nella sua pagina.">
            <div className={styles.placement}>
                <SegmentedControl<Scope>
                    value={scope}
                    onChange={handleScope}
                    options={SCOPE_OPTIONS}
                    size="sm"
                />
                {scope === "activity" && (
                    <Select
                        label="Sede"
                        value={activityId ?? ""}
                        disabled={disabled}
                        onChange={event => onChange(event.target.value || null)}
                        options={activities.map(activity => ({
                            value: activity.id,
                            label: activity.status === "active" ? activity.name : `${activity.name} (sospesa)`
                        }))}
                    />
                )}
                <Text variant="body-sm" colorVariant="muted">
                    {sentence}
                </Text>
            </div>
        </Card>
    );
}
