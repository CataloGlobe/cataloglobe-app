import { type FormEvent, useEffect, useState } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { DateInput } from "@/components/ui/Input/DateInput";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { Select } from "@/components/ui/Select/Select";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createReservation,
    updateReservation
} from "@/services/supabase/reservations";
import type { V2Reservation } from "@/types/reservation";
import type { V2Activity } from "@/types/activity";
import styles from "./Reservations.module.scss";

interface FormActivity {
    id: V2Activity["id"];
    name: V2Activity["name"];
}

interface ReservationFormProps {
    formId: string;
    mode: "create" | "edit";
    tenantId: string;
    /** Sedi su cui il caller ha `reservations.manage`. In create mode: usate
     *  per popolare il Select. In edit mode: solo per risolvere il nome. */
    manageableActivities: FormActivity[];
    /** Riga corrente in edit mode. */
    entityData?: V2Reservation;
    onSuccess: () => void | Promise<void>;
    onSavingChange: (saving: boolean) => void;
}

function todayIsoDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

    const activityName =
        manageableActivities.find(a => a.id === activityId)?.name ?? null;

    const onlyOneActivity = manageableActivities.length === 1;

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
                    onChange={e => setActivityId(e.target.value)}
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

            <div className={styles.reservationFormRow}>
                <DateInput
                    label="Data"
                    required
                    value={reservationDate}
                    min={isEditing ? undefined : todayIsoDate()}
                    onChange={e => setReservationDate(e.target.value)}
                    error={dateError}
                />
                <TimeInput
                    label="Ora"
                    required
                    value={reservationTime}
                    onChange={e => setReservationTime(e.target.value)}
                    error={timeError}
                />
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
        </form>
    );
}
