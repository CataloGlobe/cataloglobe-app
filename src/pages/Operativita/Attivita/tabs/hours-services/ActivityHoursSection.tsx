import React, { useCallback } from "react";
import { IconEdit } from "@tabler/icons-react";
import { Card, Button } from "@/components/ui";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { upsertActivityHours } from "@/services/supabase/activityHours";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import { useToast } from "@/context/Toast/ToastContext";
import pageStyles from "../../ActivityDetailPage.module.scss";
import styles from "./HoursServices.module.scss";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

interface ActivityHoursSectionProps {
    hours: V2ActivityHours[];
    activity: V2Activity;
    tenantId: string;
    onEditRequest: () => void;
    onSaved: () => void;
}

export const ActivityHoursSection: React.FC<ActivityHoursSectionProps> = ({
    hours,
    activity,
    tenantId,
    onEditRequest,
    onSaved
}) => {
    const { showToast } = useToast();
    const hasHours = hours.length > 0;
    const allPublic = hasHours && hours.every(h => h.hours_public);

    const handlePublicToggle = useCallback(async (checked: boolean) => {
        const updatedRows = hours.map(h => ({
            day_of_week: h.day_of_week,
            opens_at: h.opens_at,
            closes_at: h.closes_at,
            is_closed: h.is_closed,
            hours_public: checked
        }));
        try {
            await upsertActivityHours(tenantId, activity.id, updatedRows);
            showToast({ message: "Visibilità orari aggiornata.", type: "success" });
            await onSaved();
        } catch {
            showToast({ message: "Impossibile aggiornare la visibilità.", type: "error" });
        }
    }, [hours, tenantId, activity.id, onSaved, showToast]);

    const formatTime = (opens: string | null, closes: string | null, isClosed: boolean): React.ReactNode => {
        if (isClosed) {
            return <span className={styles.closedBadge}>Chiuso</span>;
        }
        if (!opens && !closes) {
            return <span className={styles.notConfigured}>&mdash;</span>;
        }
        return `${opens ?? "—"} – ${closes ?? "—"}`;
    };

    return (
        <Card className={pageStyles.card}>
            <div className={pageStyles.cardHeader}>
                <div className={styles.headerLeft}>
                    <h3>Orari di apertura</h3>
                    <div className={styles.toggleGroup}>
                        <Switch
                            label="Mostra nella pagina pubblica"
                            checked={allPublic}
                            onChange={handlePublicToggle}
                            disabled={!hasHours}
                        />
                        {!hasHours && (
                            <Text variant="caption" colorVariant="muted">
                                Configura gli orari per abilitare la visibilità pubblica
                            </Text>
                        )}
                    </div>
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
                            {DAY_NAMES.map((name, i) => {
                                const row = hours.find(h => h.day_of_week === i);
                                return (
                                    <tr key={i} className={styles.hoursTableRow}>
                                        <td className={styles.hoursTableDay}>{name}</td>
                                        <td className={styles.hoursTableTime}>
                                            {row
                                                ? formatTime(row.opens_at, row.closes_at, row.is_closed)
                                                : <span className={styles.notConfigured}>&mdash;</span>
                                            }
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </Card>
    );
};
