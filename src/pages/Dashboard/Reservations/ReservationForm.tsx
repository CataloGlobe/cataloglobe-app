import { type FormEvent, useEffect, useMemo, useState } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { Select } from "@/components/ui/Select/Select";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createReservation,
    updateReservation
} from "@/services/supabase/reservations";
import { listActivityHours } from "@/services/supabase/activityHours";
import { listActivityClosures } from "@/services/supabase/activityClosures";
import {
    canAccept,
    type CapacityReservation
} from "@/utils/reservationCapacity";
import { todayIsoDate } from "@/utils/dateLocal";
import type {
    OpeningHoursEntry,
    UpcomingClosure
} from "@pages/ReservationPage/availability";
import type { V2Reservation } from "@/types/reservation";
import type { V2Activity } from "@/types/activity";
import AdminReservationDatePicker from "./components/AdminReservationDatePicker";
import AdminReservationTimePicker from "./components/AdminReservationTimePicker";
import styles from "./Reservations.module.scss";

interface FormActivity {
    id: V2Activity["id"];
    name: V2Activity["name"];
    reservation_capacity: number | null;
    reservation_duration_minutes: number;
}

interface ReservationFormProps {
    formId: string;
    mode: "create" | "edit";
    tenantId: string;
    /** Sedi su cui il caller ha `reservations.manage`. In create mode: usate
     *  per popolare il Select. In edit mode: solo per risolvere il nome. */
    manageableActivities: FormActivity[];
    /** Prenotazioni del tenant (per il warning over-capacity). */
    allReservations: V2Reservation[];
    /** Riga corrente in edit mode. */
    entityData?: V2Reservation;
    onSuccess: () => void | Promise<void>;
    onSavingChange: (saving: boolean) => void;
}

function normalizeTime(value: string): string {
    if (!value) return "";
    const trimmed = value.length === 5 ? `${value}:00` : value;
    return trimmed;
}

export function ReservationForm({
    formId,
    mode,
    tenantId,
    manageableActivities,
    allReservations,
    entityData,
    onSuccess,
    onSavingChange
}: ReservationFormProps) {
    const { showToast } = useToast();
    const isEditing = mode === "edit";

    const defaultActivityId =
        entityData?.activity_id ??
        (manageableActivities.length > 0 ? manageableActivities[0].id : "");

    const [activityId, setActivityId] = useState(defaultActivityId);
    const [reservationDate, setReservationDate] = useState(entityData?.reservation_date ?? "");
    const [reservationTime, setReservationTime] = useState(
        entityData?.reservation_time ? entityData.reservation_time.slice(0, 5) : ""
    );
    const [partySize, setPartySize] = useState<string>(
        entityData?.party_size ? String(entityData.party_size) : "2"
    );
    const [customerName, setCustomerName] = useState(entityData?.customer_name ?? "");
    const [customerPhone, setCustomerPhone] = useState(entityData?.customer_phone ?? "");
    const [customerEmail, setCustomerEmail] = useState(entityData?.customer_email ?? "");
    const [notes, setNotes] = useState(entityData?.notes ?? "");

    const [nameError, setNameError] = useState<string>();
    const [phoneError, setPhoneError] = useState<string>();
    const [dateError, setDateError] = useState<string>();
    const [timeError, setTimeError] = useState<string>();
    const [partyError, setPartyError] = useState<string>();
    const [activityError, setActivityError] = useState<string>();
    const [emailError, setEmailError] = useState<string>();

    // Venue opening hours + closures fetched on-demand per activity. Used to
    // populate the time-of-day grid in AdminReservationTimePicker. Fetch is
    // best-effort: on failure the picker falls back to the free-form input
    // (operator can still complete the reservation).
    const [hours, setHours] = useState<OpeningHoursEntry[]>([]);
    const [closures, setClosures] = useState<UpcomingClosure[]>([]);
    const [hoursLoading, setHoursLoading] = useState<boolean>(false);
    const [hoursError, setHoursError] = useState<string | undefined>(undefined);

    // Re-sync stato se il drawer viene riusato con un'entita' diversa.
    useEffect(() => {
        if (isEditing && entityData) {
            setActivityId(entityData.activity_id);
            setReservationDate(entityData.reservation_date);
            setReservationTime(entityData.reservation_time.slice(0, 5));
            setPartySize(String(entityData.party_size));
            setCustomerName(entityData.customer_name);
            setCustomerPhone(entityData.customer_phone);
            setCustomerEmail(entityData.customer_email);
            setNotes(entityData.notes ?? "");
        }
    }, [isEditing, entityData]);

    // Fetch hours + closures for the selected activity. Triggered on mount
    // (with default activity) and whenever the operator changes the venue
    // dropdown. V2ActivityHours and V2ActivityClosure are structural supersets
    // of OpeningHoursEntry and UpcomingClosure respectively (extra metadata
    // fields like id/tenant_id), so a thin field-pick mapping yields the
    // exact shape the picker logic expects.
    useEffect(() => {
        if (!tenantId || !activityId) {
            setHours([]);
            setClosures([]);
            setHoursError(undefined);
            setHoursLoading(false);
            return;
        }
        let cancelled = false;
        setHoursLoading(true);
        setHoursError(undefined);
        Promise.all([
            listActivityHours(activityId, tenantId),
            listActivityClosures(activityId, tenantId)
        ])
            .then(([rawHours, rawClosures]) => {
                if (cancelled) return;
                setHours(
                    rawHours.map(h => ({
                        day_of_week: h.day_of_week,
                        slot_index: h.slot_index,
                        opens_at: h.opens_at,
                        closes_at: h.closes_at,
                        is_closed: h.is_closed,
                        closes_next_day: h.closes_next_day
                    }))
                );
                setClosures(
                    rawClosures.map(c => ({
                        closure_date: c.closure_date,
                        end_date: c.end_date,
                        label: c.label,
                        is_closed: c.is_closed,
                        slots: c.slots
                    }))
                );
            })
            .catch(err => {
                if (cancelled) return;
                console.error("[ReservationForm] hours/closures fetch failed:", err);
                setHours([]);
                setClosures([]);
                setHoursError(
                    "Orari sede non disponibili. Puoi inserire l'orario manualmente."
                );
            })
            .finally(() => {
                if (!cancelled) setHoursLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, activityId]);

    const activeActivity = useMemo(
        () => manageableActivities.find(a => a.id === activityId) ?? null,
        [manageableActivities, activityId]
    );
    const activityName = activeActivity?.name ?? null;

    const onlyOneActivity = manageableActivities.length === 1;

    // Non-blocking over-capacity warning. The admin can always save (operator
    // invariant). The warning only renders when capacity is configured AND
    // the candidate would push the peak above it. Skips computation when
    // any required field is missing/malformed.
    const overCapacityWarning = useMemo<string | null>(() => {
        if (!activeActivity) return null;
        const cap = activeActivity.reservation_capacity;
        if (cap === null) return null;
        const dur = activeActivity.reservation_duration_minutes ?? 120;
        const partyNum = parseInt(partySize, 10);
        if (!Number.isFinite(partyNum) || partyNum <= 0) return null;
        const trimmedDate = reservationDate.trim();
        const trimmedTime = reservationTime.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) return null;
        if (!/^\d{2}:\d{2}/.test(trimmedTime)) return null;
        const rows: CapacityReservation[] = allReservations.map(r => ({
            id: r.id,
            activity_id: r.activity_id,
            reservation_date: r.reservation_date,
            reservation_time: r.reservation_time,
            party_size: r.party_size,
            status: r.status
        }));
        const result = canAccept(
            { capacity: cap, durationMin: dur },
            rows,
            {
                id: entityData?.id,
                activity_id: activeActivity.id,
                reservation_date: trimmedDate,
                reservation_time:
                    trimmedTime.length === 5 ? `${trimmedTime}:00` : trimmedTime,
                party_size: partyNum
            }
        );
        if (result.ok) return null;
        return `Questa prenotazione porta a ${result.peakWithCandidate} / ${cap} coperti, oltre la capienza. Salvabile, ma in overbooking.`;
    }, [
        activeActivity,
        allReservations,
        entityData?.id,
        reservationDate,
        reservationTime,
        partySize
    ]);

    const validate = (): boolean => {
        let ok = true;
        setNameError(undefined);
        setPhoneError(undefined);
        setDateError(undefined);
        setTimeError(undefined);
        setPartyError(undefined);
        setActivityError(undefined);
        setEmailError(undefined);

        if (!activityId) {
            setActivityError("Seleziona una sede.");
            ok = false;
        }
        if (!customerName.trim()) {
            setNameError("Il nome è obbligatorio.");
            ok = false;
        }
        if (!customerPhone.trim()) {
            setPhoneError("Il telefono è obbligatorio.");
            ok = false;
        }
        const ps = parseInt(partySize, 10);
        if (!Number.isFinite(ps) || ps <= 0) {
            setPartyError("Inserisci un numero di coperti maggiore di zero.");
            ok = false;
        }
        if (!reservationDate) {
            setDateError("La data è obbligatoria.");
            ok = false;
        } else if (!isEditing && reservationDate < todayIsoDate()) {
            setDateError("La data non può essere nel passato.");
            ok = false;
        }
        if (!reservationTime) {
            setTimeError("L'ora è obbligatoria.");
            ok = false;
        }
        const email = customerEmail.trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setEmailError("Email non valida.");
            ok = false;
        }
        return ok;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        onSavingChange(true);
        try {
            const payload = {
                reservation_date: reservationDate,
                reservation_time: normalizeTime(reservationTime),
                party_size: parseInt(partySize, 10),
                customer_name: customerName.trim(),
                customer_email: customerEmail.trim(),
                customer_phone: customerPhone.trim(),
                notes: notes.trim() ? notes.trim() : null
            };

            if (isEditing && entityData) {
                await updateReservation(entityData.id, tenantId, payload);
                showToast({ message: "Prenotazione aggiornata.", type: "success" });
            } else {
                await createReservation(tenantId, {
                    activity_id: activityId,
                    ...payload
                });
                showToast({ message: "Prenotazione creata.", type: "success" });
            }
            await onSuccess();
        } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            if (code === "42501") {
                showToast({
                    message: "Permesso negato. Non puoi gestire prenotazioni su questa sede.",
                    type: "error"
                });
            } else if (code === "23514") {
                showToast({ message: "Dati non validi.", type: "error" });
            } else {
                const msg = err instanceof Error ? err.message : undefined;
                showToast({
                    message: msg || "Errore durante il salvataggio.",
                    type: "error"
                });
            }
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit} noValidate className={styles.reservationForm}>
            {isEditing ? (
                <div className={styles.reservationFormReadonlyField}>
                    <span className={styles.reservationFormReadonlyLabel}>Sede</span>
                    <span className={styles.reservationFormReadonlyValue}>
                        {activityName ?? "—"}
                    </span>
                </div>
            ) : (
                <Select
                    label="Sede"
                    required
                    value={activityId}
                    onChange={e => {
                        const next = e.target.value;
                        if (next === activityId) return;
                        setActivityId(next);
                        // Reset time when venue changes: the periods grid is
                        // computed from the new venue's hours/closures, so a
                        // previously-picked time may no longer match a slot.
                        if (reservationTime) setReservationTime("");
                    }}
                    disabled={onlyOneActivity}
                    error={activityError}
                    options={[
                        ...(activityId
                            ? []
                            : [{ value: "", label: "Seleziona una sede…" }]),
                        ...manageableActivities.map(a => ({ value: a.id, label: a.name }))
                    ]}
                />
            )}

            <div className={styles.reservationFormField}>
                <span className={styles.reservationFormLabel}>Data</span>
                <AdminReservationDatePicker
                    value={reservationDate}
                    onChange={iso => {
                        if (iso === reservationDate) return;
                        setReservationDate(iso);
                        // Reset time on date change for the same reason as
                        // above — keeps the picker's value coherent with the
                        // freshly-computed period grid.
                        if (reservationTime) setReservationTime("");
                    }}
                    hours={hours}
                    closures={closures}
                    allowPast={isEditing}
                    invalid={Boolean(dateError)}
                    errorId={dateError ? `${formId}-date-error` : undefined}
                />
                {dateError && (
                    <span id={`${formId}-date-error`} className={styles.fieldError}>
                        {dateError}
                    </span>
                )}
            </div>

            <div className={styles.reservationFormField}>
                <span className={styles.reservationFormLabel}>Ora</span>
                <AdminReservationTimePicker
                    value={reservationTime}
                    onChange={setReservationTime}
                    date={reservationDate}
                    hours={hours}
                    closures={closures}
                    loading={hoursLoading}
                    error={hoursError}
                    invalid={Boolean(timeError)}
                    errorId={timeError ? `${formId}-time-error` : undefined}
                />
                {timeError && (
                    <span id={`${formId}-time-error`} className={styles.fieldError}>
                        {timeError}
                    </span>
                )}
            </div>

            <NumberInput
                label="Coperti"
                required
                min={1}
                value={partySize}
                onChange={e => setPartySize(e.target.value)}
                error={partyError}
            />

            <TextInput
                label="Nome cliente"
                required
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="es. Mario Rossi"
                error={nameError}
            />

            <TextInput
                label="Telefono"
                required
                type="tel"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="es. +39 333 1234567"
                error={phoneError}
            />

            <TextInput
                label="Email"
                type="email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="opzionale"
                helperText="Facoltativa. Nessuna email viene inviata dal sistema."
                error={emailError}
            />

            <div className={styles.reservationFormField}>
                <label htmlFor={`${formId}-notes`} className={styles.reservationFormLabel}>
                    Note
                    <span className={styles.reservationFormLabelOptional}>opzionale</span>
                </label>
                <textarea
                    id={`${formId}-notes`}
                    className={styles.reservationFormTextarea}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="es. allergie, occasione speciale, tavolo all'aperto…"
                    maxLength={500}
                    rows={3}
                />
            </div>

            {overCapacityWarning && (
                <p role="alert" className={styles.capacityWarning}>
                    {overCapacityWarning}
                </p>
            )}
        </form>
    );
}
