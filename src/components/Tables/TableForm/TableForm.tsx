import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { createTable, updateTable } from "@/services/supabase/tables";
import type { V2Table } from "@/types/orders";

import { ZoneSelectField } from "@/components/Tables/ZoneSelectField/ZoneSelectField";
import { CombinationGroupSelectField } from "@/components/Tables/CombinationGroupSelectField/CombinationGroupSelectField";

import styles from "@/components/Tables/TablesManagement/TablesManagement.module.scss";

export interface TableFormProps {
    formId: string;
    mode: "create" | "edit";
    entityData: V2Table | null;
    tenantId: string;
    activityId: string;
    /** Gate dei campi di assegnazione — vedi `TablesManagementProps.reservationsEnabled`. */
    reservationsEnabled: boolean;
    /** Bump quando le zone cambiano fuori dal dropdown (drawer gestione zone):
     *  forza reload del select via key remount. */
    zoneReloadKey: number;
    onSuccess: () => Promise<void> | void;
    onSavingChange: (saving: boolean) => void;
}

export function TableForm({
    formId,
    mode,
    entityData,
    tenantId,
    activityId,
    reservationsEnabled,
    zoneReloadKey,
    onSuccess,
    onSavingChange
}: TableFormProps) {
    const { showToast } = useToast();

    const [formLabel, setFormLabel] = useState("");
    const [formZoneId, setFormZoneId] = useState<string | null>(null);
    const [formSeats, setFormSeats] = useState<string>("");
    // Campi prenotazione. Stringhe vuote = "non dichiarato" (NULL a DB).
    const [formMinSeats, setFormMinSeats] = useState<string>("");
    const [formMaxSeats, setFormMaxSeats] = useState<string>("");
    const [formGroupId, setFormGroupId] = useState<string | null>(null);
    const [formPriority, setFormPriority] = useState<string>("0");
    const [formBookableOnline, setFormBookableOnline] = useState(true);
    // Guardrail: true mentre il mini-form "Crea zona"/"Crea gruppo" e' aperto.
    // Blocca submit per evitare creazione tavolo con zone_id/gruppo mancante
    // mentre l'utente sta ancora compilando la nuova entita'.
    const [isCreatingZone, setIsCreatingZone] = useState(false);
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);

    useEffect(() => {
        if (entityData) {
            setFormLabel(entityData.label);
            setFormZoneId(entityData.zone_id);
            setFormSeats(entityData.seats?.toString() ?? "");
            setFormMinSeats(entityData.min_seats?.toString() ?? "");
            setFormMaxSeats(entityData.max_seats?.toString() ?? "");
            setFormGroupId(entityData.combination_group_id);
            setFormPriority(entityData.assignment_priority?.toString() ?? "0");
            setFormBookableOnline(entityData.bookable_online ?? true);
        } else {
            setFormLabel("");
            setFormZoneId(null);
            setFormSeats("");
            setFormMinSeats("");
            setFormMaxSeats("");
            setFormGroupId(null);
            setFormPriority("0");
            setFormBookableOnline(true);
        }
        setIsCreatingZone(false);
        setIsCreatingGroup(false);
    }, [entityData]);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (isCreatingZone) {
            showToast({
                message:
                    "Conferma o annulla la creazione zona prima di salvare il tavolo",
                type: "error"
            });
            return;
        }
        if (isCreatingGroup) {
            showToast({
                message:
                    "Conferma o annulla la creazione del gruppo prima di salvare il tavolo",
                type: "error"
            });
            return;
        }
        if (!tenantId || !activityId) return;
        if (!formLabel.trim()) {
            showToast({ message: "Il nome del tavolo è obbligatorio", type: "error" });
            return;
        }

        const trimmedSeats = formSeats.trim();
        let seatsParsed: number | undefined = undefined;
        if (trimmedSeats.length > 0) {
            const n = Number(trimmedSeats);
            if (!Number.isInteger(n) || n <= 0) {
                showToast({
                    message: "I posti devono essere un numero intero positivo",
                    type: "error"
                });
                return;
            }
            seatsParsed = n;
        }

        // Campi prenotazione: validati e inviati SOLO se la sede prenota. Con
        // le prenotazioni spente il form non li mostra, e non vanno scritti —
        // un update con i valori del form azzererebbe quanto configurato prima
        // di disattivarle.
        let reservationFields: {
            min_seats: number | null;
            max_seats: number | null;
            combination_group_id: string | null;
            assignment_priority: number;
            bookable_online: boolean;
        } | null = null;

        if (reservationsEnabled) {
            const parseOptionalCount = (raw: string): number | null | "invalid" => {
                const trimmed = raw.trim();
                if (trimmed.length === 0) return null;
                const n = Number(trimmed);
                return Number.isInteger(n) && n > 0 ? n : "invalid";
            };

            const minParsed = parseOptionalCount(formMinSeats);
            const maxParsed = parseOptionalCount(formMaxSeats);
            if (minParsed === "invalid" || maxParsed === "invalid") {
                showToast({
                    message:
                        "Capienza minima e massima devono essere numeri interi positivi",
                    type: "error"
                });
                return;
            }
            if (minParsed !== null && maxParsed !== null && minParsed > maxParsed) {
                showToast({
                    message: "La capienza minima non può superare la massima",
                    type: "error"
                });
                return;
            }
            if (seatsParsed !== undefined) {
                if (minParsed !== null && seatsParsed < minParsed) {
                    showToast({
                        message: "I posti non possono essere meno della capienza minima",
                        type: "error"
                    });
                    return;
                }
                if (maxParsed !== null && seatsParsed > maxParsed) {
                    showToast({
                        message: "I posti non possono superare la capienza massima",
                        type: "error"
                    });
                    return;
                }
            }

            const priorityParsed = Number(formPriority.trim() || "0");
            if (
                !Number.isInteger(priorityParsed) ||
                priorityParsed < 0 ||
                priorityParsed > 100
            ) {
                showToast({
                    message: "La priorità deve essere un numero intero fra 0 e 100",
                    type: "error"
                });
                return;
            }

            reservationFields = {
                min_seats: minParsed,
                max_seats: maxParsed,
                combination_group_id: formGroupId,
                assignment_priority: priorityParsed,
                bookable_online: formBookableOnline
            };
        }

        onSavingChange(true);
        try {
            if (mode === "edit" && entityData) {
                await updateTable(entityData.id, tenantId, {
                    label: formLabel.trim(),
                    zone_id: formZoneId,
                    seats: seatsParsed ?? null,
                    ...(reservationFields ?? {})
                });
                showToast({ message: "Tavolo aggiornato", type: "success" });
            } else {
                await createTable(tenantId, {
                    activity_id: activityId,
                    label: formLabel.trim(),
                    zone_id: formZoneId,
                    seats: seatsParsed,
                    ...(reservationFields ?? {})
                });
                showToast({ message: "Tavolo creato", type: "success" });
            }
            await onSuccess();
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_LABEL_CONFLICT") {
                showToast({
                    message: "Esiste già un tavolo con questo nome in questa sede",
                    type: "error"
                });
            } else {
                showToast({ message: "Errore durante il salvataggio", type: "error" });
            }
        } finally {
            onSavingChange(false);
        }
    }

    return (
        <form id={formId} onSubmit={handleSubmit} className={styles.form}>
            <TextInput
                label="Nome tavolo"
                required
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                placeholder="es. T1, Tavolo 5, Sala A-3"
            />
            <ZoneSelectField
                // key remount per forzare refresh lista zone post-CRUD drawer.
                key={`zone-select-${zoneReloadKey}`}
                tenantId={tenantId}
                activityId={activityId}
                value={formZoneId}
                onChange={setFormZoneId}
                onModeChange={m => setIsCreatingZone(m === "create")}
                label="Zona (opzionale)"
            />
            <TextInput
                label="Posti (opzionale)"
                type="number"
                min={1}
                value={formSeats}
                onChange={e => setFormSeats(e.target.value)}
                placeholder="2"
                helperText={
                    reservationsEnabled
                        ? "Posti apparecchiati di norma. Se lo lasci vuoto la capienza del tavolo resta sconosciuta e le prenotazioni non gli vengono assegnate in automatico."
                        : "Posti apparecchiati di norma."
                }
            />

            {/* Campi di assegnazione: solo se la sede prende prenotazioni.
                A chi usa i soli QR non servono e non compaiono. */}
            {reservationsEnabled && (
                <>
                    <div className={styles.formSectionTitle}>
                        <Text variant="body-sm" weight={600}>
                            Assegnazione prenotazioni
                        </Text>
                    </div>

                    <TextInput
                        label="Capienza minima (opzionale)"
                        type="number"
                        min={1}
                        value={formMinSeats}
                        onChange={e => setFormMinSeats(e.target.value)}
                        placeholder="2"
                        helperText="Sotto questo numero il tavolo non viene proposto: evita la coppia al tavolo grande. Vuoto = nessun minimo, va bene qualsiasi gruppo che ci stia."
                    />

                    <TextInput
                        label="Capienza massima (opzionale)"
                        type="number"
                        min={1}
                        value={formMaxSeats}
                        onChange={e => setFormMaxSeats(e.target.value)}
                        placeholder="6"
                        helperText="Massimo raggiungibile aggiungendo sedie. Vuoto = nessuna sedia in più, il tetto resta il numero di posti."
                    />

                    <CombinationGroupSelectField
                        tenantId={tenantId}
                        activityId={activityId}
                        value={formGroupId}
                        onChange={setFormGroupId}
                        onModeChange={m => setIsCreatingGroup(m === "create")}
                        label="Gruppo di accostamento (opzionale)"
                    />

                    <TextInput
                        label="Priorità di assegnazione"
                        type="number"
                        min={0}
                        max={100}
                        value={formPriority}
                        onChange={e => setFormPriority(e.target.value)}
                        placeholder="0"
                        helperText="Da 0 a 100: a parità di condizioni viene scelto prima il tavolo con il numero più alto. Lascia 0 se non hai preferenze — tutti i tavoli restano pari."
                    />

                    <Switch
                        label="Prenotabile online"
                        checked={formBookableOnline}
                        onChange={setFormBookableOnline}
                        helperText="Attivo per impostazione predefinita. Disattivalo per tenere il tavolo ai clienti che arrivano senza prenotare: resta assegnabile a mano, ma il sistema non lo propone mai."
                    />
                </>
            )}
        </form>
    );
}
