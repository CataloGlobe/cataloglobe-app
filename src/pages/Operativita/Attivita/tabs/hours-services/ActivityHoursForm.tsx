import React, { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/Switch/Switch";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { upsertActivityHours } from "@/services/supabase/activityHours";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import { useToast } from "@/context/Toast/ToastContext";
import formStyles from "./HoursServices.module.scss";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

interface HourRow {
    day_of_week: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
    hours_public: boolean;
}

function buildDefaultRows(): HourRow[] {
    return Array.from({ length: 7 }, (_, i) => ({
        day_of_week: i,
        opens_at: null,
        closes_at: null,
        is_closed: false,
        hours_public: false
    }));
}

function hoursToRows(hours: V2ActivityHours[]): HourRow[] {
    const defaults = buildDefaultRows();
    for (const h of hours) {
        const row = defaults[h.day_of_week];
        if (row) {
            row.opens_at = h.opens_at;
            row.closes_at = h.closes_at;
            row.is_closed = h.is_closed;
            row.hours_public = h.hours_public;
        }
    }
    return defaults;
}

type ActivityHoursFormProps = {
    formId: string;
    entityData: V2ActivityHours[];
    activity: V2Activity;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function ActivityHoursForm({
    formId,
    entityData,
    activity,
    tenantId,
    onSuccess,
    onSavingChange
}: ActivityHoursFormProps) {
    const { showToast } = useToast();
    const [rows, setRows] = useState<HourRow[]>(() => hoursToRows(entityData));

    useEffect(() => {
        setRows(hoursToRows(entityData));
    }, [entityData]);

    const updateRow = useCallback((day: number, patch: Partial<HourRow>) => {
        setRows(prev => prev.map(r => (r.day_of_week === day ? { ...r, ...patch } : r)));
    }, []);

    const handleClosedToggle = useCallback((day: number, checked: boolean) => {
        updateRow(day, {
            is_closed: checked,
            ...(checked ? { opens_at: null, closes_at: null } : {})
        });
    }, [updateRow]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        onSavingChange(true);
        try {
            await upsertActivityHours(tenantId, activity.id, rows);
            showToast({ message: "Orari salvati con successo.", type: "success" });
            onSuccess();
        } catch {
            showToast({ message: "Errore nel salvataggio degli orari.", type: "error" });
        } finally {
            onSavingChange(false);
        }
    }, [tenantId, activity.id, rows, onSuccess, onSavingChange, showToast]);

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div className={formStyles.hoursFormLayout}>
                <table className={formStyles.hoursFormTable}>
                    <thead>
                        <tr>
                            <th className={formStyles.hoursFormHead}>Giorno</th>
                            <th className={formStyles.hoursFormHead}>Chiuso</th>
                            <th className={formStyles.hoursFormHead}>Apertura</th>
                            <th className={formStyles.hoursFormHead}>Chiusura</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => (
                            <tr key={row.day_of_week} className={formStyles.hoursFormRow}>
                                <td className={formStyles.hoursFormDay}>
                                    {DAY_NAMES[row.day_of_week]}
                                </td>
                                <td className={formStyles.hoursFormCell}>
                                    <Switch
                                        checked={row.is_closed}
                                        onChange={checked => handleClosedToggle(row.day_of_week, checked)}
                                    />
                                </td>
                                <td className={formStyles.hoursFormTimeCell}>
                                    <TimeInput
                                        value={row.opens_at ?? ""}
                                        onChange={e =>
                                            updateRow(row.day_of_week, {
                                                opens_at: e.target.value || null
                                            })
                                        }
                                        disabled={row.is_closed}
                                    />
                                </td>
                                <td className={formStyles.hoursFormTimeCell}>
                                    <TimeInput
                                        value={row.closes_at ?? ""}
                                        onChange={e =>
                                            updateRow(row.day_of_week, {
                                                closes_at: e.target.value || null
                                            })
                                        }
                                        disabled={row.is_closed}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </form>
    );
}
