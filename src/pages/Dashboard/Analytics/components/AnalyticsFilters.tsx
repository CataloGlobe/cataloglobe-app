import { Select } from "@/components/ui/Select/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import type { V2Activity } from "@/types/activity";
import styles from "../Analytics.module.scss";

export type PeriodKey = "today" | "7d" | "30d";

type Props = {
    activities: V2Activity[];
    selectedActivityId: string;
    onActivityChange: (id: string) => void;
    period: PeriodKey;
    onPeriodChange: (period: PeriodKey) => void;
};

export default function AnalyticsFilters({
    activities,
    selectedActivityId,
    onActivityChange,
    period,
    onPeriodChange
}: Props) {
    return (
        <div className={styles.filtersRow}>
            <div className={styles.businessSelector}>
                <Select
                    label="Sede"
                    value={selectedActivityId}
                    onChange={e => onActivityChange(e.target.value)}
                    options={[
                        { value: "all", label: "Tutte le sedi" },
                        ...activities.map(a => ({
                            value: a.id,
                            label: a.name
                        }))
                    ]}
                />
            </div>
            <SegmentedControl<PeriodKey>
                value={period}
                onChange={onPeriodChange}
                options={[
                    { value: "today", label: "Oggi" },
                    { value: "7d", label: "7 giorni" },
                    { value: "30d", label: "30 giorni" }
                ]}
            />
        </div>
    );
}
