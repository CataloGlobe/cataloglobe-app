import React from "react";
import { IconEdit } from "@tabler/icons-react";
import { Card, Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import pageStyles from "../../ActivityDetailPage.module.scss";
import styles from "./HoursServices.module.scss";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

interface ActivityHoursSectionProps {
    hours: V2ActivityHours[];
    activity: V2Activity;
    onEditRequest: () => void;
}

function formatDaySlots(slots: V2ActivityHours[]): React.ReactNode {
    if (slots.length === 0) {
        return <span className={styles.notConfigured}>&mdash;</span>;
    }
    if (slots[0].is_closed) {
        return <span className={styles.closedBadge}>Chiuso</span>;
    }
    const parts = slots
        .filter(s => !s.is_closed && s.opens_at && s.closes_at)
        .map(s => `${s.opens_at!.slice(0, 5)} – ${s.closes_at!.slice(0, 5)}`);
    if (parts.length === 0) {
        return <span className={styles.notConfigured}>&mdash;</span>;
    }
    return parts.join(" · ");
}

export const ActivityHoursSection: React.FC<ActivityHoursSectionProps> = ({
    hours,
    activity,
    onEditRequest
}) => {
    const hasHours = hours.length > 0;

    // Group by day_of_week
    const byDay = new Map<number, V2ActivityHours[]>();
    for (const h of hours) {
        const list = byDay.get(h.day_of_week) ?? [];
        list.push(h);
        byDay.set(h.day_of_week, list);
    }

    return (
        <Card className={pageStyles.card}>
            <div className={styles.cardHeader}>
                <div className={styles.headerLeft}>
                    <h3 className={styles.sectionTitle}>Orari di apertura</h3>
                    {activity.hours_public && (
                        <span className={styles.visibilityHint}>Visibili nella pagina pubblica</span>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<IconEdit size={16} />}
                    onClick={onEditRequest}
                >
                    Modifica
                </Button>
            </div>
            <div className={pageStyles.cardContent}>
                {!hasHours ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun orario configurato. Clicca "Modifica" per impostare gli orari.
                    </Text>
                ) : (
                    <table className={styles.hoursTable}>
                        <thead>
                            <tr>
                                <th className={styles.hoursTableHead}>Giorno</th>
                                <th className={styles.hoursTableHead}>Orario</th>
                            </tr>
                        </thead>
                        <tbody>
                            {DAY_NAMES.map((name, i) => (
                                <tr key={i} className={styles.hoursTableRow}>
                                    <td className={styles.hoursTableDay}>{name}</td>
                                    <td className={styles.hoursTableTime}>
                                        {formatDaySlots(byDay.get(i) ?? [])}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </Card>
    );
};
