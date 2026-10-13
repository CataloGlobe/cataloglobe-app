import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { SettingRow } from "@/components/ui/SettingRow";
import { ChipPicker } from "@/components/ui/ChipPicker";
import { Badge } from "@/components/ui/Badge/Badge";
import type { StoryStatus } from "@/services/supabase/stories";
import type { AppearanceActivity } from "@/utils/ruleAppearance";
import styles from "../Stories.module.scss";

type Scope = "tenant" | "activity";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
    { value: "tenant", label: "Tutte le sedi" },
    { value: "activity", label: "Una sede" }
];

type StoryPlacementCardProps = {
    /** null = tutte le sedi. */
    activityId: string | null;
    onChange: (activityId: string | null) => void;
    activities: readonly AppearanceActivity[];
    status: StoryStatus;
    disabled: boolean;
    /** La riga «Scheda di un prodotto»: il chip del prodotto e «Cambia». */
    productControl: ReactNode;
};

/**
 * «Dove si vede» (correzioni UI SD2; §34.7, §50.13): una card a righe. La
 * pagina pubblica è di tutte le sedi o di una sola («la storia del nostro
 * forno» è di Garbagnate), scelta in un pannello a scelta singola; la scheda
 * di un prodotto è il prodotto collegato. Il modello dati non cambia: una
 * sede, un prodotto. Tutto nella bozza della pagina.
 */
export function StoryPlacementCard({
    activityId,
    onChange,
    activities,
    status,
    disabled,
    productControl
}: StoryPlacementCardProps) {
    const scope: Scope = activityId ? "activity" : "tenant";
    const seat = activities.find(activity => activity.id === activityId);
    const where = activityId
        ? `solo nella pagina di ${seat?.name ?? "una sede che non c'è più"}`
        : "su tutte le sedi online";
    const sentence = status === "published" ? `Compare ${where}.` : `È una bozza: quando la metti online, comparirà ${where}.`;

    const handleScope = (next: Scope) => {
        if (next === "tenant") return onChange(null);
        const first = activities.find(activity => activity.status === "active") ?? activities[0];
        if (first) onChange(first.id);
    };

    return (
        <Card title="Dove si vede" flush>
            <SettingRow
                label="Pagina pubblica"
                description={sentence}
                control={
                    <div className={styles.placement}>
                        <SegmentedControl<Scope>
                            value={scope}
                            onChange={handleScope}
                            options={SCOPE_OPTIONS}
                            size="sm"
                        />
                        {scope === "activity" && (
                            <ChipPicker
                                single
                                options={activities.map(activity => ({
                                    id: activity.id,
                                    name: activity.name,
                                    badge: activity.status === "active" ? undefined : <Badge variant="neutral">Sospesa</Badge>
                                }))}
                                value={activityId ? [activityId] : []}
                                onChange={ids => {
                                    if (ids[0]) onChange(ids[0]);
                                }}
                                editLabel="Modifica"
                                title="Sede"
                                emptyText="Nessuna sede scelta."
                                searchPlaceholder="Cerca una sede"
                                disabled={disabled}
                            />
                        )}
                    </div>
                }
            />
            <SettingRow
                label="Scheda di un prodotto"
                description="Collegata a un prodotto, la storia compare anche nella sua scheda del menù."
                control={productControl}
            />
        </Card>
    );
}
