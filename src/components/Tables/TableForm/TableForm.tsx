import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { TextInput } from "@/components/ui/Input/TextInput";
import { InputBase } from "@/components/ui/Input/InputBase";
import { Switch } from "@/components/ui/Switch/Switch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection/CollapsibleSection";
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

// 0/50/100 → fasce di lettura, non uguaglianze: protegge da valori messi a
// mano in SQL che non cadono esattamente su uno dei tre bottoni.
function priorityToBucket(raw: string): 0 | 50 | 100 {
    const n = Number(raw.trim());
    if (!Number.isFinite(n)) return 50;
    if (n >= 75) return 100;
    if (n <= 25) return 0;
    return 50;
}

const PRIORITY_OPTIONS: { value: 0 | 50 | 100; label: string }[] = [
    { value: 100, label: "Per primo" },
    { value: 50, label: "Normale" },
    { value: 0, label: "Per ultimo" }
];

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
    const [formPriority, setFormPriority] = useState<string>("50");
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
            setFormPriority(entityData.assignment_priority?.toString() ?? "50");
            setFormBookableOnline(entityData.bookable_online ?? true);
        } else {
            setFormLabel("");
            setFormZoneId(null);
            setFormSeats("");
            setFormMinSeats("");
            setFormMaxSeats("");
            setFormGroupId(null);
            setFormPriority("50");
            setFormBookableOnline(true);
        }
        setIsCreatingZone(false);
        setIsCreatingGroup(false);
    }, [entityData]);

    // I trigger di riassegnazione stanno su `reservations`, non su `tables`
    // (FASE 1, rischio 6): cambiare uno di questi campi non sposta le
    // prenotazioni già assegnate. Il drawer lo dice, non lo lascia intendere.
    const affectsAssignment =
        mode === "edit" &&
        entityData !== null &&
        (formSeats !== (entityData.seats?.toString() ?? "") ||
            formMinSeats !== (entityData.min_seats?.toString() ?? "") ||
            formMaxSeats !== (entityData.max_seats?.toString() ?? "") ||
            formGroupId !== entityData.combination_group_id ||
            formPriority !== (entityData.assignment_priority?.toString() ?? "50") ||
            formBookableOnline !== (entityData.bookable_online ?? true));

    // Sezione aperta di default se il tavolo ha già preferenze non-neutre:
    // chi le ha configurate le rivede subito, chi non le ha mai toccate non
    // trova una sezione vuota già spalancata.
    const groupsDefaultOpen = useMemo(() => {
        if (!entityData) return false;
        return (
            entityData.min_seats != null ||
            entityData.max_seats != null ||
            priorityToBucket(entityData.assignment_priority?.toString() ?? "50") !== 50
        );
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
        if (!trimmedSeats) {
            showToast({ message: "I posti sono obbligatori", type: "error" });
            return;
        }
        const seatsParsed = Number(trimmedSeats);
        if (!Number.isInteger(seatsParsed) || seatsParsed <= 0) {
            showToast({
                message: "I posti devono essere un numero intero positivo",
                type: "error"
            });
            return;
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
                    message: "I due estremi devono essere numeri interi positivi",
                    type: "error"
                });
                return;
            }
            if (minParsed !== null && maxParsed !== null && minParsed > maxParsed) {
                showToast({
                    message: "Il primo estremo non può superare il secondo",
                    type: "error"
                });
                return;
            }
            if (minParsed !== null && seatsParsed < minParsed) {
                showToast({
                    message: "I posti non possono essere meno del primo estremo",
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

            const priorityParsed = Number(formPriority.trim() || "50");
            if (
                !Number.isInteger(priorityParsed) ||
                priorityParsed < 0 ||
                priorityParsed > 100
            ) {
                showToast({
                    message: "L'ordine di scelta non è valido",
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
                    seats: seatsParsed,
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
            <TextInput
                label="Posti"
                required
                type="number"
                min={1}
                value={formSeats}
                onChange={e => setFormSeats(e.target.value)}
                placeholder="2"
                helperText="Quante persone ci stanno normalmente al tavolo."
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

            {/* Campi di assegnazione: solo se la sede prende prenotazioni.
                A chi usa i soli QR non servono e non compaiono. */}
            {reservationsEnabled && (
                <>
                    <div className={styles.formSectionTitle}>
                        <Text variant="body-sm" weight={600}>
                            Assegnazione prenotazioni
                        </Text>
                    </div>

                    {affectsAssignment && (
                        <InlineBanner variant="warning">
                            Questo cambia solo le assegnazioni future: le prenotazioni
                            già assegnate a questo tavolo restano dove sono. Per
                            spostarle usa &laquo;Riorganizza i tavoli&raquo; in
                            Prenotazioni.
                        </InlineBanner>
                    )}

                    <Switch
                        label="Assegnabile"
                        checked={formBookableOnline}
                        onChange={setFormBookableOnline}
                        helperText="Attivo per impostazione predefinita. Da spento, il motore di assegnazione automatica non lo propone più — ma resta assegnabile a mano dall'operatore in qualsiasi momento, non è escluso dalle prenotazioni."
                    />

                    <CollapsibleSection
                        label="Gruppi di persone e preferenze"
                        defaultOpen={groupsDefaultOpen}
                    >
                        <TextInput
                            label="Preferito da (opzionale)"
                            type="number"
                            min={1}
                            value={formMinSeats}
                            onChange={e => setFormMinSeats(e.target.value)}
                            placeholder="2"
                            helperText="Non è un vincolo. Sotto questo numero il tavolo viene proposto solo se non c'è nient'altro di adatto. Nell'accostamento di più tavoli non conta affatto."
                        />

                        <TextInput
                            label="Capienza massima (opzionale)"
                            type="number"
                            min={1}
                            value={formMaxSeats}
                            onChange={e => setFormMaxSeats(e.target.value)}
                            placeholder="6"
                            helperText="Questo sì è un tetto vero: sopra questo numero il tavolo non viene proposto. Vuoto = vale il numero di posti."
                        />

                        <InputBase
                            label="Ordine di scelta"
                            helperText="Il sistema propone comunque il tavolo della misura più adatta: questa impostazione conta solo quando due tavoli vanno bene allo stesso modo."
                        >
                            {() => (
                                <SegmentedControl
                                    value={priorityToBucket(formPriority)}
                                    onChange={v => setFormPriority(String(v))}
                                    options={PRIORITY_OPTIONS}
                                />
                            )}
                        </InputBase>
                    </CollapsibleSection>

                    <CombinationGroupSelectField
                        tenantId={tenantId}
                        activityId={activityId}
                        value={formGroupId}
                        onChange={setFormGroupId}
                        onModeChange={m => setIsCreatingGroup(m === "create")}
                        label="Gruppo di accostamento (opzionale)"
                    />
                </>
            )}
        </form>
    );
}
